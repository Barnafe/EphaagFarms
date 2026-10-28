import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { paystackConfigured, calculateFee, getFeeConfig } from "../services/paystack.js";
import { createPayment, startCheckout, orderExpiryHours, verifyAndSettle } from "../services/payments.js";
import { orderEvent, startOrderPayment, itemsSignature, findDuplicateOrder } from "../services/orderPayments.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => Object.assign(new Error("Online payment is unavailable right now. Please try again later."), { status: 503, expose: true });

// --- Catalog --------------------------------------------------------------

export async function catalog(req, res) {
  const { rows } = await pool.query(
    "SELECT crop, unit, sell_price AS price, category, description, icon, image_url, item_type, age_description, last_reviewed FROM standard_prices ORDER BY crop ASC"
  );
  res.json({ prices: rows });
}

// --- Buyer: place an order -------------------------------------------------
// items: [{ crop, quantity, unit, size }]
// paidVia: 'upfront' | 'balance' (balance only valid with an active standing commitment)

export async function placeOrder(req, res) {
  const {
    items,
    deliveryLocation,
    paidVia = "upfront",
    contactPhone1,
    contactPhone2,
    contactEmail,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  if (!deliveryLocation) {
    return res.status(400).json({ error: "deliveryLocation is required" });
  }
  // 2026-09-01 checkout spec: two contact numbers + an email, same shape as
  // a real shopping-site checkout menu — so whoever's coordinating delivery
  // always has a backup contact.
  if (!contactPhone1 || !contactPhone2) {
    return res.status(400).json({ error: "Two contact phone numbers are required" });
  }
  if (!contactEmail) {
    return res.status(400).json({ error: "A contact email is required" });
  }
  if (!["upfront", "balance"].includes(paidVia)) {
    return res.status(400).json({ error: "paidVia must be 'upfront' or 'balance'" });
  }

  // A missing Paystack key means "Online payment unavailable" for upfront
  // orders. It never means a free order.
  if (paidVia === "upfront" && !paystackConfigured()) {
    return res.status(503).json({ error: "Online payment is unavailable right now. Please try again later." });
  }

  // Same items for the same amount, already ordered recently? Tell the buyer on screen and let
  // them choose to go ahead (confirmDuplicate) rather than silently charging twice.
  if (!req.body.confirmDuplicate) {
    const pre = [];
    let preTotal = 0;
    for (const item of items) {
      const { rows } = await pool.query("SELECT sell_price AS price FROM standard_prices WHERE crop = $1", [item.crop]);
      const qty = Number(item.quantity);
      if (!rows[0] || !Number.isFinite(qty) || qty <= 0) { pre.length = 0; break; } // the real checks below report the error
      preTotal += Number(rows[0].price) * qty;
      pre.push({ crop: item.crop, quantity: qty, size: item.size || null });
    }
    if (pre.length === items.length) {
      const dup = await findDuplicateOrder(req.user.id, itemsSignature(pre, preTotal));
      if (dup) {
        const o = dup.order;
        return res.status(409).json({
          code: "DUPLICATE_ORDER", kind: dup.kind,
          error: dup.kind === "paid"
            ? `You already paid for this same order (${o.reference}). Do you want to pay for it again?`
            : `You already have an unpaid order for the same items (${o.reference}).`,
          duplicate: { id: o.id, reference: o.reference, status: o.status, paidAt: o.paid_at, total: Number(o.total), expiresAt: o.expires_at, canPay: dup.kind === "unpaid" },
        });
      }
    }
  }

  const hours = await orderExpiryHours(); // read before taking a connection
  const client = await pool.connect();
  let order, pricedItems = [], total = 0;
  try {
    await client.query("BEGIN");

    // Price every line server-side from standard_prices — never trust a
    // client-supplied price.
    for (const item of items) {
      const { rows } = await client.query(
        "SELECT unit, sell_price AS price FROM standard_prices WHERE crop = $1",
        [item.crop]
      );
      const priceRow = rows[0];
      if (!priceRow) {
        throw Object.assign(new Error(`Unknown crop: ${item.crop}`), { status: 400 });
      }
      // A zero, negative or non-numeric quantity must never reach the total.
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw Object.assign(new Error(`Quantity for ${item.crop} must be a number greater than zero`), { status: 400 });
      }
      const lineTotal = Number(priceRow.price) * quantity;
      total += lineTotal;
      pricedItems.push({ crop: item.crop, quantity, unit: priceRow.unit, size: item.size || null, lineTotal });
    }

    if (paidVia === "balance") {
      // One atomic UPDATE with the balance check inside it, so two orders
      // placed at the same moment cannot both pass the check.
      const { rowCount } = await client.query(
        `UPDATE buyer_profiles SET standing_commitment_balance = standing_commitment_balance - $1
         WHERE user_id = $2 AND standing_commitment_balance >= $1`,
        [total, req.user.id]
      );
      if (!rowCount) {
        throw Object.assign(new Error("Standing balance isn't enough for this order"), { status: 400 });
      }
    }

    const reference = generateReference(REF_PREFIX.order);
    // Balance orders are already backed by verified prepaid money, so they go
    // straight to Procurement with no fee. Upfront orders wait for Paystack.
    const status = paidVia === "balance" ? "payment_confirmed" : "awaiting_payment";
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
         (reference, buyer_id, delivery_location, total, goods_total, paid_via, status,
          contact_phone_1, contact_phone_2, contact_email, expires_at, paid_at, items_signature)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [reference, req.user.id, deliveryLocation, total, paidVia, status, contactPhone1, contactPhone2, contactEmail,
       paidVia === "upfront" ? new Date(Date.now() + hours * 3600 * 1000) : null,
       paidVia === "balance" ? new Date() : null, itemsSignature(pricedItems, total)]
    );
    order = orderRows[0];

    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, crop, quantity, unit, size, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.crop, item.quantity, item.unit, item.size, item.lineTotal]
      );
    }
    await orderEvent(client, order.id, paidVia === "balance" ? "placed_paid_from_balance" : "placed_awaiting_payment", req.user, { total });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: "Could not place order" });
  } finally {
    client.release();
  }

  if (paidVia === "balance") {
    return res.status(201).json({ order: { ...order, items: pricedItems } });
  }

  // The order is saved first; only then is Paystack started.
  try {
    const email = contactEmail;
    const { payment } = await startOrderPayment(order, email);
    const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [order.id]);
    return res.status(201).json({
      order: { ...rows[0], items: pricedItems },
      payment: { reference: payment.reference, authorizationUrl: payment.authorization_url, goodsTotal: Number(payment.net_amount), fee: Number(payment.fee_amount), amountCharged: Number(payment.gross_amount) },
    });
  } catch (err) {
    console.error("Could not start payment for order", order.reference, err.message);
    // The order stays "awaiting payment" so the buyer can use Pay now from their orders.
    return res.status(err.status || 502).json({ error: err.message || "Could not start the payment", order: { ...order, items: pricedItems }, code: "PAYMENT_NOT_STARTED" });
  }
}

// What the payment processing fee will be, shown at checkout before the buyer pays.
export async function feeQuote(req, res) {
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "amount must be greater than zero" });
  const q = calculateFee(amount, await getFeeConfig());
  res.json({ goodsTotal: q.net, fee: q.fee, amountCharged: q.gross, paystackAvailable: paystackConfigured() });
}

// --- Buyer: pay (or retry) an unpaid order, cancel one ---------------------------------

async function ownOrder(req, id) {
  if (!UUID_RE.test(String(id))) throw Object.assign(new Error("Order not found"), { status: 404 });
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1 AND buyer_id = $2", [id, req.user.id]);
  if (!rows[0]) throw Object.assign(new Error("Order not found"), { status: 404 });
  return rows[0];
}

export async function payOrder(req, res) {
  const order = await ownOrder(req, req.params.id);
  if (!["awaiting_payment", "payment_failed"].includes(order.status)) {
    if (order.paid_at) return res.json({ alreadyPaid: true, message: `Good news: order ${order.reference} has already been paid, so nothing more is needed.` });
    return res.status(409).json({ error: order.status === "expired" ? "This order has expired. Please place it again." : "This order can no longer be paid." });
  }
  if (order.expires_at && new Date(order.expires_at) < new Date()) return res.status(409).json({ error: "This order has expired. Please place it again." });
  if (!paystackConfigured()) return res.status(503).json({ error: "Online payment is unavailable right now. Please try again later." });
  const r = await startOrderPayment(order, order.contact_email);
  if (r.alreadyPaid) return res.json({ alreadyPaid: true, message: `Good news: order ${order.reference} has already been paid, so nothing more is needed.` });
  const p = r.payment;
  res.json({ payment: { reference: p.reference, authorizationUrl: p.authorization_url, goodsTotal: Number(p.net_amount), fee: Number(p.fee_amount), amountCharged: Number(p.gross_amount) } });
}

export async function cancelOrder(req, res) {
  const order = await ownOrder(req, req.params.id);
  if (!["awaiting_payment", "payment_failed"].includes(order.status)) {
    return res.status(409).json({ error: "Only an unpaid order can be cancelled" });
  }
  // If a payment actually went through, do not cancel: settle it instead.
  const { rows: pend } = await pool.query(`SELECT reference FROM gateway_payments WHERE subject_id = $1 AND type='order' AND status IN ('pending','initiated')`, [order.id]);
  for (const p of pend) {
    const r = await verifyAndSettle(p.reference).catch(() => null);
    if (r?.outcome === "success" || r?.outcome === "held") return res.status(409).json({ error: "Your payment has just been received, so this order can no longer be cancelled." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status IN ('awaiting_payment','payment_failed')`, [order.id]);
    if (!rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Only an unpaid order can be cancelled" }); }
    await client.query(`UPDATE gateway_payments SET status = 'abandoned', updated_at = now() WHERE subject_id = $1 AND type='order' AND status IN ('pending','initiated')`, [order.id]);
    await orderEvent(client, order.id, "cancelled_by_buyer", req.user);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  res.json({ ok: true });
}

export async function orderReceipt(req, res) {
  const order = await ownOrder(req, req.params.id);
  if (!order.paid_at) return res.status(409).json({ error: "This order has not been paid yet" });
  const { rows: items } = await pool.query("SELECT crop, quantity, unit, size, line_total FROM order_items WHERE order_id = $1", [order.id]);
  const { rows: pay } = await pool.query(`SELECT reference, net_amount, fee_amount, gross_amount, channel, paid_at FROM gateway_payments WHERE subject_id = $1 AND type='order' AND status='success' ORDER BY paid_at LIMIT 1`, [order.id]);
  const p = pay[0];
  res.json({ receipt: {
    orderReference: order.reference, paidAt: order.paid_at, deliveryLocation: order.delivery_location, items,
    goodsTotal: Number(order.goods_total ?? order.total), fee: Number(p?.fee_amount ?? 0), totalPaid: Number(p?.gross_amount ?? order.total),
    paymentReference: p?.reference || null, method: p ? (p.channel || "Paystack") : "Standing commitment balance",
  } });
}

// --- Buyer: standing commitment -------------------------------------------

export async function setStandingCommitment(req, res) {
  const amount = Number(req.body?.amount);
  const years = Number(req.body?.years);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "amount must be a number greater than zero" });
  }
  if (![1, 2].includes(years)) {
    return res.status(400).json({ error: "years must be 1 or 2" });
  }
  if (!paystackConfigured()) return res.status(503).json({ error: "Online payment is unavailable right now. Please try again later." });

  const { rows: bp } = await pool.query(`SELECT standing_commitment_balance FROM buyer_profiles WHERE user_id = $1`, [req.user.id]);
  if (!bp[0]) return res.status(404).json({ error: "Buyer profile not found" });
  // Still refused while funds remain: a second commitment is not a way to reset the balance.
  if (Number(bp[0].standing_commitment_balance) > 0) {
    return res.status(409).json({ error: "You already have a standing commitment with funds remaining" });
  }
  // Nothing is credited here. The balance is credited only after Paystack
  // verifies the payment, and only for the amount, not the processing fee.
  const { rows: u } = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.id]);
  const email = u[0]?.email || req.body?.email;
  if (!email) return res.status(400).json({ error: "An email address is needed for the payment receipt. Add one to your profile." });
  const payment = await createPayment({ type: "commitment", userId: req.user.id, netAmount: amount, meta: { years } });
  const started = await startCheckout(payment, { email, returnPath: "/dashboard/buyer/payment-return" });
  res.status(201).json({
    payment: { reference: started.reference, authorizationUrl: started.authorization_url, goodsTotal: Number(started.net_amount), fee: Number(started.fee_amount), amountCharged: Number(started.gross_amount) },
  });
}

// --- Finance: payment confirmation --------------------------------------
// Gates Procurement — an order can't be sourced until Finance confirms
// the buyer's payment actually landed.

export async function pendingConfirmation(req, res) {
  const { rows: orders } = await pool.query(
    "SELECT * FROM orders WHERE status = 'paid' ORDER BY created_at ASC"
  );
  const { rows: buyers } = await pool.query(
    "SELECT id, name FROM users WHERE id = ANY($1::uuid[])",
    [orders.map((o) => o.buyer_id)]
  );
  const buyerName = Object.fromEntries(buyers.map((b) => [b.id, b.name]));
  res.json({ orders: orders.map((o) => ({ ...o, buyer_name: buyerName[o.buyer_id] })) });
}

export async function confirmPayment(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE orders SET status = 'payment_confirmed' WHERE id = $1 AND status = 'paid' RETURNING *",
    [id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Order not found or not awaiting confirmation" });
  res.json({ order: rows[0] });
}

export async function myOrders(req, res) {
  const { rows: orders } = await pool.query(
    "SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC",
    [req.user.id]
  );
  const { rows: items } = await pool.query(
    `SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])`,
    [orders.map((o) => o.id)]
  );
  const { rows: pays } = await pool.query(
    `SELECT DISTINCT ON (subject_id) subject_id, reference, status, fee_amount, gross_amount, channel
       FROM gateway_payments WHERE type = 'order' AND subject_id = ANY($1::uuid[]) ORDER BY subject_id, created_at DESC`,
    [orders.map((o) => o.id)]
  );
  const payBy = Object.fromEntries(pays.map((p) => [p.subject_id, p]));
  const byOrder = orders.map((o) => {
    const p = payBy[o.id];
    const unpaid = ["awaiting_payment", "payment_failed"].includes(o.status);
    return {
      ...o,
      items: items.filter((i) => i.order_id === o.id),
      can_pay: unpaid && (!o.expires_at || new Date(o.expires_at) > new Date()),
      can_cancel: unpaid,
      has_receipt: !!o.paid_at,
      waiting_for_transfer: !!p && p.status === "pending" && p.channel === "bank_transfer",
    };
  });
  res.json({ orders: byOrder });
}
