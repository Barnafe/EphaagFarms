import { pool, detached } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";
import {
  corperPaymentMode,
  paystackRequest,
  toKobo,
  checkPaystackTransaction,
  verifyPaystackSignature,
} from "../utils/paymentProvider.js";
import { recordWebhookEvent } from "../jobs/alerts.js";
import { paystackConfigured, calculateFee, getFeeConfig, verifyTransaction } from "../services/paystack.js";
import { createPayment, startCheckout, settlePayment, verifyAndSettle, registerPaymentType, notifyFinance, refusalText, TYPE_LABEL } from "../services/payments.js";
import { notifyUser } from "../services/messaging.js";
import { notifyAttention } from "../jobs/alerts.js";
import "../services/paymentTemplates.js";

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A malformed id in the URL is "not found", never a database error.
function assertUuid(id) {
  if (!UUID_RE.test(String(id))) throw httpError("Payment not found", 404);
}

const FEE_CATEGORY = "system_configuration";
const FEE_KEY = "corper_access_fee";
const MAX_FEE = 10_000_000;

// ---------------------------------------------------------------------
// Fee (stored in finance_settings so Finance sees it; editable any time)
// ---------------------------------------------------------------------

export async function getFee(runner = pool) {
  const { rows } = await runner.query(
    `SELECT value FROM finance_settings WHERE category = $1 AND key = $2`,
    [FEE_CATEGORY, FEE_KEY]
  );
  const n = Number(rows[0]?.value?.amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------

function mapPayment(p) {
  return {
    id: p.id,
    reference: p.reference,
    amount: Number(p.amount),                                  // the access fee
    accessFee: Number(p.amount),
    processingFee: Number(p.processing_fee || 0),              // Paystack's fee, paid by the member on top
    totalCharged: Number(p.total_charged ?? p.amount),
    nonRefundableAcceptedAt: p.non_refundable_accepted_at || null,
    status: p.status,
    provider: p.provider,
    authorizationUrl: p.status === "pending" ? p.authorization_url : null,
    confirmedAt: p.confirmed_at,
    failedReason: p.failed_reason,
    refundReason: p.refund_reason,
    refundedAt: p.refunded_at,
    createdAt: p.created_at,
  };
}

function mapAdminPayment(p) {
  return {
    ...mapPayment(p),
    authorizationUrl: undefined,
    providerReference: p.provider_reference,
    userId: p.user_id,
    memberName: p.member_name,
    memberEmail: p.member_email,
    stateCode: p.state_code || null,
    confirmedByName: p.confirmed_by_name || null,
    refundedByName: p.refunded_by_name || null,
    confirmedUnverified: !!p.confirmed_unverified,
    manualReason: p.manual_reason || null,
  };
}

// A member's access summary — shared with GET /corpers/me so every screen
// agrees on whether they've paid. Only a 'paid' row opens the gate.
export async function loadAccess(userId, runner = pool) {
  const { rows } = await runner.query(
    `SELECT * FROM corper_payments WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  const paid = rows.find((r) => r.status === "paid");
  const pending = rows.find((r) => r.status === "pending");
  return {
    status: paid ? "paid" : pending ? "pending" : "unpaid",
    paid: !!paid,
    paidAt: paid?.confirmed_at || null,
    reference: paid?.reference || null,
    pending: pending ? mapPayment(pending) : null,
  };
}

// ---------------------------------------------------------------------
// The one confirmation path. Used by an admin confirming by hand, by the
// member's Paystack return (verify) and by the Paystack webhook. Safe to run
// twice (a second call just reports `already: true`), and posts the money to
// the Finance ledger in the SAME transaction so the two can never disagree.
// ---------------------------------------------------------------------

// The ledger posting and status change, inside a transaction the CALLER owns (so the shared
// payment settlement and this can commit or roll back together).
export async function confirmPaymentInTx(client, paymentId, { via, confirmedBy = null, providerReference = null, manualReason = null }) {
  const { rows } = await client.query(
    `SELECT p.*, u.name AS member_name, u.email AS member_email
     FROM corper_payments p JOIN users u ON u.id = p.user_id
     WHERE p.id = $1 FOR UPDATE OF p`,
    [paymentId]
  );
  const p = rows[0];
  if (!p) throw httpError("Payment not found", 404);
  if (p.status === "paid") return { payment: p, already: true };
  // Money verified by the gateway may arrive after an admin rejected it. A manual (admin)
  // confirmation only applies to a payment that is still waiting.
  const allowed = via === "paystack" ? ["pending", "failed"] : ["pending"];
  if (!allowed.includes(p.status)) throw httpError(`A ${p.status} payment can't be confirmed`, 409);

  const incomeRef = generateReference(REF_PREFIX.financeIncome);
  // Finance income is the ACCESS FEE only; the processing fee is not income (it goes to Paystack).
  const { rows: incomeRows } = await client.query(
    `INSERT INTO finance_income (reference, source, category, amount, description, received_from, recorded_by)
     VALUES ($1, 'customer_payment', 'Corps access fee', $2, $3, $4, $5) RETURNING id`,
    [incomeRef, p.amount, `Corps access fee ${p.reference}`, p.member_name, confirmedBy]
  );
  await client.query(
    `INSERT INTO finance_transactions (reference, txn_type, amount, department, description, related_table, related_id, recorded_by)
     VALUES ($1, 'income', $2, 'TRC', $3, 'corper_payments', $4, $5)`,
    [generateReference(REF_PREFIX.financeTransaction), p.amount, `Corps access fee ${p.reference} — ${p.member_name}`, p.id, confirmedBy]
  );
  const { rows: updated } = await client.query(
    `UPDATE corper_payments
     SET status = 'paid', confirmed_by = $2, confirmed_at = now(), provider_reference = $3,
         finance_income_id = $4, failed_reason = NULL, manual_reason = $5, confirmed_unverified = $6, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [p.id, confirmedBy, providerReference || (via === "admin" || via === "admin_fallback" ? "ADMIN" : null), incomeRows[0].id, manualReason, via === "admin_fallback"]
  );
  // Any other payment this member still had waiting is now pointless.
  await client.query(
    `UPDATE corper_payments SET status = 'cancelled', updated_at = now()
     WHERE user_id = $1 AND status = 'pending' AND id <> $2`,
    [p.user_id, p.id]
  );
  return { payment: { ...updated[0], member_name: p.member_name, member_email: p.member_email }, already: false };
}

// Used by the manual paths (admin confirmation, legacy rows). One transaction of its own.
export async function confirmPayment(paymentId, opts) {
  const client = await pool.connect();
  let result;
  try {
    await client.query("BEGIN");
    result = await confirmPaymentInTx(client, paymentId, opts);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      // The member already has a different paid payment (unique index).
      console.error("Corps payment confirmation blocked — member already has a paid access fee", paymentId);
      throw httpError("This member has already paid the access fee", 409);
    }
    throw err;
  } finally {
    client.release();
  }
  if (!result.already) detached(() => afterCorpsConfirmed(result.payment, { finance: opts.via !== "admin" }).catch((e) => console.error("Corps receipt failed", e)));
  return result;
}

// Receipt to the member (email, or SMS if phone-only). Never blocks or fails the payment.
async function afterCorpsConfirmed(p, { finance = true } = {}) {
  await notifyUser(p.user_id, "corps_receipt", {
    reference: p.reference, accessFee: Number(p.amount), fee: Number(p.processing_fee || 0), totalCharged: Number(p.total_charged ?? p.amount),
  });
  if (finance) {
    await notifyFinance("payment_finance_notice", {
      typeLabel: TYPE_LABEL.corps_fee, payer: p.member_name, netAmount: Number(p.amount), fee: Number(p.processing_fee || 0),
      grossAmount: Number(p.total_charged ?? p.amount), reference: p.reference, review: p.confirmed_unverified ? `confirmed by hand without Paystack: ${p.manual_reason}` : "",
    });
  }
}

// What a verified Paystack payment means for a corps access fee.
registerPaymentType("corps_fee", {
  async apply(gp, client) {
    const { rows } = await client.query(
      `SELECT p.*, u.name AS member_name FROM corper_payments p JOIN users u ON u.id = p.user_id WHERE p.id = $1 FOR UPDATE OF p`, [gp.subject_id]);
    const cp = rows[0];
    if (!cp) return { refuse: { reason: "purchase_missing" } };

    if (cp.status === "paid") {
      // This very payment was already confirmed (an admin confirmed it by hand while Paystack was
      // down): the later Paystack report is matched to it and NOT credited a second time.
      await client.query(`UPDATE corper_payments SET provider_reference = $2, updated_at = now() WHERE id = $1`, [cp.id, gp.provider_ref || cp.provider_reference]);
      return {};
    }
    // Another payment already unlocked this member: a second payment is a duplicate.
    const { rowCount: other } = await client.query(`SELECT 1 FROM corper_payments WHERE user_id = $1 AND status = 'paid' AND id <> $2`, [cp.user_id, cp.id]);
    if (other) return { refuse: { reason: "duplicate_payment" } };
    if (cp.status === "cancelled") return { refuse: { reason: "payment_cancelled" } };
    if (cp.status === "refunded") return { refuse: { reason: "payment_closed" } };

    await client.query("SAVEPOINT corps_confirm");
    try {
      const { payment } = await confirmPaymentInTx(client, cp.id, { via: "paystack", providerReference: gp.provider_ref });
      return { after: () => afterCorpsConfirmed(payment) };
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT corps_confirm");
      if (err.code === "23505") return { refuse: { reason: "duplicate_payment" } };
      throw err;
    }
  },
});

// One handler for a Paystack "charge.success" event, used by BOTH webhook addresses so corps
// behaves the same on either: the shared ledger first, then older corps rows that pre-date it.
export async function processChargeSuccess(event) {
  if (event?.event !== "charge.success" || !event.data?.reference) return { handled: false };
  const out = await settlePayment(event.data.reference, event.data, { source: "webhook" });
  if (out.found) return { handled: true, out };
  return { handled: await applyCorpsPaystackEvent(event) };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------
// Member endpoints (role: corper)
// ---------------------------------------------------------------------

// GET /api/corpers/payments
export async function myPayments(req, res) {
  const [fee, access, { rows }] = await Promise.all([
    getFee(),
    loadAccess(req.user.id),
    pool.query(`SELECT * FROM corper_payments WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.id]),
  ]);
  // What the member will be asked to pay: the access fee plus Paystack's processing fee (shown as its own line).
  const mode = corperPaymentMode();
  const q = fee && mode === "paystack" ? calculateFee(fee, await getFeeConfig()) : fee ? { net: fee, fee: 0, gross: fee } : null;
  res.json({
    fee, mode, access, payments: rows.map(mapPayment),
    quote: q ? { accessFee: q.net, processingFee: q.fee, totalToPay: q.gross } : null,
    nonRefundableNotice: "This fee is non-refundable once paid.",
  });
}

// POST /api/corpers/payments/initiate — the amount ALWAYS comes from the
// server's fee setting; anything the browser sends is ignored. The member must
// tick "this fee is non-refundable once paid"; the time of the tick is stored.
export async function initiatePayment(req, res) {
  const fee = await getFee();
  if (!fee) throw httpError("The access fee hasn't been set yet — please check back soon", 409);
  const accepted = req.body?.acceptNonRefundable === true;

  let access = await loadAccess(req.user.id);
  if (access.paid) throw httpError("Your access fee is already paid", 409);

  // Before starting anything new, scan Paystack for an earlier payment by this member that we
  // may have missed (a webhook that never came, a closed tab). If one is found it is applied and
  // the member is told, so nobody is asked to pay twice.
  if (paystackConfigured()) {
    const { rows: earlier } = await pool.query(
      `SELECT p.reference FROM corper_payments p JOIN gateway_payments g ON g.reference = p.reference
        WHERE p.user_id = $1 AND p.provider = 'paystack' AND p.status IN ('pending','failed') AND g.status IN ('initiated','pending','failed')
        ORDER BY p.created_at DESC LIMIT 5`, [req.user.id]);
    for (const e of earlier) await verifyAndSettle(e.reference).catch(() => null);
    access = await loadAccess(req.user.id);
    if (access.paid) throw httpError("We checked with Paystack and found your earlier payment. Your access fee is already paid and your training is unlocked.", 409);
  }
  if (access.pending) {
    // If the Paystack attempt behind the waiting payment is spent (refused or failed), it cannot be paid
    // any more: close it so the member can start a fresh one.
    const { rows: spent } = await pool.query(`SELECT 1 FROM gateway_payments WHERE reference = $1 AND status IN ('refused','failed')`, [access.pending.reference]);
    if (spent.length) {
      await pool.query(`UPDATE corper_payments SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status = 'pending'`, [access.pending.id]);
    } else if (!access.pending.nonRefundableAcceptedAt) {
      if (!accepted) throw httpError("Please tick the box to confirm you understand this fee is non-refundable once paid", 400);
      await pool.query(`UPDATE corper_payments SET non_refundable_accepted_at = now() WHERE id = $1 AND non_refundable_accepted_at IS NULL`, [access.pending.id]);
      const fresh = await loadAccess(req.user.id);
      return res.json({ payment: fresh.pending, existing: true });
    } else {
      return res.json({ payment: access.pending, existing: true });
    }
  }
  if (!accepted) throw httpError("Please tick the box to confirm you understand this fee is non-refundable once paid", 400);

  const mode = corperPaymentMode();
  if (mode === "paystack" && !paystackConfigured()) throw httpError("Online payment is unavailable right now. Please try again later.", 503);
  const q = mode === "paystack" ? calculateFee(fee, await getFeeConfig()) : { fee: 0, gross: fee };

  let row = null;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO corper_payments (reference, user_id, amount, processing_fee, total_charged, provider, non_refundable_accepted_at)
         VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING *`,
        [generateReference(REF_PREFIX.corperPayment), req.user.id, fee, q.fee, q.gross, mode]
      );
      row = rows[0];
    } catch (err) {
      if (err.code !== "23505") throw err;
      // Either a double-click raced us (a pending/paid row now exists) or the
      // random reference collided. Re-read and answer accordingly.
      const now = await loadAccess(req.user.id);
      if (now.paid) throw httpError("Your access fee is already paid", 409);
      if (now.pending) return res.json({ payment: now.pending, existing: true });
    }
  }
  if (!row) throw httpError("Couldn't start the payment — please try again", 500);

  if (mode === "paystack") {
    const { rows: u } = await pool.query(`SELECT email, phone FROM users WHERE id = $1`, [req.user.id]);
    const domain = process.env.CORPER_PLACEHOLDER_EMAIL_DOMAIN || "corpers.ephaag.app";
    const email = u[0]?.email || `${String(u[0]?.phone || req.user.id).replace(/[^a-z0-9]/gi, "")}@${domain}`;
    try {
      // The payment is recorded in the shared ledger under the SAME reference, so the shared
      // webhook, the return-page check and the re-check job all find it.
      const gp = await createPayment({ type: "corps_fee", userId: req.user.id, subjectId: row.id, netAmount: fee, reference: row.reference, meta: { purpose: "corper_access_fee" } });
      const started = await startCheckout(gp, { email, returnPath: `/dashboard/corper?corperPayment=${encodeURIComponent(row.reference)}` });
      const { rows } = await pool.query(
        `UPDATE corper_payments SET authorization_url = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [row.id, started.authorization_url]
      );
      row = rows[0];
    } catch (err) {
      console.error("Paystack initialize failed", err.message);
      await pool.query(`UPDATE corper_payments SET status = 'failed', failed_reason = $2, updated_at = now() WHERE id = $1`, [row.id, "Couldn't reach the payment gateway"]);
      await pool.query(`UPDATE gateway_payments SET status = 'failed', updated_at = now() WHERE reference = $1`, [row.reference]);
      throw httpError("Couldn't start the payment — please try again", 502);
    }
  }

  res.status(201).json({ payment: mapPayment(row) });
}

// POST /api/corpers/payments/:id/cancel
export async function cancelPayment(req, res) {
  assertUuid(req.params.id);
  const { rows } = await pool.query(
    `UPDATE corper_payments SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (!rows[0]) throw httpError("There's no pending payment to cancel", 404);
  await pool.query(`UPDATE gateway_payments SET status = 'abandoned', updated_at = now() WHERE reference = $1 AND status IN ('initiated','pending')`, [rows[0].reference]);
  res.json({ payment: mapPayment(rows[0]) });
}

// POST /api/corpers/payments/:reference/verify — after returning from
// Paystack (or on refresh). The member's own word is never trusted: for
// Paystack we ask Paystack. For manual payments this just reports status.
// The answer is a plain outcome: success | pending | failed | refused.
export async function verifyPayment(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM corper_payments WHERE reference = $1 AND user_id = $2`,
    [req.params.reference, req.user.id]
  );
  const payment = rows[0];
  if (!payment) throw httpError("Payment not found", 404);

  let unreachable = false;
  const { rows: gp } = await pool.query(`SELECT status, refusal_reason FROM gateway_payments WHERE reference = $1`, [payment.reference]);
  if (payment.provider === "paystack" && corperPaymentMode() === "paystack") {
    if (gp[0]) {
      if (["initiated", "pending"].includes(gp[0].status)) unreachable = !!(await verifyAndSettle(payment.reference)).unreachable;
    } else if (["pending", "failed"].includes(payment.status)) {
      // A payment made before the shared ledger existed: the original check.
      const v = await paystackRequest(`/transaction/verify/${encodeURIComponent(payment.reference)}`);
      const data = v.body?.data;
      if (!v.ok || !v.body?.status || !data) unreachable = true;
      else {
        const check = checkPaystackTransaction(data, payment);
        if (check.ok) await confirmPayment(payment.id, { via: "paystack", providerReference: String(data.id ?? "") });
      }
    }
  }

  const [access, { rows: fresh }, { rows: gp2 }] = await Promise.all([
    loadAccess(req.user.id),
    pool.query(`SELECT * FROM corper_payments WHERE id = $1`, [payment.id]),
    pool.query(`SELECT status, refusal_reason FROM gateway_payments WHERE reference = $1`, [payment.reference]),
  ]);
  const p = fresh[0];
  let outcome = "pending";
  if (gp2[0]?.status === "refused") outcome = "refused";
  else if (p.status === "paid") outcome = "success";
  else if (p.status === "failed" || gp2[0]?.status === "failed") outcome = "failed";
  else if (p.status === "cancelled") outcome = "cancelled";
  res.json({
    outcome, unreachable, payment: mapPayment(p), access,
    refusalReason: gp2[0]?.refusal_reason || null,
    refusalText: gp2[0]?.refusal_reason ? refusalText(gp2[0].refusal_reason) : null,
  });
}

// ---------------------------------------------------------------------
// Paystack webhook (no login — authenticated by the HMAC signature)
// ---------------------------------------------------------------------
export async function paystackWebhook(req, res) {
  if (!verifyPaystackSignature(req.rawBody, req.headers["x-paystack-signature"])) {
    await recordWebhookEvent("paystack", "bad_signature", "corps webhook", req);
    return res.status(401).json({ error: "Invalid signature" });
  }
  await recordWebhookEvent("paystack", "ok", "corps webhook");
  try {
    await processChargeSuccess(req.body || {});
  } catch (err) {
    await recordWebhookEvent("paystack", "error", err.message);
    throw err; // 5xx -> Paystack retries later
  }
  res.json({ received: true });
}

// The corps part of a Paystack event. Used by the old corps webhook address and
// by the shared /api/payments/paystack-webhook, so corps behaves identically on both.
export async function applyCorpsPaystackEvent(event) {
  if (event.event !== "charge.success" || !event.data?.reference) return false;
  const { rows } = await pool.query(`SELECT * FROM corper_payments WHERE reference = $1`, [event.data.reference]);
  const payment = rows[0];
  if (!payment) return false; // not one of ours

  const check = checkPaystackTransaction(event.data, payment);
  if (!check.ok) {
    console.error("Paystack webhook check failed", payment.reference, check.code);
    return true;
  }
  try {
    await confirmPayment(payment.id, { via: "paystack", providerReference: String(event.data.id ?? "") });
  } catch (err) {
    if (err.status && err.status < 500) {
      console.error("Paystack webhook not applied:", err.message);
      return true;
    }
    throw err;
  }
  return true;
}

// ---------------------------------------------------------------------
// Admin endpoints (TRC -> Corps -> Payments)
// ---------------------------------------------------------------------

const ADMIN_SELECT = `
  SELECT p.*, u.name AS member_name, u.email AS member_email, cp.state_code,
         cb.name AS confirmed_by_name, rb.name AS refunded_by_name
  FROM corper_payments p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN corper_profiles cp ON cp.user_id = p.user_id
  LEFT JOIN users cb ON cb.id = p.confirmed_by
  LEFT JOIN users rb ON rb.id = p.refunded_by`;

const STATUSES = ["pending", "paid", "failed", "cancelled", "refunded"];

// GET /api/rtc/admin/corps/payments?status=&q=
export async function adminListPayments(req, res) {
  const { status, q } = req.query;
  if (status && status !== "all" && !STATUSES.includes(status)) {
    throw httpError(`status must be one of ${STATUSES.join(", ")} or all`);
  }
  const params = [];
  const clauses = [];
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`p.status = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    const i = params.length;
    clauses.push(`(u.name ILIKE $${i} OR u.email ILIKE $${i} OR p.reference ILIKE $${i} OR cp.state_code ILIKE $${i})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`${ADMIN_SELECT} ${where} ORDER BY p.created_at DESC LIMIT 500`, params);
  res.json({ payments: rows.map(mapAdminPayment) });
}

// GET /api/rtc/admin/corps/payments/summary
export async function adminPaymentSummary(req, res) {
  const [{ rows }, fee] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float8 AS total FROM corper_payments GROUP BY status`),
    getFee(),
  ]);
  const get = (s) => rows.find((r) => r.status === s) || { count: 0, total: 0 };
  res.json({
    fee,
    mode: corperPaymentMode(),
    paidCount: get("paid").count,
    collected: get("paid").total,
    pendingCount: get("pending").count,
    pendingTotal: get("pending").total,
    failedCount: get("failed").count,
    refundedCount: get("refunded").count,
    refundedTotal: get("refunded").total,
  });
}

// POST /api/rtc/admin/corps/payments/:id/confirm
// A payment made through Paystack is checked WITH Paystack first. If Paystack says it was
// received, it is confirmed through the normal (verified) path. If Paystack says it was not,
// it cannot be confirmed by hand. Only if Paystack cannot be reached may an admin confirm by
// hand: a reason (for example a transfer reference) is then mandatory, the confirmation is logged
// and flagged for review, and a later Paystack report for the same payment is not credited twice.
export async function adminConfirmPayment(req, res) {
  assertUuid(req.params.id);
  const { rows } = await pool.query(`SELECT * FROM corper_payments WHERE id = $1`, [req.params.id]);
  const p = rows[0];
  if (!p) throw httpError("Payment not found", 404);
  if (p.status === "paid") {
    const { rows: full } = await pool.query(`${ADMIN_SELECT} WHERE p.id = $1`, [p.id]);
    return res.json({ payment: mapAdminPayment(full[0]), already: true });
  }

  if (p.provider === "paystack" && paystackConfigured()) {
    const data = await verifyTransaction(p.reference);
    if (data) {
      const { rows: gp } = await pool.query(`SELECT id FROM gateway_payments WHERE reference = $1`, [p.reference]);
      let paid = false;
      if (gp[0]) {
        const out = await settlePayment(p.reference, data, { source: "admin-check" });
        if (out.outcome === "refused") throw httpError(`Paystack received the money but it cannot be used because ${refusalText(out.refusalReason)}. It has been queued for refund.`, 409);
        paid = out.outcome === "success" || out.already === true;
      } else if (checkPaystackTransaction(data, p).ok) {
        await confirmPayment(p.id, { via: "paystack", providerReference: String(data.id ?? "") });
        paid = true;
      }
      if (!paid) throw httpError("Paystack says this payment has not been received, so it can't be confirmed by hand. Ask the member to finish paying, or re-check later.", 409);
    } else {
      // Paystack cannot be reached: confirm by hand, but only with a recorded reason, and flag it.
      const reason = requireReason(req.body?.reason, "Paystack could not be reached. To confirm by hand, give the reason or the transfer reference");
      await confirmManualFallback(p, req.user, reason);
    }
  } else {
    await confirmPayment(req.params.id, { via: "admin", confirmedBy: req.user.id });
  }
  const { rows: full } = await pool.query(`${ADMIN_SELECT} WHERE p.id = $1`, [p.id]);
  res.json({ payment: mapAdminPayment(full[0]), already: false });
}

async function confirmManualFallback(p, admin, reason) {
  const client = await pool.connect();
  let result;
  try {
    await client.query("BEGIN");
    result = await confirmPaymentInTx(client, p.id, { via: "admin_fallback", confirmedBy: admin.id, manualReason: reason });
    // Make the shared ledger agree, flagged for review. A later Paystack report for this
    // reference finds it already settled and is not credited a second time.
    const gross = Number(p.total_charged ?? p.amount);
    await client.query(
      `INSERT INTO gateway_payments (reference, type, user_id, subject_id, net_amount, fee_amount, gross_amount, status, paid_amount, paid_at, meta)
       VALUES ($1, 'corps_fee', $2, $3, $4, $5, $6, 'success', $6, now(), $7::jsonb)
       ON CONFLICT (reference) DO UPDATE SET status = 'success', paid_at = COALESCE(gateway_payments.paid_at, now()), updated_at = now(),
         meta = gateway_payments.meta || $7::jsonb`,
      [p.reference, p.user_id, p.id, p.amount, p.processing_fee || 0, gross, JSON.stringify({ manual: true, reason })]);
    const { rows: g } = await client.query(`SELECT id FROM gateway_payments WHERE reference = $1`, [p.reference]);
    await client.query(`INSERT INTO payment_flags (payment_id, kind, reason, detail) VALUES ($1, 'review', 'manual_confirmation', $2)`, [g[0].id, `Confirmed by hand while Paystack was unreachable: ${reason}`]);
    await client.query(`INSERT INTO finance_audit_log (actor_id, action, entity_table, details) VALUES ($1, 'corps_payment_confirmed_without_paystack', 'corper_payments', $2)`,
      [admin.id, JSON.stringify({ payment: p.reference, reason })]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (!result.already) detached(() => afterCorpsConfirmed(result.payment).catch((e) => console.error("Corps receipt failed", e)));
  // Exceptional case: every admin is told that a payment was confirmed without Paystack.
  detached(() => notifyAttention("manual_confirmation_notice", { member: result.payment.member_name, reference: p.reference, reason }, null));
}

// POST /api/rtc/admin/corps/payments/:id/recheck — ask Paystack about a stuck pending payment.
// (The scheduled re-check does the same automatically.)
export async function adminRecheckPayment(req, res) {
  assertUuid(req.params.id);
  const { rows } = await pool.query(`SELECT * FROM corper_payments WHERE id = $1`, [req.params.id]);
  const p = rows[0];
  if (!p) throw httpError("Payment not found", 404);
  let unreachable = false;
  if (p.provider === "paystack" && p.status === "pending" && paystackConfigured()) {
    const { rows: gp } = await pool.query(`SELECT id FROM gateway_payments WHERE reference = $1`, [p.reference]);
    if (gp[0]) unreachable = !!(await verifyAndSettle(p.reference)).unreachable;
    else {
      const data = await verifyTransaction(p.reference);
      if (!data) unreachable = true;
      else if (checkPaystackTransaction(data, p).ok) await confirmPayment(p.id, { via: "paystack", providerReference: String(data.id ?? "") });
    }
  }
  const { rows: full } = await pool.query(`${ADMIN_SELECT} WHERE p.id = $1`, [p.id]);
  res.json({ payment: mapAdminPayment(full[0]), unreachable });
}

function requireReason(raw, message = "Please give a reason (at least a few words)") {
  const reason = String(raw ?? "").trim();
  if (reason.length < 3) throw httpError(message);
  if (reason.length > 500) throw httpError("The reason is too long (500 characters at most)");
  return reason;
}

// POST /api/rtc/admin/corps/payments/:id/reject — a waiting payment that
// wasn't actually received. The member sees the reason and can try again.
export async function adminRejectPayment(req, res) {
  assertUuid(req.params.id);
  const reason = requireReason(req.body?.reason);
  const { rows } = await pool.query(
    `UPDATE corper_payments SET status = 'failed', failed_reason = $2, updated_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [req.params.id, reason]
  );
  if (!rows[0]) throw httpError("Only a pending payment can be rejected", 409);
  const { rows: full } = await pool.query(`${ADMIN_SELECT} WHERE p.id = $1`, [rows[0].id]);
  res.json({ payment: mapAdminPayment(full[0]) });
}

// There is NO refund action for the corps access fee: it is non-refundable once agreed and paid.
// Payments refunded before this change stay visible as history (status "refunded").

// GET /api/rtc/admin/corps/fee
export async function adminGetFee(req, res) {
  res.json({ fee: await getFee(), mode: corperPaymentMode() });
}

// PUT /api/rtc/admin/corps/fee — editable any time. Payments already
// created keep the amount they were created with.
export async function adminSetFee(req, res) {
  const raw = req.body?.amount;
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(n) || n <= 0) {
    throw httpError("The fee must be a number greater than zero");
  }
  if (n > MAX_FEE) throw httpError(`The fee can't be more than ₦${MAX_FEE.toLocaleString("en-NG")}`);
  const amount = Math.round(n * 100) / 100;

  const previous = await getFee();
  await pool.query(
    `INSERT INTO finance_settings (category, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category, key) DO UPDATE SET value = $3, updated_by = $4, updated_at = now()`,
    [FEE_CATEGORY, FEE_KEY, JSON.stringify({ amount }), req.user.id]
  );
  await pool.query(
    `INSERT INTO finance_audit_log (actor_id, action, entity_table, details) VALUES ($1, 'corps_fee_changed', 'finance_settings', $2)`,
    [req.user.id, JSON.stringify({ from: previous, to: amount })]
  );
  res.json({ fee: amount });
}
