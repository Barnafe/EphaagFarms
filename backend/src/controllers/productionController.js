import { pool } from "../db/pool.js";

// Production Department (company-owned farms). This is Ephaag's OWN
// annual production record-keeping — "this year we harvested X yam, Y
// rice" — not a live sales/stock system in itself. A declared harvest
// only becomes real, sellable stock once Store separately confirms and
// receives it into store_inventory (see storeController.js), the exact
// same two-step pattern already used for a farmer's declared produce
// (declare -> someone else confirms/sources it). Production never
// touches store_inventory directly.

// --- Farms ---------------------------------------------------------------

export async function listFarms(req, res) {
  const { rows } = await pool.query(`SELECT * FROM company_farms ORDER BY created_at DESC`);
  res.json({ farms: rows });
}

export async function createFarm(req, res) {
  const { name, state, crop, sizeHectares, status } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const { rows } = await pool.query(
    `INSERT INTO company_farms (name, state, crop, size_hectares, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, state || null, crop || null, sizeHectares || null, status || "active"]
  );
  res.status(201).json({ farm: rows[0] });
}

export async function updateFarm(req, res) {
  const { id } = req.params;
  const { name, state, crop, sizeHectares, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE company_farms
     SET name = COALESCE($1, name), state = COALESCE($2, state), crop = COALESCE($3, crop),
         size_hectares = COALESCE($4, size_hectares), status = COALESCE($5, status)
     WHERE id = $6 RETURNING *`,
    [name || null, state || null, crop || null, sizeHectares || null, status || null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Farm not found" });
  res.json({ farm: rows[0] });
}

export async function deleteFarm(req, res) {
  const { id } = req.params;
  const { rows: harvests } = await pool.query(`SELECT id FROM harvest_logs WHERE farm_id = $1 LIMIT 1`, [id]);
  if (harvests[0]) {
    return res.status(400).json({ error: "Can't delete a farm with harvest records — mark it fallow/retired instead" });
  }
  const { rowCount } = await pool.query(`DELETE FROM company_farms WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Farm not found" });
  res.status(204).end();
}

// --- Harvest declarations --------------------------------------------------
// "Admin declares" a harvest, same idea as a farmer declaring produce —
// this just records that it happened; Store confirms it separately.

export async function listHarvests(req, res) {
  const { year } = req.query;
  const params = [];
  let where = "";
  if (year) {
    params.push(Number(year));
    where = `WHERE EXTRACT(YEAR FROM h.harvested_at) = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT h.*, f.name AS farm_name, f.state AS farm_state,
            d.name AS declared_by_name, r.name AS received_by_name
     FROM harvest_logs h
     JOIN company_farms f ON f.id = h.farm_id
     LEFT JOIN users d ON d.id = h.declared_by
     LEFT JOIN users r ON r.id = h.received_by
     ${where}
     ORDER BY h.harvested_at DESC, h.id DESC`,
    params
  );
  res.json({ harvests: rows });
}

export async function declareHarvest(req, res) {
  const { farmId, crop, quantity, unit, harvestedAt, note } = req.body;
  if (!farmId || !crop || !quantity || !unit) {
    return res.status(400).json({ error: "farmId, crop, quantity, and unit are required" });
  }
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: "quantity must be a positive number" });

  const { rows: farmRows } = await pool.query(`SELECT * FROM company_farms WHERE id = $1`, [farmId]);
  if (!farmRows[0]) return res.status(404).json({ error: "Farm not found" });

  const { rows } = await pool.query(
    `INSERT INTO harvest_logs (farm_id, crop, quantity, unit, harvested_at, declared_by, note)
     VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7) RETURNING *`,
    [farmId, crop, qty, unit, harvestedAt || null, req.user.id, note || null]
  );
  res.status(201).json({ harvest: rows[0] });
}

// --- Annual summary --------------------------------------------------------
// The actual point of this department per the user: an annual record of
// company farming achievements by crop, independent of what Store has or
// hasn't received yet.

export async function annualSummary(req, res) {
  const { year } = req.query;
  const params = [];
  let where = "";
  if (year) {
    params.push(Number(year));
    where = `WHERE EXTRACT(YEAR FROM harvested_at) = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT crop, unit, COUNT(*) AS declarations,
            SUM(quantity) AS total_declared,
            SUM(CASE WHEN status = 'received' THEN quantity_received ELSE 0 END) AS total_received
     FROM harvest_logs
     ${where}
     GROUP BY crop, unit
     ORDER BY crop ASC`,
    params
  );
  res.json({
    year: year ? Number(year) : null,
    summary: rows.map((r) => ({
      crop: r.crop,
      unit: r.unit,
      declarations: Number(r.declarations),
      totalDeclared: Number(r.total_declared),
      totalReceived: Number(r.total_received),
    })),
  });
}
