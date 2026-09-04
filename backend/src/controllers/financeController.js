import { pool } from "../db/pool.js";

// --- Price management (2026-08-30 spec) ------------------------------------
// admin-only editor for the two prices split above: buy_price (paid to
// farmers) and sell_price (charged to buyers) — deliberately different so
// the company isn't buying and selling at the same number. See
// [[ephaag-farms]] memory for the seeded-15%-placeholder note; this is
// where that placeholder actually gets corrected.

export async function listPrices(req, res) {
  const { rows } = await pool.query(
    `SELECT id, crop, unit, buy_price, sell_price, category, description, icon, image_url, last_reviewed
     FROM standard_prices ORDER BY crop ASC`
  );
  res.json({ prices: rows });
}

// --- Add Catalog (2026-09-03 spec; unit changed to a fixed dropdown 2026-09-04) ---
// Creates a brand-new crop/product entry — distinct from updatePrice below,
// which only edits a crop that already exists. This is the single place a
// new product enters the system: once inserted here it automatically shows
// up in the buyer's Product Catalog (ProductCatalog.jsx merges every row
// from GET /orders/catalog with catalogMeta.js, falling back to generic
// category/icon/description for any crop catalogMeta.js doesn't know about)
// and in every other screen that reads standard_prices (farmer's visible
// prices, procurement's price list, order costing). No separate "publish"
// step needed.
//
// Unit is a fixed pick-list, not free text — reuses the exact same
// vocabulary as farmer_products/farmer_declarations' `unit` CHECK
// constraint (see migration 001_init.sql), so the whole app speaks one
// consistent unit vocabulary whether a farmer is listing or an admin is
// cataloging. standard_prices itself has no DB-level CHECK on unit, so this
// list is enforced here in the controller instead.
export const CATALOG_UNITS = ["kg", "tons", "bags", "tubers", "crates", "baskets"];

// req.body fields arrive as strings here when the request is multipart
// (an image file was attached) — same as adminCreateCourse in
// rtcController.js. req.file is only present when a photo was uploaded;
// items created with no photo just fall back to the emoji-icon tile.
export async function createPrice(req, res) {
  const { crop, unit, buyPrice, sellPrice, category, description, icon } = req.body;
  if (!crop || !crop.trim()) return res.status(400).json({ error: "Crop/product name is required" });
  if (!unit || !CATALOG_UNITS.includes(unit)) {
    return res.status(400).json({ error: `Unit must be one of: ${CATALOG_UNITS.join(", ")}` });
  }
  if (buyPrice == null || sellPrice == null) {
    return res.status(400).json({ error: "Both buy price and sell price are required" });
  }
  if (Number(buyPrice) < 0 || Number(sellPrice) < 0) {
    return res.status(400).json({ error: "Prices can't be negative" });
  }

  const existing = await pool.query(`SELECT id FROM standard_prices WHERE crop ILIKE $1`, [crop.trim()]);
  if (existing.rows[0]) {
    return res.status(409).json({ error: "That crop/product is already in the catalog — edit its price instead" });
  }

  const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

  const { rows } = await pool.query(
    `INSERT INTO standard_prices (crop, unit, price, buy_price, sell_price, category, description, icon, image_url, last_reviewed)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, CURRENT_DATE)
     RETURNING id, crop, unit, buy_price, sell_price, category, description, icon, image_url, last_reviewed`,
    [
      crop.trim(),
      unit,
      Number(buyPrice),
      Number(sellPrice),
      category?.trim() || null,
      description?.trim() || null,
      icon?.trim() || null,
      imageUrl,
    ]
  );
  res.status(201).json({ price: rows[0] });
}

// Attach/replace the photo on a catalog item that already exists — lets
// admin fix or add a photo after the fact from the "Already in the
// catalog" table, without having to touch price/unit/category again.
export async function uploadPriceImage(req, res) {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const imageUrl = `/uploads/products/${req.file.filename}`;
  const { rows } = await pool.query(
    `UPDATE standard_prices SET image_url = $1 WHERE id = $2
     RETURNING id, crop, unit, buy_price, sell_price, category, description, icon, image_url, last_reviewed`,
    [imageUrl, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Price row not found" });
  res.json({ price: rows[0] });
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
     RETURNING id, crop, unit, buy_price, sell_price, category, description, icon, image_url, last_reviewed`,
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
