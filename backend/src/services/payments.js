import { pool, detached } from "../db/pool.js";
import { generateReference } from "../utils/reference.js";
import { getSetting } from "../utils/settings.js";
import { notifyUser, sendMail } from "./messaging.js";
import { notifyAttention } from "../jobs/alerts.js";
import { renderTemplate } from "./messageTemplates.js";
import { calculateFee, getFeeConfig, initializeTransaction, verifyTransaction, toKobo, callbackUrl } from "./paystack.js";
import { logSecurityEvent } from "../utils/securityLog.js";

// ---------------------------------------------------------------------------
// One ledger (gateway_payments) for every kind of Paystack payment. Each kind
// ("type") registers a handler that says what happens once money is verified.
//   apply(payment, client)   -> { refuse?: {reason}, flags?: [{kind:'review',reason,detail}], after?: async () => {} }
//   onRefused(payment, reason, client)   (optional)
// ---------------------------------------------------------------------------
const handlers = new Map();
export function registerPaymentType(type, handler) { handlers.set(type, handler); }

export const PAYMENT_PREFIX = { order: "OPR", commitment: "CMT", share: "SPR", investment: "IPR", consultancy: "CNS", savings: "SVP", repayment: "RPY", boost_deposit: "BDP" };

export const TYPE_LABEL = {
  order: "Order", share: "Share", commitment: "Commitment", corps_fee: "NYSC AGROALLIED SAED fee", investment: "Investment",
  consultancy: "Consultancy", savings: "Savings", repayment: "Repayment", boost_deposit: "Boost deposit",
};

const httpErr = (message, status = 400) => Object.assign(new Error(message), { status, expose: status >= 500 });

/** Insert a payment row (the fee is worked out here, on the server, never by the browser). */
export async function createPayment({ client = pool, type, userId, subjectId = null, netAmount, meta = {}, reference: fixedReference = null }) {
  const cfg = await getFeeConfig(client); // the caller's own connection: never ask the pool while one is held
  const { net, fee, gross } = calculateFee(netAmount, cfg);
  const reference = fixedReference || generateReference(PAYMENT_PREFIX[type] || "PAY") + Math.random().toString(36).slice(2, 5).toUpperCase();
  const { rows } = await client.query(
    `INSERT INTO gateway_payments (reference, type, user_id, subject_id, net_amount, fee_amount, gross_amount, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [reference, type, userId, subjectId, net, fee, gross, JSON.stringify(meta)]
  );
  return rows[0];
}

/** Start Paystack's hosted checkout for a saved payment. */
export async function startCheckout(payment, { email, returnPath }) {
  const data = await initializeTransaction({
    email, amountNaira: payment.gross_amount, reference: payment.reference,
    callbackUrl: callbackUrl(`${returnPath}${returnPath.includes("?") ? "&" : "?"}reference=${encodeURIComponent(payment.reference)}`),
    metadata: { type: payment.type, subject_id: payment.subject_id, user_id: payment.user_id },
  });
  const { rows } = await pool.query(
    `UPDATE gateway_payments SET authorization_url = $2, status = 'pending', updated_at = now() WHERE id = $1 RETURNING *`,
    [payment.id, data.authorization_url]
  );
  return rows[0];
}

// ---- verification -----------------------------------------------------------
// Pure check of what Paystack says against what we asked for.
export function checkAgainstPayment(data, payment) {
  if (!data) return { ok: false, code: "no_data" };
  if (data.reference && data.reference !== payment.reference) return { ok: false, code: "reference" };
  if (data.status !== "success") return { ok: false, code: "not_success", status: data.status };
  if (data.currency && data.currency !== payment.currency) return { ok: false, code: "currency_mismatch" };
  if (Number(data.amount) !== toKobo(payment.gross_amount)) return { ok: false, code: "amount_mismatch" };
  return { ok: true };
}

async function addFlag(client, paymentId, { kind, reason, detail = null }) {
  await client.query(`INSERT INTO payment_flags (payment_id, kind, reason, detail) VALUES ($1,$2,$3,$4)`, [paymentId, kind, reason, detail]);
}

/**
 * Settle a payment from a Paystack result. Safe to call any number of times
 * and from any of the three entry points (webhook, return-page check, scheduled
 * re-check): the row is locked, and a payment that is already settled is a no-op,
 * so a payment is never counted twice.
 * `data` is Paystack's transaction object (from a webhook or a verify call).
 *
 * There is no manual decision step. Money that cannot be used (wrong amount or
 * currency, an order that expired or was cancelled, a second payment for an
 * order that is already paid) is REFUSED on the spot: the item is untouched,
 * the payer is told, and the payment is queued for refund.
 */
export async function settlePayment(reference, data, { source = "verify" } = {}) {
  const client = await pool.connect();
  let after = null;
  let result;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM gateway_payments WHERE reference = $1 FOR UPDATE", [reference]);
    const payment = rows[0];
    if (!payment) { await client.query("ROLLBACK"); return { found: false }; }
    if (["success", "refused"].includes(payment.status)) { await client.query("ROLLBACK"); return { found: true, already: true, payment }; }

    const check = checkAgainstPayment(data, payment);
    if (!check.ok) {
      if (check.code === "not_success") {
        // Paystack reports a payment nobody has completed yet as "abandoned", and the
        // buyer may still pay it, so only a real failure or reversal is final.
        if (["failed", "reversed"].includes(data?.status)) {
          await client.query(`UPDATE gateway_payments SET status = 'failed', updated_at = now() WHERE id = $1`, [payment.id]);
          await client.query("COMMIT");
          return { found: true, payment: { ...payment, status: "failed" }, outcome: "failed" };
        }
        if (data?.channel && data.channel !== payment.channel) {
          await client.query(`UPDATE gateway_payments SET channel = $2, updated_at = now() WHERE id = $1`, [payment.id, data.channel]);
        }
        await client.query("COMMIT");
        return { found: true, payment: { ...payment, channel: data?.channel || payment.channel }, outcome: "pending" };
      }
      if (check.code === "reference" || check.code === "no_data") { await client.query("ROLLBACK"); return { found: true, payment, outcome: "pending" }; }
      // Money arrived but not the amount/currency we asked for: refuse it.
      const refused = await refuseInTx(client, payment, check.code, data);
      await client.query("COMMIT");
      client.release(); // the notices need the pool, so hand this connection back first
      detached(() => refused.after().catch((e) => console.error("[payments] after-hook failed:", e.message)));
      return { found: true, payment: refused.payment, outcome: "refused", refusalReason: check.code };
    }

    // Valid. Let the payment's type decide what that means.
    const { rows: upd } = await client.query(
      `UPDATE gateway_payments SET status = 'success', paid_amount = $2, provider_ref = $3, channel = $4,
              paid_at = COALESCE($5::timestamptz, now()), updated_at = now() WHERE id = $1 RETURNING *`,
      [payment.id, Number(data.amount) / 100, String(data.id ?? ""), data.channel || null, data.paid_at || null]);
    let paid = upd[0];
    const h = handlers.get(paid.type);
    // Never mark money as received if nothing knows what to do with it: roll back and let the next
    // check (or a deploy that registers the handler) settle it.
    if (!h?.apply) throw new Error(`No payment handler is registered for type "${paid.type}"`);
    const out = (await h.apply(paid, client, data)) || {};
    if (out.refuse) {
      const refused = await refuseInTx(client, paid, out.refuse.reason, data);
      await client.query("COMMIT");
      client.release();
      detached(() => refused.after().catch((e) => console.error("[payments] after-hook failed:", e.message)));
      return { found: true, payment: refused.payment, outcome: "refused", refusalReason: out.refuse.reason };
    }
    for (const f of out.flags || []) await addFlag(client, paid.id, f); // review-only flags: informational
    after = out.after || null;
    await client.query("COMMIT");
    result = { found: true, payment: paid, outcome: "success", source };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (after) detached(() => after().catch((e) => console.error("[payments] after-hook failed:", e.message)));
  return result;
}

/**
 * Ask Paystack what happened to a reference and settle it. Used by the return
 * page, the pending-payment checks and the scheduled re-check.
 * Returns the settlePayment result, or { unreachable: true } when Paystack cannot be asked
 * (not configured, network down, or it did not answer): nothing is changed in that case.
 */
export async function verifyAndSettle(reference, { source = "verify" } = {}) {
  let data = null;
  try { data = await verifyTransaction(reference); } catch { data = null; }
  if (!data) return { found: true, outcome: "pending", unreachable: true };
  return settlePayment(reference, data, { source });
}

const REFUSAL_TEXT = {
  amount_mismatch: "the amount paid did not match the amount due",
  currency_mismatch: "the payment was not in Naira",
  order_expired: "the order had already expired",
  order_cancelled: "the order had been cancelled",
  duplicate_payment: "this had already been paid",
  no_buyer_profile: "no buyer profile was found for the account",
  purchase_expired: "the share purchase had already expired",
  purchase_cancelled: "the share purchase had been cancelled",
  purchase_missing: "the payment could not be matched to anything to pay for",
  payment_cancelled: "the payment had been cancelled",
  quote_expired: "the late fee had increased since you agreed to it",
  payment_closed: "the payment had already been closed",
  investment_closed: "the investment is no longer waiting for this payment",
  loan_closed: "the loan is not open for repayment (it is fully repaid or not active)",
  amount_exceeds_balance: "the amount is more than what is still owed",
};
export const refusalText = (code) => REFUSAL_TEXT[code] || "the payment could not be applied";

// Marks the payment refused (inside the caller's transaction) and returns the notices to send afterwards.
async function refuseInTx(client, payment, reason, data) {
  const paidAmount = data ? Number(data.amount) / 100 : Number(payment.gross_amount);
  const { rows } = await client.query(
    `UPDATE gateway_payments SET status = 'refused', refusal_reason = $2, refund_status = 'due', paid_amount = $3,
            provider_ref = COALESCE($4, provider_ref), channel = COALESCE($5, channel), paid_at = COALESCE(paid_at, now()), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [payment.id, reason, paidAmount, data?.id ? String(data.id) : null, data?.channel || null]);
  const refused = rows[0];
  const h = handlers.get(refused.type);
  if (h?.onRefused) await h.onRefused(refused, reason, client);
  return {
    payment: refused,
    after: async () => {
      const { rows: u } = await pool.query("SELECT name FROM users WHERE id = $1", [refused.user_id]);
      if (refused.user_id) {
        await notifyUser(refused.user_id, "payment_refused", { reference: refused.reference, amount: Number(refused.paid_amount ?? refused.gross_amount), reasonText: refusalText(reason) });
      }
      // Exceptional case: tell every admin straight away. It waits under "Needs attention" in the Refund room.
      await notifyAttention("payment_attention", { typeLabel: TYPE_LABEL[refused.type] || refused.type, payer: u[0]?.name || "payer", reference: refused.reference, amount: Number(refused.paid_amount ?? refused.gross_amount), reasonText: refusalText(reason) },
        `EPHAAG: a ${TYPE_LABEL[refused.type] || refused.type} payment of ₦${Number(refused.paid_amount ?? refused.gross_amount).toLocaleString()} could not be applied and needs a refund. Open Admin > Refund room.`);
    },
  };
}

// ---- notifications --------------------------------------------------------------------
/** Finance heads, or every admin when no Finance head has been set in Positions yet. */
export async function financeRecipients() {
  const { rows } = await pool.query(
    `SELECT id, email FROM users WHERE role_type = 'admin' AND email IS NOT NULL AND department_head_of ILIKE 'finance%'`);
  if (rows.length) return rows;
  return (await pool.query(`SELECT id, email FROM users WHERE role_type = 'admin' AND email IS NOT NULL`)).rows;
}

export async function notifyFinance(templateName, data) {
  for (const r of await financeRecipients()) await notifyUser(r.id, templateName, data);
}

export async function reviewThreshold(runner = pool, key = "order_review_threshold") {
  const v = await getSetting(key, null, runner);
  return v === null || v === undefined || v === "" ? null : Number(v);
}
export async function orderExpiryHours(runner = pool) {
  const v = Number(await getSetting("order_expiry_hours", 24, runner));
  return Number.isFinite(v) && v > 0 ? v : 24;
}
