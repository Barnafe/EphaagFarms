import { pool } from "../db/pool.js";

// --- Price management (2026-08-30 spec) ------------------------------------
// admin-only editor for the two prices split above: buy_price (paid to
// farmers) and sell_price (charged to buyers) — deliberately different so
// the company isn't buying and selling at the same number. See
// [[ephaag-farms]] memory for the seeded-15%-placeholder note; this is
// where that placeholder actually gets corrected.

export async function listPrices(req, res) {
  const { rows } = await pool.query(
    `SELECT id, crop, unit, buy_price, sell_price, last_reviewed
     FROM standard_prices ORDER BY crop ASC`
  );
  res.json({ prices: rows });
}

export async function updatePrice(req, res) {
  const { id } = req.params;
  const { buyPrice, sellPrice } = req.body;
  if (buyPrice == null && sellPrice == null) {
    return res.status(400).json({ error: "buyPrice and/or sellPrice is required" });
  }
  const { rows } = await pool.query(
    `UPDATE standard_prices
     SET buy_price = COALESCE($1, buy_price),
         sell_price = COALESCE($2, sell_price),
         last_reviewed = CURRENT_DATE
     WHERE id = $3
     RETURNING id, crop, unit, buy_price, sell_price, last_reviewed`,
    [buyPrice ?? null, sellPrice ?? null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Price row not found" });
  res.json({ price: rows[0] });
}

// --- Settlements (2026-08-30 spec) -----------------------------------------
// Transporters are staff (Transport dept, paid salary) — never settled per-
// order, so payee_type is always 'farmer' here. A `payments` row is created
// automatically at the moment Procurement sources a listing (see
// procurementController.sourceOrder) — this is just the view + "mark paid"
// action over those rows. Processor settlement was not part of this spec
// and isn't built here — flagged as still-open in [[ephaag-farms]] memory.

export async function listFarmerPayments(req, res) {
  const { rows } = await pool.query(
    `SELECT p.id, p.order_id, p.amount, p.status, o.reference AS order_reference,
            u.id AS farmer_id, u.name AS farmer_name
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN users u ON u.id = p.payee_id
     WHERE p.payee_type = 'farmer'
     ORDER BY p.status ASC, o.created_at DESC`
  );
  res.json({ payments: rows });
}

export async function markPaymentPaid(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE payments SET status = 'paid' WHERE id = $1 AND payee_type = 'farmer' RETURNING *`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Payment not found" });
  res.json({ payment: rows[0] });
}
