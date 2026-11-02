import { pool } from "../db/pool.js";

// Admin analytics/reporting (2026-08-11 spec), see the "Data & analytics
// / national survey mandate" note in [[ephaag-farms]] memory. Purpose:
// admin should be able to pull structured answers to questions like "how
// many farmers can produce 100 bags of rice", "Benue's total annual grain
// output", "poverty/income segmentation by region", for internal
// presentations, government requests, or NGO/foreign-body data requests, // without ever having to compute anything by hand. Every endpoint here is
// read-only and admin-only.


// --- Geographic drill-down (Phase 9) -----------------------------------------
// state -> LGA -> ward -> unit. Every analytics query accepts these four filters and applies them to the
// FARMER's registered location, so "Benue", "Benue > Makurdi" or one unit all drill down the same way.
export const GEO_LEVELS = ["state", "lga", "ward", "unit"];
export function geoFilter(query, alias, values) {
  const conds = [];
  const applied = {};
  for (const level of GEO_LEVELS) {
    const v = String(query?.[level] ?? "").trim().slice(0, 120);
    applied[level] = v || null;
    if (v) { values.push(v); conds.push(`${alias}.${level} = $${values.length}`); }
  }
  return { conds, applied };
}
// The level the next breakdown should be drawn at (state -> LGAs of that state -> wards -> units).
export function nextLevel(applied) {
  if (!applied.state) return "state";
  if (!applied.lga) return "lga";
  if (!applied.ward) return "ward";
  return "unit";
}

export async function geoOptions(req, res) {
  const { state, lga, ward } = req.query;
  const one = async (col, parents) => {
    const values = [];
    const conds = [`role_type = 'farmer'`, `${col} IS NOT NULL`, `${col} <> ''`];
    for (const [k, v] of parents) { if (v) { values.push(String(v)); conds.push(`${k} = $${values.length}`); } }
    const { rows } = await pool.query(`SELECT DISTINCT ${col} AS v FROM users WHERE ${conds.join(" AND ")} ORDER BY ${col}`, values);
    return rows.map((r) => r.v);
  };
  res.json({
    states: await one("state", []),
    lgas: state ? await one("lga", [["state", state]]) : [],
    wards: state && lga ? await one("ward", [["state", state], ["lga", lga]]) : [],
    units: state && lga && ward ? await one("unit", [["state", state], ["lga", lga], ["ward", ward]]) : [],
  });
}

// --- Farmer survey / demographics ----------------------------------------

export async function farmerDemographics(req, res) {
  const values = [];
  const geo = geoFilter(req.query, "u", values);
  const filters = ["u.role_type = 'farmer'", ...geo.conds];
  const where = filters.join(" AND ");

  const [totalRes, genderRes, maritalRes, farmTypeRes, farmSizeRes, incomeRes, experienceRes, stateRes] =
    await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM users u WHERE ${where}`, values),
      pool.query(
        `SELECT u.sex AS key, COUNT(*) AS n FROM users u WHERE ${where} GROUP BY u.sex ORDER BY n DESC`,
        values
      ),
      pool.query(
        `SELECT fp.marital_status AS key, COUNT(*) AS n FROM users u
         JOIN farmer_profiles fp ON fp.user_id = u.id WHERE ${where} GROUP BY fp.marital_status ORDER BY n DESC`,
        values
      ),
      pool.query(
        `SELECT fp.farm_type AS key, COUNT(*) AS n FROM users u
         JOIN farmer_profiles fp ON fp.user_id = u.id WHERE ${where} GROUP BY fp.farm_type ORDER BY n DESC`,
        values
      ),
      pool.query(
        `SELECT fp.farm_size AS key, COUNT(*) AS n FROM users u
         JOIN farmer_profiles fp ON fp.user_id = u.id WHERE ${where} GROUP BY fp.farm_size ORDER BY n DESC`,
        values
      ),
      pool.query(
        `SELECT fp.annual_farm_income AS key, COUNT(*) AS n FROM users u
         JOIN farmer_profiles fp ON fp.user_id = u.id WHERE ${where} GROUP BY fp.annual_farm_income ORDER BY n DESC`,
        values
      ),
      pool.query(
        `SELECT fp.years_experience AS key, COUNT(*) AS n FROM users u
         JOIN farmer_profiles fp ON fp.user_id = u.id WHERE ${where} GROUP BY fp.years_experience ORDER BY n DESC`,
        values
      ),
      pool.query(
        `SELECT u.state AS key, COUNT(*) AS n FROM users u WHERE ${where} GROUP BY u.state ORDER BY n DESC`,
        values
      ),
    ]);

  const toBreakdown = (rows) => rows.map((r) => ({ key: r.key || "Not stated", count: Number(r.n) }));

  res.json({
    filters: geo.applied,
    totalFarmers: Number(totalRes.rows[0].n),
    byGender: toBreakdown(genderRes.rows),
    byMaritalStatus: toBreakdown(maritalRes.rows),
    byFarmType: toBreakdown(farmTypeRes.rows),
    byFarmSize: toBreakdown(farmSizeRes.rows),
    byAnnualIncome: toBreakdown(incomeRes.rows),
    byYearsExperience: toBreakdown(experienceRes.rows),
    byState: toBreakdown(stateRes.rows),
  });
}

// --- Produce declarations -------------------------------------------------

export async function produceDeclarations(req, res) {
  const { crop, year } = req.query;
  const values = [];
  const geo = geoFilter(req.query, "u", values);
  const filters = [...geo.conds];
  if (crop) { values.push(crop); filters.push(`fd.crop ILIKE $${values.length}`); }
  if (year) { values.push(Number(year)); filters.push(`fd.declaration_year = $${values.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [byCropRes, byStateRes, byStateCropRes] = await Promise.all([
    pool.query(
      `SELECT fd.crop AS crop, fd.unit AS unit, SUM(fd.quantity) AS total,
              COUNT(DISTINCT fd.farmer_id) AS farmer_count
       FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id
       ${where} GROUP BY fd.crop, fd.unit ORDER BY total DESC`,
      values
    ),
    pool.query(
      `SELECT u.state AS state, SUM(fd.quantity) AS total, COUNT(DISTINCT fd.farmer_id) AS farmer_count
       FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id
       ${where} GROUP BY u.state ORDER BY total DESC`,
      values
    ),
    pool.query(
      `SELECT u.state AS state, fd.crop AS crop, fd.unit AS unit, SUM(fd.quantity) AS total
       FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id
       ${where} GROUP BY u.state, fd.crop, fd.unit ORDER BY u.state ASC, total DESC`,
      values
    ),
  ]);

  res.json({
    filters: { ...geo.applied, crop: crop || null, year: year ? Number(year) : null },
    byCrop: byCropRes.rows.map((r) => ({ crop: r.crop, unit: r.unit, total: Number(r.total), farmerCount: Number(r.farmer_count) })),
    byState: byStateRes.rows.map((r) => ({ state: r.state, total: Number(r.total), farmerCount: Number(r.farmer_count) })),
    byStateAndCrop: byStateCropRes.rows.map((r) => ({ state: r.state, crop: r.crop, unit: r.unit, total: Number(r.total) })),
  });
}

// Answers the exact worked example from the spec: "how many farmers
// declared at least N units of a given crop" (e.g. "100 bags of rice").
export async function produceCapacityQuery(req, res) {
  const { crop, minQuantity } = req.query;
  if (!crop || !minQuantity) {
    return res.status(400).json({ error: "crop and minQuantity are required" });
  }
  const values = [crop, Number(minQuantity)];
  let where = `fd.crop ILIKE $1 AND fd.quantity >= $2`;
  const geo = geoFilter(req.query, "u", values);
  for (const c of geo.conds) where += ` AND ${c}`;

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.state, u.lga, u.ward, u.unit, fd.quantity, fd.unit AS declared_unit
     FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id
     WHERE ${where} ORDER BY fd.quantity DESC`,
    values
  );
  res.json({
    crop,
    minQuantity: Number(minQuantity),
    filters: geo.applied,
    state: geo.applied.state,
    matchingFarmerCount: rows.length,
    farmers: rows.map((r) => ({
      userId: r.id,
      name: r.name,
      state: r.state,
      lga: r.lga,
      ward: r.ward,
      unit: r.unit,
      declaredQuantity: Number(r.quantity),
      unitOfMeasure: r.declared_unit,
    })),
  });
}

// --- Loans -----------------------------------------------------------------

export async function loanAnalytics(req, res) {
  const values = [];
  const geo = geoFilter(req.query, "u", values);
  const where = geo.conds.length ? `WHERE ${geo.conds.join(" AND ")}` : "";
  const [byStatusRes, byTypeRes, repaymentRes] = await Promise.all([
    pool.query(
      `SELECT l.status, COUNT(*) AS n, COALESCE(SUM(l.amount), 0) AS total
       FROM loans l JOIN users u ON u.id = l.farmer_id ${where} GROUP BY l.status ORDER BY n DESC`, values),
    pool.query(
      `SELECT l.loan_type, COUNT(*) AS n, COALESCE(SUM(l.amount), 0) AS total
       FROM loans l JOIN users u ON u.id = l.farmer_id ${where} GROUP BY l.loan_type ORDER BY n DESC`, values),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE r.verified) AS verified_count,
              COUNT(*) FILTER (WHERE NOT r.verified) AS unverified_count,
              COALESCE(SUM(r.amount) FILTER (WHERE r.verified), 0) AS verified_total
       FROM loan_repayments r JOIN loans l ON l.id = r.loan_id JOIN users u ON u.id = l.farmer_id ${where}`, values),
  ]);

  res.json({
    filters: geo.applied,
    byStatus: byStatusRes.rows.map((r) => ({ status: r.status, count: Number(r.n), totalAmount: Number(r.total) })),
    byType: byTypeRes.rows.map((r) => ({ loanType: r.loan_type, count: Number(r.n), totalAmount: Number(r.total) })),
    repayments: {
      verifiedCount: Number(repaymentRes.rows[0].verified_count),
      unverifiedCount: Number(repaymentRes.rows[0].unverified_count),
      verifiedTotal: Number(repaymentRes.rows[0].verified_total),
    },
  });
}

// --- Savings -----------------------------------------------------------------

export async function savingsAnalytics(req, res) {
  const values = [];
  const geo = geoFilter(req.query, "u", values);
  const where = geo.conds.length ? `WHERE ${geo.conds.join(" AND ")}` : "";
  const [totalsRes, monthlyRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(d.main_portion), 0) AS main_total, COALESCE(SUM(d.insurance_portion), 0) AS insurance_total,
              COUNT(DISTINCT d.user_id) AS savers_count
       FROM savings_deposits d JOIN users u ON u.id = d.user_id ${where}`, values),
    pool.query(
      `SELECT date_trunc('month', d.created_at) AS month, COALESCE(SUM(d.amount), 0) AS total, COUNT(*) AS deposit_count
       FROM savings_deposits d JOIN users u ON u.id = d.user_id ${where} GROUP BY month ORDER BY month DESC LIMIT 12`, values),
  ]);

  res.json({
    filters: geo.applied,
    mainTotal: Number(totalsRes.rows[0].main_total),
    insuranceTotal: Number(totalsRes.rows[0].insurance_total),
    saversCount: Number(totalsRes.rows[0].savers_count),
    byMonth: monthlyRes.rows.map((r) => ({
      month: r.month,
      total: Number(r.total),
      depositCount: Number(r.deposit_count),
    })),
  });
}

// --- Training / Ranking -----------------------------------------------------

export async function trainingAnalytics(req, res) {
  const values = [];
  const geo = geoFilter(req.query, "u", values);
  const geoAnd = geo.conds.length ? ` AND ${geo.conds.join(" AND ")}` : "";
  const [leadershipRes, quartersRes] = await Promise.all([
    pool.query(
      `SELECT fp.rank, COUNT(*) AS n FROM farmer_profiles fp JOIN users u ON u.id = fp.user_id WHERE TRUE${geoAnd} GROUP BY fp.rank ORDER BY n DESC`, values
    ),
    pool.query(
      `SELECT u.id, COUNT(DISTINCT date_trunc('quarter', s.event_date)) FILTER (WHERE sa.attended) AS quarters_engaged
       FROM users u
       LEFT JOIN seminar_attendance sa ON sa.user_id = u.id
       LEFT JOIN seminars s ON s.id = sa.seminar_id
       WHERE u.role_type = 'farmer'${geoAnd}
       GROUP BY u.id`, values
    ),
  ]);

  // Bucket quarters-engaged into the same rank labels the farmer sees,
  // without importing the frontend-facing util (avoids a circular
  // dependency risk), small enough to inline.
  function label(n) {
    if (n <= 0) return "Novice";
    if (n === 1) return "Mastery";
    if (n === 2) return "Professional";
    if (n === 3) return "Executive";
    return `Executive 1 Step ${n - 3}`;
  }
  const trainingRankCounts = {};
  for (const row of quartersRes.rows) {
    const l = label(Number(row.quarters_engaged));
    trainingRankCounts[l] = (trainingRankCounts[l] || 0) + 1;
  }

  res.json({
    filters: geo.applied,
    byLeadershipRank: leadershipRes.rows.map((r) => ({ rank: r.rank, count: Number(r.n) })),
    byTrainingRank: Object.entries(trainingRankCounts).map(([rank, count]) => ({ rank, count })),
  });
}

// --- Overview (top-level summary combining all the above) ------------------

export async function overview(req, res) {
  const vals = [];
  const geo = geoFilter(req.query, "u", vals);
  const farmerOnly = geo.conds.length > 0; // a location only describes farmers
  const geoAnd = geo.conds.length ? ` AND ${geo.conds.join(" AND ")}` : "";
  const [users, loans, savings, produce, shares] = await Promise.all([
    pool.query(`SELECT u.role_type, COUNT(*) AS n FROM users u WHERE ${farmerOnly ? "u.role_type = 'farmer'" : "TRUE"}${geoAnd} GROUP BY u.role_type`, vals),
    pool.query(`SELECT l.status, COUNT(*) AS n FROM loans l JOIN users u ON u.id = l.farmer_id WHERE TRUE${geoAnd} GROUP BY l.status`, vals),
    pool.query(`SELECT COALESCE(SUM(d.main_portion + d.insurance_portion), 0) AS total FROM savings_deposits d JOIN users u ON u.id = d.user_id WHERE TRUE${geoAnd}`, vals),
    pool.query(`SELECT COUNT(DISTINCT fd.crop) AS crop_count, COUNT(DISTINCT fd.farmer_id) AS declarer_count FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id WHERE TRUE${geoAnd}`, vals),
    pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(s.amount), 0) AS total FROM farmer_shares s JOIN users u ON u.id = s.farmer_id WHERE s.status != 'renewed'${geoAnd}`, vals),
  ]);
  res.json({
    filters: geo.applied,
    usersByRole: users.rows.map((r) => ({ role: r.role_type, count: Number(r.n) })),
    loansByStatus: loans.rows.map((r) => ({ status: r.status, count: Number(r.n) })),
    totalSavings: Number(savings.rows[0].total),
    distinctCropsDeclared: Number(produce.rows[0].crop_count),
    farmersWithDeclarations: Number(produce.rows[0].declarer_count),
    farmerShares: { count: Number(shares.rows[0].n), totalInvested: Number(shares.rows[0].total) },
  });
}

// --- Summary: everything the key charts, the printable report and the Excel export need, in one place ---------

const LEVEL_LABEL = { state: "State", lga: "LGA", ward: "Ward", unit: "Unit" };

export async function buildSummary(query) {
  const values = [];
  const geo = geoFilter(query, "u", values);
  const level = nextLevel(geo.applied);
  const geoAnd = geo.conds.length ? ` AND ${geo.conds.join(" AND ")}` : "";
  const where = geo.conds.length ? `WHERE ${geo.conds.join(" AND ")}` : "";

  const [farmers, declarers, crops, areas, loanStatus, loanType, savingsTotals, trend, shares, loanAreas] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM users u WHERE u.role_type = 'farmer'${geoAnd}`, values),
    pool.query(`SELECT COUNT(DISTINCT fd.farmer_id) AS n, COUNT(*) AS entries FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id ${where}`, values),
    pool.query(
      `SELECT fd.crop, fd.unit, SUM(fd.quantity) AS total, COUNT(DISTINCT fd.farmer_id) AS farmers
         FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id ${where}
        GROUP BY fd.crop, fd.unit ORDER BY total DESC LIMIT 12`, values),
    pool.query(
      `SELECT COALESCE(NULLIF(u.${level}, ''), 'Not stated') AS area, COUNT(DISTINCT u.id) AS farmers, COUNT(DISTINCT fd.farmer_id) AS declarers
         FROM users u LEFT JOIN farmer_declarations fd ON fd.farmer_id = u.id
        WHERE u.role_type = 'farmer'${geoAnd}
        GROUP BY 1 ORDER BY farmers DESC, area LIMIT 40`, values),
    pool.query(`SELECT l.status, COUNT(*) AS n, COALESCE(SUM(l.amount), 0) AS total FROM loans l JOIN users u ON u.id = l.farmer_id ${where} GROUP BY l.status ORDER BY n DESC`, values),
    pool.query(`SELECT l.loan_type, COUNT(*) AS n, COALESCE(SUM(l.amount), 0) AS total FROM loans l JOIN users u ON u.id = l.farmer_id ${where} GROUP BY l.loan_type ORDER BY n DESC`, values),
    pool.query(`SELECT COALESCE(SUM(d.amount), 0) AS total, COUNT(DISTINCT d.user_id) AS savers FROM savings_deposits d JOIN users u ON u.id = d.user_id ${where}`, values),
    pool.query(
      `SELECT to_char(date_trunc('month', d.created_at), 'YYYY-MM') AS month, COALESCE(SUM(d.amount), 0) AS total, COUNT(*) AS deposits
         FROM savings_deposits d JOIN users u ON u.id = d.user_id ${where}
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, values),
    pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(s.amount), 0) AS total FROM farmer_shares s JOIN users u ON u.id = s.farmer_id WHERE s.status != 'renewed'${geoAnd}`, values),
    pool.query(`SELECT COALESCE(NULLIF(u.${level}, ''), 'Not stated') AS area, COALESCE(SUM(l.amount), 0) AS total FROM loans l JOIN users u ON u.id = l.farmer_id ${where} GROUP BY 1`, values),
  ]);
  const loanByArea = new Map(loanAreas.rows.map((r) => [r.area, Number(r.total)]));

  const loanCount = loanStatus.rows.reduce((a, r) => a + Number(r.n), 0);
  const loanValue = loanStatus.rows.reduce((a, r) => a + Number(r.total), 0);
  return {
    generatedAt: new Date().toISOString(),
    filters: geo.applied,
    areaLevel: level,
    areaLevelLabel: LEVEL_LABEL[level],
    totals: {
      farmers: Number(farmers.rows[0].n),
      farmersDeclaring: Number(declarers.rows[0].n),
      declarations: Number(declarers.rows[0].entries),
      loans: loanCount,
      loanValue,
      savings: Number(savingsTotals.rows[0].total),
      savers: Number(savingsTotals.rows[0].savers),
      shares: Number(shares.rows[0].n),
      sharesInvested: Number(shares.rows[0].total),
    },
    produceByCrop: crops.rows.map((r) => ({ crop: r.crop, unit: r.unit, total: Number(r.total), farmers: Number(r.farmers) })),
    byArea: areas.rows.map((r) => ({ area: r.area, farmers: Number(r.farmers), declarers: Number(r.declarers), loanValue: loanByArea.get(r.area) || 0 })),
    loansByStatus: loanStatus.rows.map((r) => ({ status: r.status, count: Number(r.n), totalAmount: Number(r.total) })),
    loansByType: loanType.rows.map((r) => ({ loanType: r.loan_type, count: Number(r.n), totalAmount: Number(r.total) })),
    savingsTrend: trend.rows.map((r) => ({ month: r.month, total: Number(r.total), deposits: Number(r.deposits) })).reverse(),
  };
}

export async function summary(req, res) {
  res.json(await buildSummary(req.query));
}

const filterText = (f) => {
  const parts = ["state", "lga", "ward", "unit"].filter((k) => f[k]).map((k) => `${LEVEL_LABEL[k]}: ${f[k]}`);
  return parts.length ? parts.join(" > ") : "All of Nigeria (no location filter)";
};

// Excel export of exactly what the dashboard shows for the chosen location.
export async function exportXlsx(req, res) {
  const { default: ExcelJS } = await import("exceljs");
  const s = await buildSummary(req.query);
  const wb = new ExcelJS.Workbook();
  wb.creator = "EPHAAG Farms";
  wb.created = new Date();
  const head = (ws) => { ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F0E4" } }; };

  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ header: "Item", key: "k", width: 38 }, { header: "Value", key: "v", width: 28 }];
  head(sum);
  sum.addRows([
    { k: "Report", v: "EPHAAG Farms analytics summary" },
    { k: "Location", v: filterText(s.filters) },
    { k: "Generated", v: s.generatedAt.slice(0, 16).replace("T", " ") + " UTC" },
    { k: "Registered farmers", v: s.totals.farmers },
    { k: "Farmers who declared produce", v: s.totals.farmersDeclaring },
    { k: "Produce declarations", v: s.totals.declarations },
    { k: "Loans (number)", v: s.totals.loans },
    { k: "Loans (total value, NGN)", v: s.totals.loanValue },
    { k: "Savings deposited (NGN)", v: s.totals.savings },
    { k: "Farmers saving", v: s.totals.savers },
    { k: "Farmer shares held", v: s.totals.shares },
    { k: "Farmer shares invested (NGN)", v: s.totals.sharesInvested },
  ]);

  const crop = wb.addWorksheet("Produce by crop");
  crop.columns = [{ header: "Crop", key: "crop", width: 24 }, { header: "Unit", key: "unit", width: 12 }, { header: "Total declared", key: "total", width: 18 }, { header: "Farmers", key: "farmers", width: 12 }];
  head(crop); crop.addRows(s.produceByCrop);

  const area = wb.addWorksheet(`By ${s.areaLevelLabel}`);
  area.columns = [{ header: s.areaLevelLabel, key: "area", width: 30 }, { header: "Farmers", key: "farmers", width: 12 }, { header: "Farmers declaring produce", key: "declarers", width: 26 }, { header: "Loan value (NGN)", key: "loanValue", width: 20 }];
  head(area); area.addRows(s.byArea);

  const loans = wb.addWorksheet("Loans");
  loans.columns = [{ header: "Group", key: "g", width: 14 }, { header: "Name", key: "n", width: 28 }, { header: "Number", key: "c", width: 12 }, { header: "Total value (NGN)", key: "t", width: 20 }];
  head(loans);
  s.loansByStatus.forEach((r) => loans.addRow({ g: "Status", n: r.status, c: r.count, t: r.totalAmount }));
  s.loansByType.forEach((r) => loans.addRow({ g: "Type", n: r.loanType, c: r.count, t: r.totalAmount }));

  const sav = wb.addWorksheet("Savings trend");
  sav.columns = [{ header: "Month", key: "month", width: 12 }, { header: "Deposited (NGN)", key: "total", width: 20 }, { header: "Deposits", key: "deposits", width: 12 }];
  head(sav); sav.addRows(s.savingsTrend);

  const buf = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="ephaag-analytics-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(buf));
}
