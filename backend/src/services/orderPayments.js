import { pool, detached } from "../db/pool.js";
import { registerPaymentType, createPayment, startCheckout, verifyAndSettle, reviewThreshold, orderExpiryHours, notifyFinance, TYPE_LABEL } from "./payments.js";
import { notifyUser } from "./messaging.js";
import { getSetting } from "../utils/settings.js";
import "./paymentTemplates.js";

export async function orderEvent(client, orderId, event, actor = null, detail = {}) {
  await client.query(
    `INSERT INTO order_events (order_id, event, actor_id, actor_role, detail) VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [orderId, event, actor?.id || null, actor?.role_type || (actor ? null : "system"), JSON.stringify(detail)]);
}

async function confirmOrder(client, order, payment, { via = "paystack", actor = null } = {}) {
  await client.query(
    `UPDATE orders SET status = 'payment_confirmed', paid_at = COALESCE(paid_at, now()), payment_reference = $2, held = FALSE WHERE id = $1`,
    [order.id, payment.reference]);
  await orderEvent(client, order.id, "payment_confirmed", actor, { via, reference: payment.reference, amount: Number(payment.gross_amount) });
}

async function afterConfirmed(order, payment, review) {
  const { rows: u } = await pool.query("SELECT name FROM users WHERE id = $1", [order.buyer_id]);
  await notifyUser(order.buyer_id, "order_receipt", {
    reference: order.reference, goodsTotal: Number(payment.net_amount), fee: Number(payment.fee_amount),
    amountCharged: Number(payment.gross_amount), deliveryLocation: order.delivery_location, paymentReference: payment.reference,
  });
  await notifyFinance("payment_finance_notice", {
    typeLabel: TYPE_LABEL.order, payer: u[0]?.name || "buyer", netAmount: Number(payment.net_amount), fee: Number(payment.fee_amount),
    grossAmount: Number(payment.gross_amount), reference: payment.reference, review,
  });
}

registerPaymentType("order", {
  async apply(payment, client) {
    const { rows } = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [payment.subject_id]);
    const order = rows[0];
    if (!order) return { refuse: { reason: "order_cancelled" } };

    if (["awaiting_payment", "payment_failed"].includes(order.status)) {
      await confirmOrder(client, order, payment);
      const flags = []; let review = "";
      const threshold = await reviewThreshold(client);
      if (threshold !== null && Number(order.goods_total ?? order.total) >= threshold) {
        review = `order of ₦${Number(order.goods_total ?? order.total).toLocaleString()} is above the review threshold`;
        flags.push({ kind: "review", reason: "large_order", detail: review });
      }
      return { flags, after: () => afterConfirmed(order, payment, review) };
    }
    // The payment channel for these orders is closed. If money still arrives (a payment
    // page left open in another tab), it is refused and returned, never used.
    if (order.status === "expired") return { refuse: { reason: "order_expired" } };
    if (order.status === "cancelled") return { refuse: { reason: "order_cancelled" } };
    // Already paid (confirmed or further along): this is a second payment for the same order.
    return { refuse: { reason: "duplicate_payment" } };
  },

  async onRefused(payment, reason, client) {
    if (payment.subject_id) await orderEvent(client, payment.subject_id, "payment_refused", null, { reason, reference: payment.reference, amount: Number(payment.paid_amount ?? payment.gross_amount) });
  },
});

registerPaymentType("commitment", {
  async apply(payment, client) {
    const years = Number(payment.meta?.years) || 1;
    const amount = Number(payment.net_amount); // only the amount, never the fee
    const { rows } = await client.query(
      `UPDATE buyer_profiles SET
         standing_commitment_total = CASE WHEN standing_commitment_balance <= 0 THEN $1 ELSE standing_commitment_total + $1 END,
         standing_commitment_balance = standing_commitment_balance + $1,
         standing_commitment_years = COALESCE(standing_commitment_years, $2),
         commitment_funded_at = now()
       WHERE user_id = $3 RETURNING user_id`, [amount, years, payment.user_id]);
    if (!rows[0]) return { refuse: { reason: "no_buyer_profile" } };
    return {
      after: async () => {
        await notifyUser(payment.user_id, "commitment_receipt", { amount });
        const { rows: u } = await pool.query("SELECT name FROM users WHERE id = $1", [payment.user_id]);
        await notifyFinance("payment_finance_notice", { typeLabel: TYPE_LABEL.commitment, payer: u[0]?.name || "buyer", netAmount: amount, fee: Number(payment.fee_amount), grossAmount: Number(payment.gross_amount), reference: payment.reference, review: "" });
      },
    };
  },
});

// ---- starting a payment for an order ------------------------------------------------
export const PAID_STATUSES = ["paid", "payment_confirmed", "sourcing", "processing", "allocated", "in_transit", "delivered"];

/**
 * New Paystack attempt for an unpaid order. The payment channel only exists while the
 * order is payable: an expired, cancelled or already-paid order gets no link at all.
 * Returns { alreadyPaid } when Paystack says an earlier attempt did go through.
 */
export async function startOrderPayment(order, email) {
  const { rows: fresh } = await pool.query("SELECT * FROM orders WHERE id = $1", [order.id]);
  const o = fresh[0];
  if (!o) throw Object.assign(new Error("Order not found"), { status: 404 });
  if (PAID_STATUSES.includes(o.status)) return { alreadyPaid: true, order: o };
  if (!["awaiting_payment", "payment_failed"].includes(o.status)) {
    throw Object.assign(new Error(o.status === "expired" ? "This order has expired. Please place it again." : "This order can no longer be paid."), { status: 409, expose: true });
  }
  if (o.expires_at && new Date(o.expires_at) < new Date()) {
    throw Object.assign(new Error("This order has expired. Please place it again."), { status: 409, expose: true });
  }
  // Settle anything already paid before handing out a link (two tabs, a slow webhook).
  const { rows: pending } = await pool.query(
    `SELECT * FROM gateway_payments WHERE subject_id = $1 AND type = 'order' AND status IN ('initiated','pending') ORDER BY created_at DESC`, [o.id]);
  for (const p of pending) {
    const r = await verifyAndSettle(p.reference).catch(() => null);
    if (r?.outcome === "success") return { alreadyPaid: true, payment: r.payment, order: o };
  }
  const reuse = pending.find((p) => p.authorization_url && new Date(p.created_at) > new Date(Date.now() - 3600 * 1000));
  if (reuse) {
    const { rows: again } = await pool.query("SELECT * FROM gateway_payments WHERE id = $1", [reuse.id]);
    if (["initiated", "pending"].includes(again[0].status)) return { payment: again[0] };
  }
  const payment = await createPayment({ type: "order", userId: o.buyer_id, subjectId: o.id, netAmount: o.goods_total ?? o.total, meta: { orderReference: o.reference } });
  await pool.query(`UPDATE orders SET fee_amount = $2, amount_charged = $3 WHERE id = $1`, [o.id, payment.fee_amount, payment.gross_amount]);
  const started = await startCheckout(payment, { email, returnPath: "/dashboard/buyer/payment-return" });
  return { payment: started };
}

/** "Same items, same amount" signature used to spot an accidental second order. */
export function itemsSignature(pricedItems, total) {
  const lines = pricedItems.map((i) => `${i.crop}|${Number(i.quantity)}|${i.size || ""}`).sort();
  return `${lines.join(";")}#${Number(total).toFixed(2)}`;
}

/**
 * Has this buyer already ordered (and paid, or started paying for) exactly this
 * within the duplicate window? Pending payments are checked with Paystack first, so a
 * payment that really went through is reported as paid, not as unpaid.
 */
export async function findDuplicateOrder(buyerId, signature) {
  const hours = Number(await getSetting("duplicate_window_hours", 24)) || 24;
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE buyer_id = $1 AND items_signature = $2 AND created_at > now() - ($3 || ' hours')::interval
       AND status NOT IN ('cancelled','expired','payment_failed','refunded') ORDER BY created_at DESC LIMIT 5`, [buyerId, signature, String(hours)]);
  for (const o of rows) {
    if (o.status === "awaiting_payment") {
      const { rows: pend } = await pool.query(`SELECT reference FROM gateway_payments WHERE subject_id = $1 AND type='order' AND status IN ('initiated','pending')`, [o.id]);
      for (const p of pend) await verifyAndSettle(p.reference).catch(() => null);
      const { rows: now } = await pool.query("SELECT * FROM orders WHERE id = $1", [o.id]);
      o.status = now[0].status; o.paid_at = now[0].paid_at;
    }
  }
  const paid = rows.find((o) => PAID_STATUSES.includes(o.status));
  if (paid) return { kind: "paid", order: paid };
  const unpaid = rows.find((o) => o.status === "awaiting_payment" && (!o.expires_at || new Date(o.expires_at) > new Date()));
  if (unpaid) return { kind: "unpaid", order: unpaid };
  return null;
}

// ---- jobs -----------------------------------------------------------------------------
/** Unpaid orders expire after 24 hours. A payment that did arrive is settled first. */
export async function expireUnpaidOrders({ now = new Date() } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE status IN ('awaiting_payment','payment_failed') AND expires_at IS NOT NULL AND expires_at < $1`, [now]);
  let expired = 0, settled = 0;
  const hours = await orderExpiryHours();
  for (const o of rows) {
    const { rows: pend } = await pool.query(`SELECT reference FROM gateway_payments WHERE subject_id = $1 AND type = 'order' AND status IN ('pending','initiated')`, [o.id]);
    let paid = false;
    for (const p of pend) {
      const r = await verifyAndSettle(p.reference).catch(() => null);
      if (r?.outcome === "success") paid = true;
    }
    if (paid) { settled++; continue; }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rowCount } = await client.query(`UPDATE orders SET status = 'expired' WHERE id = $1 AND status IN ('awaiting_payment','payment_failed')`, [o.id]);
      if (rowCount) {
        await client.query(`UPDATE gateway_payments SET status = 'abandoned', updated_at = now() WHERE subject_id = $1 AND type = 'order' AND status IN ('pending','initiated')`, [o.id]);
        await orderEvent(client, o.id, "expired", null, { afterHours: hours });
        expired++;
      }
      await client.query("COMMIT");
      client.release();
      if (rowCount) detached(() => notifyUser(o.buyer_id, "order_expired", { reference: o.reference, hours }).catch(() => {}));
    } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  }
  return { expired, settledBeforeExpiry: settled };
}

/** Re-check payments stuck as pending from the last 48 hours (a webhook that never came). */
export async function recheckStuckPayments({ limit = 300 } = {}) {
  const { rows } = await pool.query(
    `SELECT p.reference FROM gateway_payments p
      WHERE p.status IN ('initiated','pending') AND p.created_at > now() - interval '48 hours' AND p.created_at < now() - interval '5 minutes'
        AND NOT EXISTS (SELECT 1 FROM payment_flags f WHERE f.payment_id = p.id AND f.status = 'open')
      ORDER BY p.created_at DESC LIMIT $1`, [limit]);   // newest first: recent payments are the likeliest to be genuine
  let settled = 0, unreachable = 0;
  for (const r of rows) {
    const out = await verifyAndSettle(r.reference).catch(() => ({ unreachable: true }));
    if (out.unreachable) unreachable++; else if (out.outcome === "success" || out.outcome === "held") settled++;
  }
  return { checked: rows.length, settled, unreachable };
}
