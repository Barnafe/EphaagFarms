// Money out. Once the last approval is given the system pays by Paystack transfer, with no manual step.
// Safeguards (set by the admin): a pause switch and a daily cap. A payout is never sent twice
// (one payout per loan / withdrawal / ROI record), a missing bank account holds it until one is added,
// and anything that fails raises an alert for the admins and can be retried.
import { pool, detached } from "../db/pool.js";
import { getSetting, setSetting } from "../utils/settings.js";
import { notifyUser } from "./messaging.js";
import { notifyAttention } from "../jobs/alerts.js";
import { paystackConfigured, initiateTransfer, fetchTransfer } from "./paystack.js";
import { registerTemplate, escapeHtml } from "./messageTemplates.js";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
export const PAYOUT_LABEL = {
  loan_disbursement: "Loan disbursement", savings_withdrawal: "Savings withdrawal", share_interest: "Share interest withdrawal",
  share_capital: "Share capital withdrawal", roi_payout: "Investment ROI payout", produce_settlement: "Produce settlement",
};

const handlers = new Map();
/** Each kind says what "paid" means for the thing being paid (a loan becomes disbursed, and so on). */
export function registerPayoutKind(kind, { onPaid } = {}) { handlers.set(kind, { onPaid }); }

const ref = (n = 0) => `PO-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}${n ? `-R${n}` : ""}`;

export async function payoutSettings(runner = pool) {
  const paused = (await getSetting("payouts_paused", false, runner)) === true;
  const cap = await getSetting("payouts_daily_cap", null, runner);
  const { rows } = await runner.query(`SELECT COALESCE(SUM(amount),0) AS n FROM payouts WHERE sent_at::date = CURRENT_DATE AND status IN ('processing','success')`);
  return { paused, dailyCap: cap === null || cap === undefined || cap === "" ? null : Number(cap), sentToday: Number(rows[0].n) };
}
export async function savePayoutSettings({ paused, dailyCap }, adminId) {
  if (paused !== undefined) await setSetting("payouts_paused", !!paused, adminId);
  if (dailyCap !== undefined) await setSetting("payouts_daily_cap", dailyCap === null || dailyCap === "" ? null : Number(dailyCap), adminId);
}

/** Queue a payout. Safe to call twice for the same thing: the second call returns the first payout. */
export async function createPayout({ kind, userId, subjectId, amount, meta = {}, runner = pool }) {
  const { rows } = await runner.query(
    `INSERT INTO payouts (kind, user_id, subject_id, amount, reference, meta) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (kind, subject_id) DO NOTHING RETURNING *`, [kind, userId, subjectId, amount, ref(), JSON.stringify(meta)]);
  if (rows[0]) return { payout: rows[0], created: true };
  const { rows: ex } = await runner.query(`SELECT * FROM payouts WHERE kind = $1 AND subject_id = $2`, [kind, subjectId]);
  return { payout: ex[0], created: false };
}
/** Start sending right away without making the caller wait (the scheduled job also sweeps). */
export function kickPayouts() { detached(() => runPayouts().catch((e) => console.error("[payouts]", e.message))); }

async function finish(payout, data) {
  const client = await pool.connect();
  let done = false;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM payouts WHERE id = $1 FOR UPDATE`, [payout.id]);
    if (!rows[0] || rows[0].status === "success") { await client.query("ROLLBACK"); return false; }
    await client.query(`UPDATE payouts SET status = 'success', transfer_code = COALESCE($2, transfer_code), completed_at = now(), updated_at = now(), failure_reason = NULL WHERE id = $1`, [payout.id, data?.transfer_code || null]);
    await handlers.get(payout.kind)?.onPaid?.(rows[0], client);
    await client.query("COMMIT");
    done = true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { client.release(); }
  if (done) await notifyUser(payout.user_id, "payout_sent", { label: PAYOUT_LABEL[payout.kind], amount: Number(payout.amount), reference: payout.reference }, { allChannels: true }).catch(() => {});
  return done;
}

async function fail(payout, reason) {
  const { rowCount } = await pool.query(`UPDATE payouts SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1 AND status IN ('processing','queued','held')`, [payout.id, String(reason || "the transfer failed").slice(0, 300)]);
  if (!rowCount) return;
  const { rows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [payout.user_id]);
  await notifyAttention("payout_failed", { label: PAYOUT_LABEL[payout.kind], name: rows[0]?.name || "", amount: Number(payout.amount), reference: payout.reference, reason: String(reason || "the transfer failed") }, null).catch(() => {});
  await notifyUser(payout.user_id, "payout_delayed", { label: PAYOUT_LABEL[payout.kind], amount: Number(payout.amount) }).catch(() => {});
}

/** Called by the webhook and by the re-check: Paystack says how a transfer ended. */
export async function settleTransfer(reference, status, detail = {}) {
  const { rows } = await pool.query(`SELECT * FROM payouts WHERE reference = $1`, [reference]);
  const p = rows[0];
  if (!p) return { found: false };
  if (status === "success") await finish(p, detail);
  else if (["failed", "reversed"].includes(status)) await fail(p, detail.reason || detail.failures || `the transfer was ${status}`);
  return { found: true };
}

/** Send what is waiting, within the pause switch and the daily cap. */
export async function runPayouts() {
  const out = { sent: 0, held: 0, failed: 0, unreachable: 0, paused: false };
  if (!paystackConfigured()) return { ...out, notConfigured: true };
  const st = await payoutSettings();
  if (st.paused) return { ...out, paused: true };
  let sentToday = st.sentToday;
  // Payouts still waiting for a bank account are left alone until the person adds one, so they never crowd out the rest.
  const { rows } = await pool.query(
    `SELECT p.* FROM payouts p
      WHERE p.status = 'queued'
         OR (p.status = 'held' AND (p.hold_reason = 'daily_cap' OR EXISTS (SELECT 1 FROM bank_accounts b WHERE b.user_id = p.user_id)))
      ORDER BY p.created_at ASC LIMIT 100`);
  for (const p of rows) {
    const { rows: b } = await pool.query(`SELECT recipient_code FROM bank_accounts WHERE user_id = $1`, [p.user_id]);
    if (!b[0]) {
      await pool.query(`UPDATE payouts SET status = 'held', hold_reason = 'no_bank_account', updated_at = now() WHERE id = $1`, [p.id]);
      const { rowCount } = await pool.query(`UPDATE payouts SET hold_notified_at = now() WHERE id = $1 AND hold_notified_at IS NULL`, [p.id]);
      if (rowCount) await notifyUser(p.user_id, "payout_needs_bank", { label: PAYOUT_LABEL[p.kind], amount: Number(p.amount) }, { allChannels: true }).catch(() => {});
      out.held++; continue;
    }
    if (st.dailyCap !== null && sentToday + Number(p.amount) > st.dailyCap) {
      const first = p.hold_reason !== "daily_cap";
      await pool.query(`UPDATE payouts SET status = 'held', hold_reason = 'daily_cap', updated_at = now() WHERE id = $1`, [p.id]);
      if (first) await notifyAttention("payout_held_cap", { label: PAYOUT_LABEL[p.kind], amount: Number(p.amount), cap: st.dailyCap }, null).catch(() => {});
      out.held++; continue;
    }
    const { rows: claim } = await pool.query(
      `UPDATE payouts SET status = 'processing', hold_reason = NULL, sent_at = now(), attempts = attempts + 1, updated_at = now() WHERE id = $1 AND status IN ('queued','held') RETURNING *`, [p.id]);
    if (!claim[0]) continue;
    let data;
    try {
      data = await initiateTransfer({ amountNaira: Number(p.amount), recipientCode: b[0].recipient_code, reference: p.reference, reason: PAYOUT_LABEL[p.kind] });
    } catch {
      // Paystack could not be reached: nothing was sent, so put it back and try on the next run.
      await pool.query(`UPDATE payouts SET status = 'queued', sent_at = NULL, attempts = attempts - 1, updated_at = now() WHERE id = $1`, [p.id]);
      out.unreachable++; break;
    }
    sentToday += Number(p.amount);
    if (data.status === "success") { await finish(p, data); out.sent++; }
    else if (["failed", "reversed"].includes(data.status) || data.ok === false) { await fail(p, data.failures || data.message || "the transfer failed"); out.failed++; sentToday -= Number(p.amount); }
    else { await pool.query(`UPDATE payouts SET transfer_code = $2 WHERE id = $1`, [p.id, data.transfer_code || null]); out.sent++; } // pending: the webhook / re-check settles it
  }
  return out;
}

/** Transfers still pending after a few minutes: ask Paystack (covers a lost webhook). */
export async function recheckProcessingPayouts() {
  const { rows } = await pool.query(`SELECT * FROM payouts WHERE status = 'processing' AND sent_at < now() - interval '2 minutes' ORDER BY sent_at ASC LIMIT 50`);
  let settled = 0;
  for (const p of rows) {
    const d = await fetchTransfer(p.reference).catch(() => null);
    if (!d) continue;
    if (["success", "failed", "reversed"].includes(d.status)) { await settleTransfer(p.reference, d.status, d); settled++; }
  }
  return { checked: rows.length, settled };
}

/** Admin: a failed payout goes back in the queue with a new Paystack reference. */
export async function retryPayout(id) {
  const { rows } = await pool.query(`SELECT attempts FROM payouts WHERE id = $1 AND status = 'failed'`, [id]);
  if (!rows[0]) return false;
  await pool.query(`UPDATE payouts SET status = 'queued', reference = $2, failure_reason = NULL, hold_reason = NULL, updated_at = now() WHERE id = $1`, [id, ref(rows[0].attempts)]);
  kickPayouts();
  return true;
}

// ---- messages ----------------------------------------------------------------------------------
registerTemplate("payout_sent", (d) => ({
  subject: `${d.label}: ${naira(d.amount)} sent to your bank account`,
  title: "Money sent",
  html: `<p>${escapeHtml(d.label)}: <strong>${naira(d.amount)}</strong> has been sent to your bank account. Reference ${escapeHtml(d.reference)}.</p>`,
  sms: `EPHAAG: ${d.label} of ${naira(d.amount)} has been sent to your bank account.`,
}), { label: "Savings withdrawal", amount: 50000, reference: "PO-1" });
registerTemplate("payout_needs_bank", (d) => ({
  subject: `Add your bank account to receive ${naira(d.amount)}`,
  title: "We need your bank account",
  html: `<p>${escapeHtml(d.label)} of <strong>${naira(d.amount)}</strong> is ready, but we have no bank account for you. Add your bank details once in your account and the money is sent automatically.</p>`,
  sms: `EPHAAG: ${d.label} of ${naira(d.amount)} is ready. Add your bank account in the app to receive it.`,
}), { label: "Loan disbursement", amount: 100000 });
registerTemplate("payout_delayed", (d) => ({
  subject: `${d.label} of ${naira(d.amount)} is delayed`,
  title: "Your payment is delayed",
  html: `<p>${escapeHtml(d.label)} of <strong>${naira(d.amount)}</strong> could not be sent yet. We have been told and are sorting it out; nothing is lost.</p>`,
  sms: `EPHAAG: ${d.label} of ${naira(d.amount)} is delayed. We are sorting it out; nothing is lost.`,
}), { label: "Loan disbursement", amount: 100000 });
registerTemplate("payout_failed", (d) => ({
  subject: `[Needs attention] A payout failed: ${naira(d.amount)}`,
  title: "A payout failed",
  html: `<p>A transfer could not be completed. Fix the cause (for example top up the Paystack balance) and retry it in Finance > Payouts.</p>
<table role="presentation"><tr><td>Payout</td><td><strong>${escapeHtml(d.label)}</strong></td></tr><tr><td>To</td><td><strong>${escapeHtml(d.name)}</strong></td></tr><tr><td>Amount</td><td><strong>${naira(d.amount)}</strong></td></tr><tr><td>Reason</td><td><strong>${escapeHtml(d.reason)}</strong></td></tr><tr><td>Reference</td><td><strong>${escapeHtml(d.reference)}</strong></td></tr></table>`,
}), { label: "Loan disbursement", name: "Aminu", amount: 100000, reason: "Insufficient balance", reference: "PO-1" });
registerTemplate("payout_held_cap", (d) => ({
  subject: `[Needs attention] A payout is waiting: daily cap reached`,
  title: "Daily payout cap reached",
  html: `<p>${escapeHtml(d.label)} of <strong>${naira(d.amount)}</strong> is waiting because the daily payout cap of ${naira(d.cap)} would be exceeded. It is sent automatically tomorrow, or raise the cap in Finance > Payouts.</p>`,
}), { label: "Loan disbursement", amount: 100000, cap: 200000 });

// ---- what "paid" means for each kind -----------------------------------------------------------
registerPayoutKind("loan_disbursement", {
  async onPaid(p, client) {
    const { rowCount } = await client.query(`UPDATE loans SET status = 'disbursed' WHERE id = $1 AND status = 'approved'`, [p.subject_id]);
    if (rowCount) await client.query(`INSERT INTO loan_status_history (loan_id, from_status, to_status, actor_id, note) VALUES ($1,'approved','disbursed',NULL,'Funds sent by Paystack transfer')`, [p.subject_id]);
  },
});
registerPayoutKind("savings_withdrawal", {
  async onPaid(p, client) { await client.query(`UPDATE savings_withdrawals SET status = 'paid', handled_at = COALESCE(handled_at, now()) WHERE id = $1`, [p.subject_id]); },
});
registerPayoutKind("share_interest", {});
registerPayoutKind("share_capital", {});
registerPayoutKind("roi_payout", {});
registerPayoutKind("produce_settlement", {
  async onPaid(p, client) { await client.query(`UPDATE payments SET status = 'paid' WHERE id = $1`, [p.subject_id]); },
});
