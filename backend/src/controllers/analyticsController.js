import { pool } from "../db/pool.js";

// Admin analytics/reporting (2026-08-11 spec) — see the "Data & analytics
// / national survey mandate" note in [[ephaag-farms]] memory. Purpose:
// admin should be able to pull structured answers to questions like "how
// many farmers can produce 100 bags of rice", "Benue's total annual grain
// output", "poverty/income segmentation by region" — for internal
// presentations, government requests, or NGO/foreign-body data requests —
// without ever having to compute anything by hand. Every endpoint here is
// read-only and admin-only.

// --- Farmer survey / demographics ----------------------------------------

export async function farmerDemographics(req, res) {
  const { state, lga } = req.query;
  const filters = ["u.role_type = 'farmer'"];
  const values = [];
  if (state) { values.push(state); filters.push(`u.state = $${values.length}`); }
  if (lga) { values.push(lga); filters.push(`u.lga = $${values.length}`); }
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
    filters: { state: state || null, lga: lga || null },
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
  const { state, lga, crop, year } = req.query;
  const filters = [];
  const values = [];
  if (state) { values.push(state); filters.push(`u.state = $${values.length}`); }
  if (lga) { values.push(lga); filters.push(`u.lga = $${values.length}`); }
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
    filters: { state: state || null, lga: lga || null, crop: crop || null, year: year ? Number(year) : null },
    byCrop: byCropRes.rows.map((r) => ({ crop: r.crop, unit: r.unit, total: Number(r.total), farmerCount: Number(r.farmer_count) })),
    byState: byStateRes.rows.map((r) => ({ state: r.state, total: Number(r.total), farmerCount: Number(r.farmer_count) })),
    byStateAndCrop: byStateCropRes.rows.map((r) => ({ state: r.state, crop: r.crop, unit: r.unit, total: Number(r.total) })),
  });
}

// Answers the exact worked example from the spec: "how many farmers
// declared at least N units of a given crop" (e.g. "100 bags of rice").
export async function produceCapacityQuery(req, res) {
  const { crop, minQuantity, state } = req.query;
  if (!crop || !minQuantity) {
    return res.status(400).json({ error: "crop and minQuantity are required" });
  }
  const values = [crop, Number(minQuantity)];
  let where = `fd.crop ILIKE $1 AND fd.quantity >= $2`;
  if (state) { values.push(state); where += ` AND u.state = $${values.length}`; }

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.state, u.lga, u.ward, u.unit, fd.quantity, fd.unit AS declared_unit
     FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id
     WHERE ${where} ORDER BY fd.quantity DESC`,
    values
  );
  res.json({
    crop,
    minQuantity: Number(minQuantity),
    state: state || null,
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
  const [byStatusRes, byTypeRes, repaymentRes] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total
       FROM loans GROUP BY status ORDER BY n DESC`
    ),
    pool.query(
      `SELECT loan_type, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total
       FROM loans GROUP BY loan_type ORDER BY n DESC`
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE verified) AS verified_count,
              COUNT(*) FILTER (WHERE NOT verified) AS unverified_count,
              COALESCE(SUM(amount) FILTER (WHERE verified), 0) AS verified_total
       FROM loan_repayments`
    ),
  ]);

  res.json({
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
  const [totalsRes, monthlyRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(main_portion), 0) AS main_total, COALESCE(SUM(insurance_portion), 0) AS insurance_total,
              COUNT(DISTINCT user_id) AS savers_count
       FROM savings_deposits`
    ),
    pool.query(
      `SELECT date_trunc('month', created_at) AS month, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS deposit_count
       FROM savings_deposits GROUP BY month ORDER BY month DESC LIMIT 12`
    ),
  ]);

  res.json({
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
  const [leadershipRes, quartersRes] = await Promise.all([
    pool.query(
      `SELECT rank, COUNT(*) AS n FROM farmer_profiles GROUP BY rank ORDER BY n DESC`
    ),
    pool.query(
      `SELECT u.id, COUNT(DISTINCT date_trunc('quarter', s.event_date)) FILTER (WHERE sa.attended) AS quarters_engaged
       FROM users u
       LEFT JOIN seminar_attendance sa ON sa.user_id = u.id
       LEFT JOIN seminars s ON s.id = sa.seminar_id
       WHERE u.role_type = 'farmer'
       GROUP BY u.id`
    ),
  ]);

  // Bucket quarters-engaged into the same rank labels the farmer sees,
  // without importing the frontend-facing util (avoids a circular
  // dependency risk) — small enough to inline.
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
    byLeadershipRank: leadershipRes.rows.map((r) => ({ rank: r.rank, count: Number(r.n) })),
    byTrainingRank: Object.entries(trainingRankCounts).map(([rank, count]) => ({ rank, count })),
  });
}

// --- Overview (top-level summary combining all the above) ------------------

export async function overview(req, res) {
  const [users, loans, savings, produce, shares] = await Promise.all([
    pool.query(`SELECT role_type, COUNT(*) AS n FROM users GROUP BY role_type`),
    pool.query(`SELECT status, COUNT(*) AS n FROM loans GROUP BY status`),
    pool.query(`SELECT COALESCE(SUM(main_portion + insurance_portion), 0) AS total FROM savings_deposits`),
    pool.query(`SELECT COUNT(DISTINCT crop) AS crop_count, COUNT(DISTINCT farmer_id) AS declarer_count FROM farmer_declarations`),
    pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM farmer_shares WHERE status != 'renewed'`),
  ]);
  res.json({
    usersByRole: users.rows.map((r) => ({ role: r.role_type, count: Number(r.n) })),
    loansByStatus: loans.rows.map((r) => ({ status: r.status, count: Number(r.n) })),
    totalSavings: Number(savings.rows[0].total),
    distinctCropsDeclared: Number(produce.rows[0].crop_count),
    farmersWithDeclarations: Number(produce.rows[0].declarer_count),
    farmerShares: { count: Number(shares.rows[0].n), totalInvested: Number(shares.rows[0].total) },
  });
}
