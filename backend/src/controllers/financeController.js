import { pool } from "../db/pool.js";

// --- Price management (2026-08-30 spec) ------------------------------------
// admin-only editor for the two prices split above: buy_price (paid to
// farmers) and sell_price (charged to buyers) — deliberately different so
// the company isn't buying and selling at the same number. See
// [[ephaag-farms]] memory for the seeded-15%-placeholder note; this is
// where that placeholder actually gets corrected.

// --- Dashboard (2026-09-05 spec) ---------------------------------------
// Top-level "Dashboard" tab summary — distinct from the "Accounting"
// sub-workspace's own AccountingDashboardPanel (internal budgets/bank/
// reconciliation), this one covers the marketplace-facing side of the
// department: payment confirmations, loans, settlements, investments.
export async function dashboardSummary(req, res) {
  const [
    { rows: pendingPayments },
    { rows: loanCounts },
    { rows: unpaidSettlements },
    { rows: pendingInvestments },
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM orders WHERE status = 'paid'`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM loans GROUP BY status`),
    pool.query(`SELECT COUNT(*)::int AS count FROM payments WHERE payee_type = 'farmer' AND status = 'unpaid'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM investment_applications WHERE status = 'pending'`),
  ]);

  res.json({
    pendingPaymentConfirmations: pendingPayments[0].count,
    pendingLoans: loanCounts.find((r) => r.status === "pending")?.count || 0,
    disbursedLoans: loanCounts.find((r) => r.status === "disbursed")?.count || 0,
    unpaidFarmerSettlements: unpaidSettlements[0].count,
    pendingInvestmentApplications: pendingInvestments[0].count,
  });
}

export async function listPrices(req, res) {
  const { rows } = await pool.query(
    `SELECT id, crop, unit, buy_price, sell_price, category, description, icon, image_url,
            item_type, age_description, last_reviewed
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
// list is enforced here in the controller instead. Crops only — livestock
// doesn't use this vocabulary at all (see below).
export const CATALOG_UNITS = ["kg", "tons", "bags", "tubers", "crates", "baskets"];

// 2026-09-05 spec: crops vs livestock. Livestock is priced per animal, and
// what varies the price is the animal's age/description, not a measured
// unit — so livestock rows skip CATALOG_UNITS entirely and get a fixed
// placeholder unit instead (never shown to anyone), with age_description
// carrying the buyer-facing detail ("1 year old goat", "3 months broiler").
export const ITEM_TYPES = ["crop", "livestock"];
export const LIVESTOCK_UNIT = "head";
export const CROP_CATEGORIES = ["Grains", "Tubers", "Vegetables", "Other"];
export const LIVESTOCK_CATEGORIES = ["Goat", "Chicken", "Cattle", "Sheep", "Pig", "Turkey", "Other Livestock"];

// req.body fields arrive as strings here when the request is multipart
// (an image file was attached) — same as adminCreateCourse in
// rtcController.js. req.file is only present when a photo was uploaded;
// items created with no photo just fall back to the emoji-icon tile.
export async function createPrice(req, res) {
  const { crop, unit, ageDescription, buyPrice, sellPrice, category, description, icon } = req.body;
  const itemType = ITEM_TYPES.includes(req.body.itemType) ? req.body.itemType : "crop";

  if (!crop || !crop.trim()) return res.status(400).json({ error: "Product name is required" });

  let resolvedUnit;
  let resolvedAgeDescription = null;
  if (itemType === "livestock") {
    if (!ageDescription || !ageDescription.trim()) {
      return res.status(400).json({
        error: "Age/description is required for livestock (e.g. \"1 year old\", \"3 months broiler\")",
      });
    }
    resolvedUnit = LIVESTOCK_UNIT;
    resolvedAgeDescription = ageDescription.trim();
  } else {
    if (!unit || !CATALOG_UNITS.includes(unit)) {
      return res.status(400).json({ error: `Unit must be one of: ${CATALOG_UNITS.join(", ")}` });
    }
    resolvedUnit = unit;
  }

  if (buyPrice == null || sellPrice == null) {
    return res.status(400).json({ error: "Both buy price and sell price are required" });
  }
  if (Number(buyPrice) < 0 || Number(sellPrice) < 0) {
    return res.status(400).json({ error: "Prices can't be negative" });
  }

  const existing = await pool.query(`SELECT id FROM standard_prices WHERE crop ILIKE $1`, [crop.trim()]);
  if (existing.rows[0]) {
    return res.status(409).json({ error: "That product is already in the catalog — edit it instead" });
  }

  const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

  const { rows } = await pool.query(
    `INSERT INTO standard_prices
       (crop, unit, price, buy_price, sell_price, category, description, icon, image_url,
        item_type, age_description, last_reviewed)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE)
     RETURNING id, crop, unit, buy_price, sell_price, category, description, icon, image_url,
               item_type, age_description, last_reviewed`,
    [
      crop.trim(),
      resolvedUnit,
      Number(buyPrice),
      Number(sellPrice),
      category?.trim() || null,
      description?.trim() || null,
      icon?.trim() || null,
      imageUrl,
      itemType,
      resolvedAgeDescription,
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
     RETURNING id, crop, unit, buy_price, sell_price, category, description, icon, image_url,
               item_type, age_description, last_reviewed`,
    [imageUrl, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Price row not found" });
  res.json({ price: rows[0] });
}

// PATCH /finance/prices/:id — deliberately handles two different callers
// with two different shapes of edit: Add Price (PriceEditorPanel) only ever
// sends { buyPrice, sellPrice }; Add Catalog's own edit form (2026-09-05
// spec, item #4 — every catalog row now has an edit/delete action) can also
// send crop/unit-or-ageDescription/category/description/itemType. Any field
// left out keeps its current value (COALESCE), same as before.
export async function updatePrice(req, res) {
  const { id } = req.params;
  const { crop, buyPrice, sellPrice, unit, ageDescription, category, description } = req.body;
  const itemType = req.body.itemType != null ? req.body.itemType : undefined;

  if (
    buyPrice == null &&
    sellPrice == null &&
    !crop &&
    !unit &&
    ageDescription == null &&
    !category &&
    description == null &&
    itemType === undefined
  ) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  if (itemType !== undefined && !ITEM_TYPES.includes(itemType)) {
    return res.status(400).json({ error: `itemType must be one of: ${ITEM_TYPES.join(", ")}` });
  }
  if (buyPrice != null && Number(buyPrice) < 0) return res.status(400).json({ error: "Prices can't be negative" });
  if (sellPrice != null && Number(sellPrice) < 0) return res.status(400).json({ error: "Prices can't be negative" });

  // Resolve unit/age_description together whenever the type or either of
  // them is being changed, same crop/livestock split as createPrice.
  let resolvedUnit;
  let resolvedAgeDescription;
  const effectiveType = itemType ?? (await pool.query(`SELECT item_type FROM standard_prices WHERE id = $1`, [id])).rows[0]?.item_type;
  if (itemType !== undefined || unit !== undefined || ageDescription !== undefined) {
    if (effectiveType === "livestock") {
      if (ageDescription !== undefined) {
        if (!ageDescription || !ageDescription.trim()) {
          return res.status(400).json({ error: "Age/description is required for livestock" });
        }
        resolvedAgeDescription = ageDescription.trim();
      }
      resolvedUnit = LIVESTOCK_UNIT;
    } else {
      if (unit !== undefined) {
        if (!CATALOG_UNITS.includes(unit)) {
          return res.status(400).json({ error: `Unit must be one of: ${CATALOG_UNITS.join(", ")}` });
        }
        resolvedUnit = unit;
      }
      resolvedAgeDescription = null;
    }
  }

  if (crop != null && !crop.trim()) return res.status(400).json({ error: "Product name can't be blank" });

  const { rows } = await pool.query(
    `UPDATE standard_prices
     SET crop = COALESCE($1, crop),
         buy_price = COALESCE($2, buy_price),
         sell_price = COALESCE($3, sell_price),
         unit = COALESCE($4, unit),
         age_description = COALESCE($5, age_description),
         category = COALESCE($6, category),
         description = COALESCE($7, description),
         item_type = COALESCE($8, item_type),
         last_reviewed = CURRENT_DATE
     WHERE id = $9
     RETURNING id, crop, unit, buy_price, sell_price, category, description, icon, image_url,
               item_type, age_description, last_reviewed`,
    [
      crop?.trim() ?? null,
      buyPrice ?? null,
      sellPrice ?? null,
      resolvedUnit ?? null,
      resolvedAgeDescription ?? null,
      category?.trim() ?? null,
      description !== undefined ? description?.trim() || null : null,
      itemType ?? null,
      id,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: "Price row not found" });
  res.json({ price: rows[0] });
}

// DELETE /finance/prices/:id (2026-09-05 spec, item #4) — order_items/
// harvest_logs/farmer_products all snapshot crop name+unit as plain text
// rather than FK-ing to standard_prices, so removing a catalog row is safe
// and never cascades into past orders or other departments' records; it
// simply stops showing up as a listable/priceable item going forward.
export async function deletePrice(req, res) {
  const { id } = req.params;
  const { rowCount } = await pool.query(`DELETE FROM standard_prices WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Price row not found" });
  res.status(204).end();
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
