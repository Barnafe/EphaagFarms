import { pool } from "../db/pool.js";
import { verifyPaystackSignature, paystackConfigured, getFeeConfig, DEFAULT_FEE_CONFIG, calculateFee } from "../services/paystack.js";
import { settlePayment, verifyAndSettle, refusalText, TYPE_LABEL } from "../services/payments.js";
import { processChargeSuccess } from "./corperPaymentController.js";
import { recordWebhookEvent } from "../jobs/alerts.js";
import { getSetting, setSetting } from "../utils/settings.js";
import { logSecurityEvent } from "../utils/securityLog.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpErr = (m, s = 400) => Object.assign(new Error(m), { status: s });

// ---------------------------------------------------------------------------
// The one webhook address Paystack allows per account. Authenticated by the
// HMAC signature; every event is routed by its payment reference.
// ---------------------------------------------------------------------------
export async function paystackWebhook(req, res) {
  if (!verifyPaystackSignature(req.rawBody, req.headers["x-paystack-signature"])) {
    await recordWebhookEvent("paystack", "bad_signature", "shared webhook", req);
    return res.status(401).json({ error: "Invalid signature" });
  }
  const event = req.body || {};
  try {
    await processChargeSuccess(event); // the ledger first, then corps rows that pre-date it
    await recordWebhookEvent("paystack", "ok", event.event || "event");
    res.json({ received: true });
  } catch (err) {
    await recordWebhookEvent("paystack", "error", err.message);
    throw err; // 5xx -> Paystack retries later
  }
}

// ---------------------------------------------------------------------------
// Return page: the buyer comes back from Paystack and we ask Paystack.
// ---------------------------------------------------------------------------
export async function paymentStatus(req, res) {
  const reference = String(req.params.reference || "");
  const { rows } = await pool.query("SELECT * FROM gateway_payments WHERE reference = $1", [reference]);
  let payment = rows[0];
  if (!payment || (payment.user_id !== req.user.id && req.user.role_type !== "admin")) {
    return res.status(404).json({ error: "Payment not found" });
  }
  let unreachable = false;
  if (["initiated", "pending"].includes(payment.status) && paystackConfigured()) {
    const r = await verifyAndSettle(reference);
    unreachable = !!r?.unreachable;
    payment = (await pool.query("SELECT * FROM gateway_payments WHERE id = $1", [payment.id])).rows[0];
  }
  let order = null;
  if (payment.type === "order" && payment.subject_id) {
    order = (await pool.query("SELECT id, reference, status, expires_at FROM orders WHERE id = $1", [payment.subject_id])).rows[0] || null;
  }
  let outcome;
  if (payment.status === "refused") outcome = "refused";
  else if (payment.status === "success") outcome = "success";
  else if (payment.status === "failed") outcome = "failed";
  else if (payment.status === "abandoned" || (order && order.status === "expired")) outcome = order?.status === "expired" ? "expired" : "failed";
  else outcome = "pending";
  res.json({
    outcome, unreachable,
    refusalReason: payment.refusal_reason || null,
    refusalText: payment.refusal_reason ? refusalText(payment.refusal_reason) : null,
    waitingForTransfer: outcome === "pending" && payment.channel === "bank_transfer",
    payment: { reference: payment.reference, type: payment.type, status: payment.status, goodsTotal: Number(payment.net_amount), fee: Number(payment.fee_amount), amountCharged: Number(payment.gross_amount) },
    order,
  });
}

// ---------------------------------------------------------------------------
// Finance: the accounting list, flags, settings
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function loadLedger({ type, recorded, from, to, limit = 500, offset = 0 }) {
  const where = [`p.status = 'success'`]; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (type) add("p.type = ?", type);
  if (recorded === "true" || recorded === "false") add("p.recorded = ?", recorded === "true");
  if (from) add("p.paid_at >= ?", from);
  if (to) add("p.paid_at <= ?", to);
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT p.id, p.subject_id, p.reference, p.type, p.net_amount, p.fee_amount, p.gross_amount, p.channel, p.paid_at, p.recorded, p.recorded_at,
            u.name AS payer_name, u.email AS payer_email, p.refund_status,
            (SELECT COUNT(*)::int FROM payment_flags f WHERE f.payment_id = p.id AND f.status = 'open') AS open_flags,
            (SELECT string_agg(f.reason, ', ') FROM payment_flags f WHERE f.payment_id = p.id AND f.kind = 'review') AS review_reasons
       FROM gateway_payments p LEFT JOIN users u ON u.id = p.user_id
      WHERE ${where.join(" AND ")} ORDER BY p.paid_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

export async function ledger(req, res) {
  const rows = await loadLedger(req.query);
  res.json({ payments: rows.map((r) => ({ ...r, typeLabel: TYPE_LABEL[r.type] || r.type })) });
}

export async function ledgerCsv(req, res) {
  const rows = await loadLedger({ ...req.query, limit: 20000 });
  const head = ["Paid at", "Type", "Reference", "Payer", "Net to EPHAAG (NGN)", "Processing fee (NGN)", "Total charged (NGN)", "Channel", "Recorded", "Review flag"];
  const lines = [head.join(",")].concat(rows.map((r) => [
    r.paid_at ? new Date(r.paid_at).toISOString() : "", TYPE_LABEL[r.type] || r.type, r.reference, r.payer_name || "",
    r.net_amount, r.fee_amount, r.gross_amount, r.channel || "", r.recorded ? "yes" : "no", r.review_reasons || "",
  ].map(csvCell).join(",")));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("\ufeff" + lines.join("\r\n")); // BOM so Excel reads the Naira text correctly
}

export async function setRecorded(req, res) {
  if (!UUID_RE.test(req.params.id)) throw httpErr("Payment not found", 404);
  const recorded = req.body?.recorded !== false;
  const { rows } = await pool.query(
    `UPDATE gateway_payments SET recorded = $2, recorded_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END, recorded_at = CASE WHEN $2 THEN now() ELSE NULL END
      WHERE id = $1 AND status = 'success' RETURNING id, recorded, recorded_at`, [req.params.id, recorded, req.user.id]);
  if (!rows[0]) throw httpErr("Payment not found", 404);
  res.json({ payment: rows[0] });
}

// Review-only flags are informational: the item has already proceeded.
export async function listFlags(req, res) {
  const { rows } = await pool.query(
    `SELECT f.id, f.kind, f.reason, f.detail, f.created_at, p.reference, p.type, p.net_amount, p.gross_amount, u.name AS payer_name
       FROM payment_flags f JOIN gateway_payments p ON p.id = f.payment_id LEFT JOIN users u ON u.id = p.user_id
      WHERE f.kind = 'review' ORDER BY f.created_at DESC LIMIT 200`);
  res.json({ flags: rows.map((f) => ({ ...f, typeLabel: TYPE_LABEL[f.type] || f.type })) });
}

export async function unfundedCommitments(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.email, b.standing_commitment_total, b.standing_commitment_balance, b.standing_commitment_years
       FROM buyer_profiles b JOIN users u ON u.id = b.user_id
      WHERE b.standing_commitment_balance > 0 AND b.commitment_funded_at IS NULL ORDER BY u.name`);
  res.json({ commitments: rows });
}

// ---- settings -----------------------------------------------------------------------
export async function getPaymentSettings(req, res) {
  res.json({
    fee: await getFeeConfig(), defaults: DEFAULT_FEE_CONFIG,
    reviewThreshold: await getSetting("order_review_threshold", null),
    orderExpiryHours: await getSetting("order_expiry_hours", 24),
    shareReviewThreshold: await getSetting("share_review_threshold", null),
    shareExpiryHours: await getSetting("share_expiry_hours", 24),
    sharePercentPerMonth: await getSetting("share_late_percent", 2),
    shareLateCapDays: await getSetting("share_late_cap_days", 30),
    shareGraceDays: await getSetting("share_grace_days", 10),
    duplicateWindowHours: await getSetting("duplicate_window_hours", 24),
    paystackConfigured: paystackConfigured(),
    example: calculateFee(10000, await getFeeConfig()),
  });
}

export async function updatePaymentSettings(req, res) {
  const b = req.body || {};
  const changed = {};
  if (b.fee !== undefined) {
    const f = {};
    for (const k of ["percent", "flat", "waiverUnder", "cap"]) {
      const n = Number(b.fee[k]);
      if (!Number.isFinite(n) || n < 0) throw httpErr(`Fee setting "${k}" must be a number, zero or more`);
      f[k] = n;
    }
    if (f.percent >= 50) throw httpErr("Fee percentage looks wrong (it must be under 50)");
    await setSetting("paystack_fee", f, req.user.id); changed.fee = f;
  }
  if (b.reviewThreshold !== undefined) {
    const v = b.reviewThreshold === null || b.reviewThreshold === "" ? null : Number(b.reviewThreshold);
    if (v !== null && (!Number.isFinite(v) || v <= 0)) throw httpErr("The review threshold must be an amount above zero, or empty for no threshold");
    await setSetting("order_review_threshold", v, req.user.id); changed.reviewThreshold = v;
  }
  if (b.orderExpiryHours !== undefined) {
    const v = Number(b.orderExpiryHours);
    if (!Number.isFinite(v) || v < 1 || v > 168) throw httpErr("Order expiry must be between 1 and 168 hours");
    await setSetting("order_expiry_hours", v, req.user.id); changed.orderExpiryHours = v;
  }
  if (b.shareReviewThreshold !== undefined) {
    const v = b.shareReviewThreshold === null || b.shareReviewThreshold === "" ? null : Number(b.shareReviewThreshold);
    if (v !== null && (!Number.isFinite(v) || v <= 0)) throw httpErr("The share review threshold must be an amount above zero, or empty for no threshold");
    await setSetting("share_review_threshold", v, req.user.id); changed.shareReviewThreshold = v;
  }
  if (b.shareExpiryHours !== undefined) {
    const v = Number(b.shareExpiryHours);
    if (!Number.isFinite(v) || v < 1 || v > 168) throw httpErr("Share purchase expiry must be between 1 and 168 hours");
    await setSetting("share_expiry_hours", v, req.user.id); changed.shareExpiryHours = v;
  }
  for (const [key, setting, label, min, max] of [["sharePercentPerMonth", "share_late_percent", "Share late fee percent per month", 0, 50], ["shareLateCapDays", "share_late_cap_days", "Days the late fee keeps growing", 1, 365], ["shareGraceDays", "share_grace_days", "Share grace period in days", 0, 120]]) {
    if (b[key] === undefined) continue;
    const v = Number(b[key]);
    if (!Number.isFinite(v) || v < min || v > max) throw httpErr(`${label} must be between ${min} and ${max}`);
    await setSetting(setting, v, req.user.id); changed[key] = v;
  }
  if (b.duplicateWindowHours !== undefined) {
    const v = Number(b.duplicateWindowHours);
    if (!Number.isFinite(v) || v < 1 || v > 720) throw httpErr("The duplicate-order window must be between 1 and 720 hours");
    await setSetting("duplicate_window_hours", v, req.user.id); changed.duplicateWindowHours = v;
  }
  await logSecurityEvent("money_setting_changed", { userId: req.user.id, req, detail: changed });
  return getPaymentSettings(req, res);
}
