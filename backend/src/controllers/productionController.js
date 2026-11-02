import { pool } from "../db/pool.js";

const FARM_KINDS = ["crop", "livestock"];
const COST_CATEGORIES = ["inputs", "labour", "other"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (res, msg, status = 400) => res.status(status).json({ error: msg });
const money = (v) => Math.round(Number(v) * 100) / 100;
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const today = () => new Date().toISOString().slice(0, 10);

// Production Department (company-owned farms). This is Ephaag's OWN
// annual production record-keeping, "this year we harvested X yam, Y
// rice", not a live sales/stock system in itself. A declared harvest
// only becomes real, sellable stock once Store separately confirms and
// receives it into store_inventory (see storeController.js), the exact
// same two-step pattern already used for a farmer's declared produce
// (declare -> someone else confirms/sources it). Production never
// touches store_inventory directly.

// --- Dashboard (2026-09-05 spec) --------------------------------------
// Quick at-a-glance summary for the department's own landing tab, same
// pattern as maintenanceController.dashboardSummary / AdminHub's cards.

export async function dashboardSummary(req, res) {
  const [{ rows: farmCounts }, { rows: harvestYear }, { rows: pendingReceipt }, { rows: money_ }] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count FROM company_farms GROUP BY status`),
    pool.query(
      `SELECT COUNT(*)::int AS count, COUNT(DISTINCT crop)::int AS distinct_crops
       FROM harvest_logs WHERE date_part('year', harvested_at) = date_part('year', CURRENT_DATE)`
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM harvest_logs WHERE status = 'declared'`),
    pool.query(
      `SELECT (SELECT COALESCE(SUM(revenue), 0) FROM harvest_logs WHERE date_part('year', harvested_at) = date_part('year', CURRENT_DATE)) AS revenue,
              (SELECT COALESCE(SUM(amount), 0) FROM farm_costs WHERE date_part('year', incurred_on) = date_part('year', CURRENT_DATE)) AS costs,
              (SELECT COUNT(*)::int FROM company_farms WHERE kind = 'livestock') AS livestock_farms`
    ),
  ]);

  const activeFarms = farmCounts.find((r) => r.status === "active")?.count || 0;
  const fallowFarms = farmCounts.find((r) => r.status === "fallow")?.count || 0;

  res.json({
    activeFarms,
    fallowFarms,
    harvestsThisYear: harvestYear[0].count,
    distinctCropsThisYear: harvestYear[0].distinct_crops,
    awaitingStoreReceipt: pendingReceipt[0].count,
    livestockFarms: money_[0].livestock_farms,
    revenueThisYear: Number(money_[0].revenue),
    costsThisYear: Number(money_[0].costs),
    profitThisYear: Number(money_[0].revenue) - Number(money_[0].costs),
  });
}

// --- Farms ---------------------------------------------------------------

export async function listFarms(req, res) {
  const { rows } = await pool.query(`SELECT * FROM company_farms ORDER BY created_at DESC`);
  res.json({ farms: rows });
}

export async function createFarm(req, res) {
  const { name, state, crop, sizeHectares, status, kind } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  if (kind !== undefined && !FARM_KINDS.includes(kind)) return bad(res, "kind must be 'crop' or 'livestock'");
  const { rows } = await pool.query(
    `INSERT INTO company_farms (name, state, crop, size_hectares, status, kind)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, state || null, crop || null, sizeHectares || null, status || "active", kind || "crop"]
  );
  res.status(201).json({ farm: rows[0] });
}

export async function updateFarm(req, res) {
  const { id } = req.params;
  const { name, state, crop, sizeHectares, status, kind } = req.body;
  if (kind !== undefined && !FARM_KINDS.includes(kind)) return bad(res, "kind must be 'crop' or 'livestock'");
  const { rows } = await pool.query(
    `UPDATE company_farms
     SET name = COALESCE($1, name), state = COALESCE($2, state), crop = COALESCE($3, crop),
         size_hectares = COALESCE($4, size_hectares), status = COALESCE($5, status), kind = COALESCE($7, kind)
     WHERE id = $6 RETURNING *`,
    [name || null, state || null, crop || null, sizeHectares || null, status || null, id, kind || null]
  );
  if (!rows[0]) return res.status(404).json({ error: "Farm not found" });
  res.json({ farm: rows[0] });
}

export async function deleteFarm(req, res) {
  const { id } = req.params;
  const { rows: harvests } = await pool.query(`SELECT id FROM harvest_logs WHERE farm_id = $1 LIMIT 1`, [id]);
  const { rows: costs } = await pool.query(`SELECT id FROM farm_costs WHERE farm_id = $1 LIMIT 1`, [id]);
  if (harvests[0] || costs[0]) {
    return res.status(400).json({ error: "Can't delete a farm with harvest or cost records, mark it fallow/retired instead" });
  }
  const { rowCount } = await pool.query(`DELETE FROM company_farms WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Farm not found" });
  res.status(204).end();
}

// --- Harvest declarations --------------------------------------------------
// "Admin declares" a harvest, same idea as a farmer declaring produce, // this just records that it happened; Store confirms it separately.

export async function listHarvests(req, res) {
  const { year } = req.query;
  const params = [];
  let where = "";
  if (year) {
    params.push(Number(year));
    where = `WHERE EXTRACT(YEAR FROM h.harvested_at) = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT h.*, f.name AS farm_name, f.state AS farm_state, f.kind AS farm_kind,
            d.name AS declared_by_name, r.name AS received_by_name,
            COALESCE((SELECT SUM(c.amount) FROM farm_costs c WHERE c.harvest_id = h.id), 0) AS linked_costs
     FROM harvest_logs h
     JOIN company_farms f ON f.id = h.farm_id
     LEFT JOIN users d ON d.id = h.declared_by
     LEFT JOIN users r ON r.id = h.received_by
     ${where}
     ORDER BY h.harvested_at DESC, h.id DESC`,
    params
  );
  res.json({
    harvests: rows.map((h) => {
      const costs = Number(h.linked_costs);
      const revenue = h.revenue === null ? null : Number(h.revenue);
      return { ...h, linked_costs: costs, revenue, profit: revenue === null ? null : revenue - costs };
    }),
  });
}

export async function declareHarvest(req, res) {
  const { farmId, crop, quantity, unit, harvestedAt, note, revenue } = req.body;
  if (!farmId || !crop || !quantity || !unit) {
    return res.status(400).json({ error: "farmId, crop, quantity, and unit are required" });
  }
  if (!UUID_RE.test(String(farmId))) return bad(res, "Farm not found", 404);
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: "quantity must be a positive number" });
  if (harvestedAt && !isDay(harvestedAt)) return bad(res, "harvestedAt must be a valid date (YYYY-MM-DD)");
  if (harvestedAt && harvestedAt > today()) return bad(res, "A harvest can't be dated in the future");
  const rev = revenue === undefined || revenue === null || revenue === "" ? null : money(revenue);
  if (rev !== null && (!Number.isFinite(rev) || rev < 0)) return bad(res, "revenue must be a number, 0 or more");

  const { rows: farmRows } = await pool.query(`SELECT * FROM company_farms WHERE id = $1`, [farmId]);
  if (!farmRows[0]) return res.status(404).json({ error: "Farm not found" });

  const { rows } = await pool.query(
    `INSERT INTO harvest_logs (farm_id, crop, quantity, unit, harvested_at, declared_by, note, revenue)
     VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7, $8) RETURNING *`,
    [farmId, crop, qty, unit, harvestedAt || null, req.user.id, note || null, rev]
  );
  res.status(201).json({ harvest: rows[0] });
}

// What a harvest was worth (so its profit can be seen). Can be filled in or corrected later.
export async function updateHarvest(req, res) {
  if (!UUID_RE.test(String(req.params.id))) return bad(res, "Harvest not found", 404);
  const { revenue, note } = req.body || {};
  if (revenue === undefined && note === undefined) return bad(res, "Nothing to update (send revenue and/or note).");
  let rev;
  if (revenue !== undefined) {
    rev = revenue === null || revenue === "" ? null : money(revenue);
    if (rev !== null && (!Number.isFinite(rev) || rev < 0)) return bad(res, "revenue must be a number, 0 or more");
  }
  const { rows } = await pool.query(
    `UPDATE harvest_logs SET revenue = CASE WHEN $2::boolean THEN $3::numeric ELSE revenue END, note = COALESCE($4, note) WHERE id = $1 RETURNING *`,
    [req.params.id, revenue !== undefined, rev ?? null, note === undefined ? null : String(note).slice(0, 500)]);
  if (!rows[0]) return bad(res, "Harvest not found", 404);
  res.json({ harvest: rows[0] });
}

// --- Farm costs (inputs, labour, other) and profit --------------------------------------------------------------------
// A cost belongs to one farm and can be charged to one of that farm's harvests, or left as a general farm cost.
// Profit per harvest = what the harvest was worth minus the costs charged to it. Each farm's own profit also takes in
// its general costs, so nothing is hidden.

export async function listCosts(req, res) {
  const { farmId, year, harvestId } = req.query;
  const where = [], values = [];
  if (farmId) { if (!UUID_RE.test(String(farmId))) return res.json({ costs: [] }); values.push(farmId); where.push(`c.farm_id = $${values.length}`); }
  if (harvestId) { if (!UUID_RE.test(String(harvestId))) return res.json({ costs: [] }); values.push(harvestId); where.push(`c.harvest_id = $${values.length}`); }
  if (year) { values.push(Number(year)); where.push(`EXTRACT(YEAR FROM c.incurred_on) = $${values.length}`); }
  const { rows } = await pool.query(
    `SELECT c.*, f.name AS farm_name, h.crop AS harvest_crop, h.harvested_at AS harvest_date, u.name AS recorded_by_name
       FROM farm_costs c JOIN company_farms f ON f.id = c.farm_id
       LEFT JOIN harvest_logs h ON h.id = c.harvest_id LEFT JOIN users u ON u.id = c.recorded_by
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY c.incurred_on DESC, c.created_at DESC LIMIT 500`, values);
  res.json({ costs: rows.map((c) => ({ ...c, amount: Number(c.amount) })), categories: COST_CATEGORIES });
}

async function checkCostBody(b, farmId) {
  if (!COST_CATEGORIES.includes(b.category)) return `category must be one of: ${COST_CATEGORIES.join(", ")}`;
  if (!String(b.description || "").trim()) return "description is required";
  const amount = money(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "amount must be a positive number";
  if (b.incurredOn && !isDay(b.incurredOn)) return "incurredOn must be a valid date (YYYY-MM-DD)";
  if (b.incurredOn && b.incurredOn > today()) return "A cost can't be dated in the future";
  if (b.harvestId) {
    if (!UUID_RE.test(String(b.harvestId))) return "That harvest was not found";
    const { rows } = await pool.query(`SELECT farm_id FROM harvest_logs WHERE id = $1`, [b.harvestId]);
    if (!rows[0]) return "That harvest was not found";
    if (rows[0].farm_id !== farmId) return "A cost can only be charged to a harvest of the same farm";
  }
  return null;
}

export async function createCost(req, res) {
  const b = req.body || {};
  if (!b.farmId || !UUID_RE.test(String(b.farmId))) return bad(res, "farmId is required");
  const { rows: farm } = await pool.query(`SELECT id FROM company_farms WHERE id = $1`, [b.farmId]);
  if (!farm[0]) return bad(res, "Farm not found", 404);
  const problem = await checkCostBody(b, b.farmId);
  if (problem) return bad(res, problem);
  const { rows } = await pool.query(
    `INSERT INTO farm_costs (farm_id, harvest_id, category, description, amount, incurred_on, recorded_by)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), $7) RETURNING *`,
    [b.farmId, b.harvestId || null, b.category, String(b.description).trim().slice(0, 300), money(b.amount), b.incurredOn || null, req.user.id]);
  res.status(201).json({ cost: { ...rows[0], amount: Number(rows[0].amount) } });
}

export async function updateCost(req, res) {
  if (!UUID_RE.test(String(req.params.id))) return bad(res, "Cost not found", 404);
  const { rows: cur } = await pool.query(`SELECT * FROM farm_costs WHERE id = $1`, [req.params.id]);
  if (!cur[0]) return bad(res, "Cost not found", 404);
  const b = { category: cur[0].category, description: cur[0].description, amount: cur[0].amount, incurredOn: undefined, harvestId: cur[0].harvest_id, ...req.body };
  const problem = await checkCostBody(b, cur[0].farm_id);
  if (problem) return bad(res, problem);
  const harvestId = req.body && "harvestId" in req.body ? req.body.harvestId || null : cur[0].harvest_id;
  const { rows } = await pool.query(
    `UPDATE farm_costs SET category = $2, description = $3, amount = $4, incurred_on = COALESCE($5, incurred_on), harvest_id = $6 WHERE id = $1 RETURNING *`,
    [req.params.id, b.category, String(b.description).trim().slice(0, 300), money(b.amount), req.body?.incurredOn || null, harvestId]);
  res.json({ cost: { ...rows[0], amount: Number(rows[0].amount) } });
}

export async function deleteCost(req, res) {
  if (!UUID_RE.test(String(req.params.id))) return bad(res, "Cost not found", 404);
  const { rowCount } = await pool.query(`DELETE FROM farm_costs WHERE id = $1`, [req.params.id]);
  if (!rowCount) return bad(res, "Cost not found", 404);
  res.status(204).end();
}

export async function profit(req, res) {
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const [harvests, farms, byCategory] = await Promise.all([
    pool.query(
      `SELECT h.id, h.crop, h.quantity, h.unit, h.harvested_at, h.revenue, f.id AS farm_id, f.name AS farm_name, f.kind,
              COALESCE((SELECT SUM(c.amount) FROM farm_costs c WHERE c.harvest_id = h.id), 0) AS costs
         FROM harvest_logs h JOIN company_farms f ON f.id = h.farm_id
        WHERE EXTRACT(YEAR FROM h.harvested_at) = $1 ORDER BY h.harvested_at DESC, h.id DESC`, [year]),
    pool.query(
      `SELECT f.id, f.name, f.kind, f.status,
              COALESCE((SELECT SUM(h.revenue) FROM harvest_logs h WHERE h.farm_id = f.id AND EXTRACT(YEAR FROM h.harvested_at) = $1), 0) AS revenue,
              COALESCE((SELECT SUM(c.amount) FROM farm_costs c WHERE c.farm_id = f.id AND EXTRACT(YEAR FROM c.incurred_on) = $1), 0) AS costs,
              COALESCE((SELECT SUM(c.amount) FROM farm_costs c WHERE c.farm_id = f.id AND c.harvest_id IS NULL AND EXTRACT(YEAR FROM c.incurred_on) = $1), 0) AS general_costs
         FROM company_farms f ORDER BY f.name`, [year]),
    pool.query(`SELECT category, COALESCE(SUM(amount), 0) AS total FROM farm_costs WHERE EXTRACT(YEAR FROM incurred_on) = $1 GROUP BY category`, [year]),
  ]);
  const hs = harvests.rows.map((h) => {
    const revenue = h.revenue === null ? null : Number(h.revenue);
    const costs = Number(h.costs);
    return {
      id: h.id, farmId: h.farm_id, farmName: h.farm_name, kind: h.kind, crop: h.crop, quantity: Number(h.quantity), unit: h.unit,
      harvestedAt: h.harvested_at, revenue, costs, profit: revenue === null ? null : revenue - costs,
      margin: revenue && revenue > 0 ? Math.round(((revenue - costs) / revenue) * 1000) / 10 : null,
    };
  });
  const fs = farms.rows.map((f) => ({
    farmId: f.id, name: f.name, kind: f.kind, status: f.status,
    revenue: Number(f.revenue), costs: Number(f.costs), generalCosts: Number(f.general_costs), profit: Number(f.revenue) - Number(f.costs),
  }));
  const totalRevenue = fs.reduce((a, f) => a + f.revenue, 0);
  const totalCosts = fs.reduce((a, f) => a + f.costs, 0);
  res.json({
    year, harvests: hs, farms: fs,
    costsByCategory: Object.fromEntries(COST_CATEGORIES.map((c) => [c, Number(byCategory.rows.find((r) => r.category === c)?.total || 0)])),
    totals: { revenue: totalRevenue, costs: totalCosts, profit: totalRevenue - totalCosts, harvestsMissingRevenue: hs.filter((h) => h.revenue === null).length },
  });
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
    `SELECT h.crop, h.unit, f.kind, COUNT(*) AS declarations,
            SUM(h.quantity) AS total_declared,
            SUM(CASE WHEN h.status = 'received' THEN h.quantity_received ELSE 0 END) AS total_received,
            COALESCE(SUM(h.revenue), 0) AS total_revenue
     FROM harvest_logs h JOIN company_farms f ON f.id = h.farm_id
     ${where.replace(/harvested_at/g, "h.harvested_at")}
     GROUP BY h.crop, h.unit, f.kind
     ORDER BY h.crop ASC`,
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
      kind: r.kind,
      totalRevenue: Number(r.total_revenue),
    })),
  });
}

// --- Annual production declarations ----------------------------------------
// The company's own official annual figure per crop, company-wide, NOT
// tied to any one farm. This is deliberately separate from harvest_logs:
// harvest_logs is per-farm (used to see how each individual farm is
// producing, via the Harvests tab), while this is "Ephaag declares X yam
// for 2026" as a single combined total, the same way a farmer declares
// their own produce as one figure rather than plot-by-plot. Re-declaring
// the same year+crop updates the existing row (see the UNIQUE(year, crop)
// constraint) rather than piling up duplicates.

export async function listAnnualDeclarations(req, res) {
  const { year } = req.query;
  const params = [];
  let where = "";
  if (year) {
    params.push(Number(year));
    where = `WHERE d.year = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT d.*, u.name AS declared_by_name
     FROM production_annual_declarations d
     LEFT JOIN users u ON u.id = d.declared_by
     ${where}
     ORDER BY d.crop ASC`,
    params
  );
  res.json({ declarations: rows });
}

export async function declareAnnualProduction(req, res) {
  const { year, crop, quantity, unit, note } = req.body;
  if (!year || !crop || !quantity || !unit) {
    return res.status(400).json({ error: "year, crop, quantity, and unit are required" });
  }
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: "quantity must be a positive number" });

  const { rows } = await pool.query(
    `INSERT INTO production_annual_declarations (year, crop, quantity, unit, note, declared_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (year, crop) DO UPDATE
       SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit, note = EXCLUDED.note,
           declared_by = EXCLUDED.declared_by, updated_at = now()
     RETURNING *`,
    [Number(year), crop, qty, unit, note || null, req.user.id]
  );
  res.status(201).json({ declaration: rows[0] });
}
