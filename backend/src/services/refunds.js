import { pool } from "../db/pool.js";
import { requestRefund } from "./paystack.js";
import { notifyUser } from "./messaging.js";
import { TYPE_LABEL, refusalText } from "./payments.js";
import { orderEvent } from "./orderPayments.js";

// THE one place money is returned. There is no refund feature anywhere else in the system: the
// system rejects expired, cancelled, wrong-amount and duplicate payments before they happen, and
// shows the reason. This room is for exceptions only: (1) money that arrived but could not be
// applied ("needs attention"), and (2) anything that went wrong afterwards (for example goods
// delivered wrongly and returned). Full refunds only, always with a written reason; Paystack
// credits the payer and keeps its own fee.
const httpErr = (message, status = 400) => Object.assign(new Error(message), { status, expose: status >= 500 });

export async function listAttention() {
  const { rows } = await pool.query(
    `SELECT p.id, p.reference, p.type, p.refusal_reason, p.refund_status, p.refund_note, p.paid_amount, p.gross_amount, p.paid_at, p.channel,
            u.name AS payer_name, u.email AS payer_email, u.phone AS payer_phone
       FROM gateway_payments p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.status = 'refused' AND p.refund_status IN ('due','failed') ORDER BY p.paid_at DESC NULLS LAST LIMIT 300`);
  return rows.map((r) => ({ ...r, typeLabel: TYPE_LABEL[r.type] || r.type, reasonText: r.refusal_reason ? refusalText(r.refusal_reason) : null }));
}

export async function listHistory() {
  const { rows } = await pool.query(
    `SELECT p.id, p.reference, p.type, p.refusal_reason, p.refund_note AS reason, p.refund_at, p.paid_amount, p.gross_amount, p.status,
            u.name AS payer_name, u.email AS payer_email
       FROM gateway_payments p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.refund_status = 'refunded' ORDER BY p.refund_at DESC NULLS LAST LIMIT 300`);
  return rows.map((r) => ({ ...r, typeLabel: TYPE_LABEL[r.type] || r.type }));
}

/** Find a payment to refund by reference, order or purchase number, or the payer's name or email. */
export async function searchRefundable(q) {
  const term = String(q || "").trim();
  if (term.length < 3) return [];
  const like = `%${term}%`;
  const { rows } = await pool.query(
    `SELECT p.id, p.reference, p.type, p.status, p.refund_status, p.gross_amount, p.net_amount, p.paid_amount, p.paid_at, p.meta,
            u.name AS payer_name, u.email AS payer_email
       FROM gateway_payments p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.status IN ('success','refused')
        AND (p.reference ILIKE $1 OR p.meta::text ILIKE $1 OR u.name ILIKE $1 OR u.email ILIKE $1)
      ORDER BY p.paid_at DESC NULLS LAST LIMIT 25`, [like]);
  return rows.map((r) => ({ ...r, typeLabel: TYPE_LABEL[r.type] || r.type, refundable: r.refund_status !== "refunded" && r.refund_status !== "processing" }));
}

/** Return the FULL amount to the payer through Paystack. Needs a reason. */
export async function refundPayment(paymentId, { reason, userId = null }) {
  const why = String(reason || "").trim();
  if (why.length < 3) throw httpErr("Please give the reason for this refund");
  const { rows } = await pool.query(
    `UPDATE gateway_payments SET refund_status = 'processing', updated_at = now()
      WHERE id = $1 AND status IN ('success','refused') AND (refund_status IS NULL OR refund_status IN ('due','failed')) RETURNING *, (SELECT refund_status FROM gateway_payments WHERE id = $1) AS prev_status`, [paymentId]);
  if (!rows[0]) {
    const { rows: ex } = await pool.query("SELECT status, refund_status FROM gateway_payments WHERE id = $1", [paymentId]);
    if (!ex[0]) throw httpErr("Payment not found", 404);
    if (ex[0].refund_status === "refunded") throw httpErr("This payment has already been refunded", 409);
    if (ex[0].refund_status === "processing") throw httpErr("A refund for this payment is already in progress", 409);
    throw httpErr("Only a payment that was received can be refunded", 409);
  }
  const payment = rows[0];
  const r = await requestRefund(payment.reference);
  if (!r.ok) {
    await pool.query(
      `UPDATE gateway_payments SET refund_status = $2, refund_note = $3, updated_at = now() WHERE id = $1`,
      [payment.id, payment.status === "refused" ? "failed" : null, String(r.error || "Paystack could not process the refund").slice(0, 300)]);
    throw httpErr(`Paystack could not refund this payment: ${r.error || "unknown error"}. You can try again, or refund it in the Paystack dashboard.`, 502);
  }
  await pool.query(
    `UPDATE gateway_payments SET refund_status = 'refunded', refund_reference = $2, refund_note = $3, refund_at = now(), refunded_by = $4, updated_at = now() WHERE id = $1`,
    [payment.id, r.reference || null, why, userId]);

  // An order that was paid and is being returned: mark it so nobody keeps processing it.
  if (payment.type === "order" && payment.status === "success" && payment.subject_id) {
    const { rowCount } = await pool.query(
      `UPDATE orders SET status = 'refunded', refunded_at = now(), refunded_by = $2, held = FALSE
        WHERE id = $1 AND status NOT IN ('awaiting_payment','payment_failed','cancelled','expired','refunded')`, [payment.subject_id, userId]);
    if (rowCount) {
      const client = await pool.connect();
      try { await orderEvent(client, payment.subject_id, "refunded", userId ? { id: userId, role_type: "admin" } : null, { reason: why, reference: payment.reference }); } finally { client.release(); }
    }
  }
  if (payment.user_id) {
    await notifyUser(payment.user_id, "refund_sent", { amount: Number(payment.paid_amount ?? payment.gross_amount), reference: payment.reference, reason: why }, { allChannels: true }).catch(() => {});
  }
  return { ok: true };
}
