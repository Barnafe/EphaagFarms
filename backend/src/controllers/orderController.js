import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";

// --- Catalog --------------------------------------------------------------

export async function catalog(req, res) {
  const { rows } = await pool.query(
    "SELECT crop, unit, sell_price AS price, category, description, icon, last_reviewed FROM standard_prices ORDER BY crop ASC"
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Price every line server-side from standard_prices — never trust a
    // client-supplied price.
    let total = 0;
    const pricedItems = [];
    for (const item of items) {
      const { rows } = await client.query(
        "SELECT unit, sell_price AS price FROM standard_prices WHERE crop = $1",
        [item.crop]
      );
      const priceRow = rows[0];
      if (!priceRow) {
        throw Object.assign(new Error(`Unknown crop: ${item.crop}`), { status: 400 });
      }
      const lineTotal = Number(priceRow.price) * Number(item.quantity);
      total += lineTotal;
      pricedItems.push({
        crop: item.crop,
        quantity: item.quantity,
        unit: priceRow.unit,
        size: item.size || null,
        lineTotal,
      });
    }

    if (paidVia === "balance") {
      const { rows } = await client.query(
        "SELECT standing_commitment_balance FROM buyer_profiles WHERE user_id = $1",
        [req.user.id]
      );
      const balance = Number(rows[0]?.standing_commitment_balance || 0);
      if (balance < total) {
        throw Object.assign(new Error("Standing balance isn't enough for this order"), {
          status: 400,
        });
      }
      await client.query(
        `UPDATE buyer_profiles SET standing_commitment_balance = standing_commitment_balance - $1
         WHERE user_id = $2`,
        [total, req.user.id]
      );
    }

    const reference = generateReference(REF_PREFIX.order);
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
         (reference, buyer_id, delivery_location, total, paid_via, status,
          contact_phone_1, contact_phone_2, contact_email)
       VALUES ($1, $2, $3, $4, $5, 'paid', $6, $7, $8) RETURNING *`,
      [reference, req.user.id, deliveryLocation, total, paidVia, contactPhone1, contactPhone2, contactEmail]
    );
    const order = orderRows[0];

    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, crop, quantity, unit, size, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.crop, item.quantity, item.unit, item.size, item.lineTotal]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ order: { ...order, items: pricedItems } });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not place order" });
  } finally {
    client.release();
  }
}

// --- Buyer: standing commitment -------------------------------------------

export async function setStandingCommitment(req, res) {
  const { amount, years } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "amount is required" });
  if (![1, 2].includes(Number(years))) {
    return res.status(400).json({ error: "years must be 1 or 2" });
  }

  const { rows } = await pool.query(
    `UPDATE buyer_profiles
     SET standing_commitment_total = $1, standing_commitment_balance = $1, standing_commitment_years = $2
     WHERE user_id = $3 RETURNING *`,
    [amount, years, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Buyer profile not found" });
  res.json({ commitment: rows[0] });
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
  const byOrder = orders.map((o) => ({
    ...o,
    items: items.filter((i) => i.order_id === o.id),
  }));
  res.json({ orders: byOrder });
}
