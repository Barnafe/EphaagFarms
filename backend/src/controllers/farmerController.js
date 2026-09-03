import { pool } from "../db/pool.js";
import { trainingRankLabel, nextTrainingRankLabel } from "../utils/trainingRank.js";
import { computeAndStoreIndices } from "../utils/indicesEngine.js";

// --- Farmer's own profile -----------------------------------------------

export async function updateMyProfile(req, res) {
  const { crops, state, lga, ward, unit } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (state || lga || ward || unit) {
      await client.query(
        `UPDATE users SET
           state = COALESCE($1, state),
           lga = COALESCE($2, lga),
           ward = COALESCE($3, ward),
           unit = COALESCE($4, unit)
         WHERE id = $5`,
        [state || null, lga || null, ward || null, unit || null, req.user.id]
      );
    }

    if (crops) {
      await client.query(`UPDATE farmer_profiles SET crops = $1 WHERE user_id = $2`, [
        crops,
        req.user.id,
      ]);
    }

    await client.query("COMMIT");

    const { rows } = await client.query(
      `SELECT u.id, u.name, u.state, u.lga, u.ward, u.unit, fp.rank, fp.crops,
              fp.attendance_pct, fp.course_pct
       FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ profile: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not update profile" });
  } finally {
    client.release();
  }
}

// --- List product (farmer's own for-sale listings) -----------------------

// Validates a crop against the farmer's own registered crops list — never
// trust the client dropdown alone (2026-08-12: "admin needs correct data
// from it, and users must not declare/list product they did not select
// during registration").
// Farmer-visible price list — shows only buy_price (what the company pays
// them), never sell_price (what buyers pay), per the 2026-08-30 dual-price
// spec. Surfaced in Declare/List so a farmer knows what they'll be paid
// before declaring or listing.
export async function myVisiblePrices(req, res) {
  const { rows } = await pool.query(
    `SELECT crop, unit, buy_price AS price FROM standard_prices ORDER BY crop ASC`
  );
  res.json({ prices: rows });
}

async function assertRegisteredCrop(farmerId, crop) {
  const { rows } = await pool.query(`SELECT crops FROM farmer_profiles WHERE user_id = $1`, [farmerId]);
  const registered = rows[0]?.crops || [];
  return registered.includes(crop);
}

// --- Declared-inventory balance (2026-08-29 spec) -------------------------
// A farmer can never list more than they've declared, and a purchase (order
// sourcing) consumes against that same declared balance — see the
// [[ephaag-farms]] memory note on this round. Formula, kept consistent both
// directions: remaining = declaredTotal - purchased - currentlyListedAvailable.
// "purchased" comes from order_sourcing.quantity_sourced (set only once a
// specific listing is actually sourced for a real order — see
// procurementController.sourceOrder); "currentlyListedAvailable" is what's
// still sitting in farmer_products as unsold, since that quantity is already
// spoken for even before anyone buys it.
async function declaredBalanceForCrop(farmerId, crop) {
  const { rows: declRows } = await pool.query(
    `SELECT COALESCE(SUM(quantity), 0) AS total, MAX(unit) AS unit
     FROM farmer_declarations WHERE farmer_id = $1 AND crop = $2`,
    [farmerId, crop]
  );
  const { rows: purchasedRows } = await pool.query(
    `SELECT COALESCE(SUM(quantity_sourced), 0) AS total
     FROM order_sourcing WHERE farmer_id = $1 AND crop = $2`,
    [farmerId, crop]
  );
  const { rows: listedRows } = await pool.query(
    `SELECT COALESCE(SUM(quantity), 0) AS total
     FROM farmer_products WHERE farmer_id = $1 AND crop = $2 AND status = 'available'`,
    [farmerId, crop]
  );
  const declaredTotal = Number(declRows[0].total);
  const purchased = Number(purchasedRows[0].total);
  const listedAvailable = Number(listedRows[0].total);
  return {
    crop,
    unit: declRows[0].unit,
    declaredTotal,
    purchased,
    listedAvailable,
    remaining: declaredTotal - purchased - listedAvailable,
  };
}

// One row per crop the farmer has ever declared, with how much of it is
// still free to list. Used by the List-product dropdown instead of letting
// farmers free-type a crop/quantity.
export async function myDeclaredBalances(req, res) {
  const { rows } = await pool.query(
    `SELECT DISTINCT crop FROM farmer_declarations WHERE farmer_id = $1 ORDER BY crop ASC`,
    [req.user.id]
  );
  const balances = await Promise.all(rows.map((r) => declaredBalanceForCrop(req.user.id, r.crop)));
  res.json({ balances });
}

export async function listMyProducts(req, res) {
  const { rows } = await pool.query(
    `SELECT id, crop, quantity, unit, address, status, created_at
     FROM farmer_products WHERE farmer_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ products: rows });
}

export async function createMyProduct(req, res) {
  const { crop, quantity, unit, address } = req.body;
  if (!crop || !quantity || !unit || !address) {
    return res.status(400).json({ error: "crop, quantity, unit, and address are required" });
  }
  if (!(await assertRegisteredCrop(req.user.id, crop))) {
    return res.status(400).json({ error: "You can only list a crop you selected during registration" });
  }
  const balance = await declaredBalanceForCrop(req.user.id, crop);
  if (balance.declaredTotal === 0) {
    return res.status(400).json({ error: "Declare this product before listing it — see Declare product above" });
  }
  if (Number(quantity) > balance.remaining) {
    return res.status(400).json({
      error: `You can't list more than your declared balance — you have ${balance.remaining} ${balance.unit} of ${crop} left to list`,
    });
  }
  const { rows } = await pool.query(
    `INSERT INTO farmer_products (farmer_id, crop, quantity, unit, address)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, crop, quantity, unit, address, status, created_at`,
    [req.user.id, crop, quantity, unit, address]
  );
  res.status(201).json({ product: rows[0] });
}

export async function updateMyProduct(req, res) {
  const { status } = req.body;
  if (!["available", "sold_out"].includes(status)) {
    return res.status(400).json({ error: "status must be 'available' or 'sold_out'" });
  }
  const { rows } = await pool.query(
    `UPDATE farmer_products SET status = $1 WHERE id = $2 AND farmer_id = $3
     RETURNING id, crop, quantity, unit, address, status, created_at`,
    [status, req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Product not found" });
  res.json({ product: rows[0] });
}

// --- Produce declarations (separate from listings — see the migration
// note in farmer_declarations for why these split apart 2026-08-12) -----

export async function listMyDeclarations(req, res) {
  const { rows } = await pool.query(
    `SELECT id, crop, quantity, unit, declaration_year, created_at
     FROM farmer_declarations WHERE farmer_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ declarations: rows });
}

export async function createMyDeclaration(req, res) {
  const { crop, quantity, unit, declarationYear } = req.body;
  if (!crop || !quantity || !unit) {
    return res.status(400).json({ error: "crop, quantity, and unit are required" });
  }
  if (!(await assertRegisteredCrop(req.user.id, crop))) {
    return res.status(400).json({ error: "You can only declare a crop you selected during registration" });
  }
  // Wrapped in try/catch — an invalid unit used to violate
  // farmer_declarations' CHECK constraint as an unhandled rejection, which
  // per server.js's global handler means the request never gets a
  // response at all (hangs until the client times out) rather than a
  // clean 400. Same failure class as any other unguarded controller.
  try {
    const { rows } = await pool.query(
      `INSERT INTO farmer_declarations (farmer_id, crop, quantity, unit, declaration_year)
       VALUES ($1, $2, $3, $4, COALESCE($5, EXTRACT(YEAR FROM now())::int))
       RETURNING id, crop, quantity, unit, declaration_year, created_at`,
      [req.user.id, crop, quantity, unit, declarationYear || null]
    );
    res.status(201).json({ declaration: rows[0] });
  } catch (err) {
    if (err.code === "23514") {
      return res.status(400).json({ error: "unit must be one of: kg, tons, bags, tubers, crates, baskets" });
    }
    console.error(err);
    res.status(500).json({ error: "Could not save declaration" });
  }
}

export async function deleteMyProduct(req, res) {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM farmer_products WHERE id = $1 AND farmer_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: "Product not found" });
    res.status(204).end();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(400).json({ error: "This listing has already been sourced into an order and can't be deleted" });
    }
    console.error(err);
    res.status(500).json({ error: "Could not delete listing" });
  }
}

// --- Transactions (selling only — loan activity lives in the Loan Office) -

export async function myTransactions(req, res) {
  const { rows: orderPayments } = await pool.query(
    `SELECT p.id, p.amount, p.status, o.reference AS order_reference, o.created_at
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.payee_type = 'farmer' AND p.payee_id = $1
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );

  const { rows: savingsDeposits } = await pool.query(
    `SELECT id, amount, created_at FROM savings_deposits WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  const transactions = [
    ...orderPayments.map((p) => ({
      id: p.id,
      type: "order",
      amount: Number(p.amount),
      status: p.status,
      reference: p.order_reference,
      date: p.created_at,
    })),
    ...savingsDeposits.map((s) => ({
      id: s.id,
      type: "savings_deposit",
      amount: Number(s.amount),
      status: "paid",
      reference: null,
      date: s.created_at,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ transactions });
}

// --- Jurisdiction overview (Unit Leader and above) -----------------------
// Same exact-unit-match rule used by the Loan Office jurisdiction queries.

export async function jurisdictionOverview(req, res) {
  // Admin: company-wide list of every farmer, not scoped to a jurisdiction
  // (2026-08-30 admin-universal-access spec).
  if (req.user.role_type === "admin") {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.unit, fp.attendance_pct,
              EXISTS (
                SELECT 1 FROM loans l
                WHERE l.farmer_id = u.id AND l.status = 'disbursed'
                AND COALESCE(
                  (SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id AND r.verified = TRUE),
                  0
                ) < 0.7 * l.amount
              ) AS loan_bound
       FROM users u
       JOIN farmer_profiles fp ON fp.user_id = u.id
       WHERE u.role_type = 'farmer'
       ORDER BY u.name ASC`
    );
    return res.json({ farmers: rows });
  }
  const me = req.farmerProfile;
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.unit, fp.attendance_pct,
            EXISTS (
              SELECT 1 FROM loans l
              WHERE l.farmer_id = u.id AND l.status = 'disbursed'
              AND COALESCE(
                (SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id AND r.verified = TRUE),
                0
              ) < 0.7 * l.amount
            ) AS loan_bound
     FROM users u
     JOIN farmer_profiles fp ON fp.user_id = u.id
     WHERE u.role_type = 'farmer'
       AND u.state = $1 AND u.lga = $2 AND u.ward = $3 AND u.unit = $4
       AND u.id != $5
     ORDER BY u.name ASC`,
    [me.state, me.lga, me.ward, me.unit, req.user.id]
  );
  res.json({ farmers: rows });
}

// --- Seminar attendance (Unit Leader and above) ---------------------------
// Matches the business flow exactly: the leader uploads a scanned sheet
// FIRST, then ticks off who from their own jurisdiction attended, and
// submits both together in one request. Every jurisdiction farmer gets a
// seminar_attendance row either way (attended true/false) so the running
// attendance_pct stays a well-defined ratio over time.

export async function recordAttendance(req, res) {
  const me = req.farmerProfile;
  const { title, eventDate, location, attendedUserIds } = req.body;

  if (!title || !eventDate || !location) {
    return res.status(400).json({ error: "title, eventDate, and location are required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Attendance sheet file is required" });
  }

  let attendedIds;
  try {
    attendedIds = JSON.parse(attendedUserIds || "[]");
  } catch {
    return res.status(400).json({ error: "attendedUserIds must be a JSON array" });
  }

  // Admin: no jurisdiction of their own — every farmer company-wide is a
  // valid attendee (2026-08-30 admin-universal-access spec).
  const { rows: jurisdictionFarmers } =
    req.user.role_type === "admin"
      ? await pool.query(`SELECT u.id FROM users u WHERE u.role_type = 'farmer'`)
      : await pool.query(
          `SELECT u.id FROM users u
           JOIN farmer_profiles fp ON fp.user_id = u.id
           WHERE u.role_type = 'farmer' AND u.state = $1 AND u.lga = $2 AND u.ward = $3 AND u.unit = $4
             AND u.id != $5`,
          [me.state, me.lga, me.ward, me.unit, req.user.id]
        );
  const jurisdictionIds = jurisdictionFarmers.map((f) => f.id);
  if (jurisdictionIds.length === 0) {
    return res.status(400).json({ error: "No farmers found in your jurisdiction" });
  }

  // Only accept attended IDs that genuinely belong to this leader's own
  // jurisdiction — never trust the client's list blindly.
  const jurisdictionSet = new Set(jurisdictionIds);
  const attendedSet = new Set(attendedIds.filter((id) => jurisdictionSet.has(id)));

  const sheetUrl = `/uploads/sheets/${req.file.filename}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: seminarRows } = await client.query(
      `INSERT INTO seminars (title, event_date, location) VALUES ($1, $2, $3) RETURNING id`,
      [title, eventDate, location]
    );
    const seminarId = seminarRows[0].id;

    for (const farmerId of jurisdictionIds) {
      await client.query(
        `INSERT INTO seminar_attendance (seminar_id, user_id, attended, sheet_file_url, marked_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [seminarId, farmerId, attendedSet.has(farmerId), sheetUrl, req.user.id]
      );
    }

    // Recompute each touched farmer's running attendance percentage —
    // attended seminars / all seminars they've ever been marked for.
    for (const farmerId of jurisdictionIds) {
      await client.query(
        `UPDATE farmer_profiles SET attendance_pct = (
           SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE attended) / COUNT(*), 2)
           FROM seminar_attendance WHERE user_id = $1
         ) WHERE user_id = $1`,
        [farmerId]
      );
    }

    await client.query("COMMIT");

    // Real-time indices recompute (2026-08-11 spec) — only for farmers
    // actually marked attended (that's the only thing that changed their
    // training score); fire-and-forget, never blocks the response.
    for (const farmerId of attendedSet) {
      computeAndStoreIndices(farmerId).catch((err) => console.error("indices recompute failed", err));
    }

    res.status(201).json({ seminarId, markedCount: jurisdictionIds.length, attendedCount: attendedSet.size });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not record attendance" });
  } finally {
    client.release();
  }
}

export async function attendanceHistory(req, res) {
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.event_date, s.location,
            COUNT(*) FILTER (WHERE sa.attended) AS attended_count,
            COUNT(*) AS total_count
     FROM seminars s
     JOIN seminar_attendance sa ON sa.seminar_id = s.id
     WHERE sa.marked_by = $1
     GROUP BY s.id, s.title, s.event_date, s.location
     ORDER BY s.event_date DESC`,
    [req.user.id]
  );
  res.json({
    seminars: rows.map((s) => ({
      id: s.id,
      title: s.title,
      eventDate: s.event_date,
      location: s.location,
      attendedCount: Number(s.attended_count),
      totalCount: Number(s.total_count),
    })),
  });
}

// --- Jurisdiction report (2026-08-13 spec) --------------------------
// Unit/Ward/LGA/State Coordinators (and Federal, nationally) can pull a
// report scoped to their own jurisdiction on demand — same shape as the
// admin Analytics department's farmer/produce/savings/loan/training
// sections, just pre-filtered to what that leader actually oversees.

function jurisdictionFilter(rank, u) {
  if (rank === "Federal") return { clause: "TRUE", values: [] };
  if (rank === "State Coordinator") return { clause: "u.state = $1", values: [u.state] };
  if (rank === "LGA Coordinator") return { clause: "u.state = $1 AND u.lga = $2", values: [u.state, u.lga] };
  if (rank === "Ward Leader") return { clause: "u.state = $1 AND u.lga = $2 AND u.ward = $3", values: [u.state, u.lga, u.ward] };
  if (rank === "Unit Leader") return { clause: "u.state = $1 AND u.lga = $2 AND u.ward = $3 AND u.unit = $4", values: [u.state, u.lga, u.ward, u.unit] };
  return null;
}

export async function myJurisdictionReport(req, res) {
  // Admin: company-wide, same as Federal rank — no jurisdiction of their
  // own to filter by (2026-08-30 admin-universal-access spec).
  let filter, scope;
  if (req.user.role_type === "admin") {
    filter = { clause: "TRUE", values: [] };
    scope = { rank: "Admin (company-wide)", state: null, lga: null, ward: null, unit: null };
  } else {
    const { rows: meRows } = await pool.query(
      `SELECT fp.rank, u.state, u.lga, u.ward, u.unit FROM users u
       JOIN farmer_profiles fp ON fp.user_id = u.id WHERE u.id = $1`,
      [req.user.id]
    );
    const me = meRows[0];
    filter = me ? jurisdictionFilter(me.rank, me) : null;
    scope = me;
  }
  if (!filter) {
    return res.status(403).json({ error: "Only Unit Leaders and above can pull a jurisdiction report" });
  }
  const { clause, values } = filter;

  const [totalRes, genderRes, incomeRes, produceRes, savingsRes, loanRes, trainingRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM users u WHERE u.role_type = 'farmer' AND ${clause}`, values),
    pool.query(
      `SELECT u.sex AS key, COUNT(*) AS n FROM users u WHERE u.role_type = 'farmer' AND ${clause} GROUP BY u.sex`,
      values
    ),
    pool.query(
      `SELECT fp.annual_farm_income AS key, COUNT(*) AS n FROM users u
       JOIN farmer_profiles fp ON fp.user_id = u.id WHERE u.role_type = 'farmer' AND ${clause} GROUP BY fp.annual_farm_income`,
      values
    ),
    pool.query(
      `SELECT fd.crop AS crop, fd.unit AS unit, SUM(fd.quantity) AS total
       FROM farmer_declarations fd JOIN users u ON u.id = fd.farmer_id
       WHERE ${clause} GROUP BY fd.crop, fd.unit ORDER BY total DESC`,
      values
    ),
    pool.query(
      `SELECT COALESCE(SUM(sd.main_portion), 0) AS main_total, COALESCE(SUM(sd.insurance_portion), 0) AS insurance_total
       FROM savings_deposits sd JOIN users u ON u.id = sd.user_id WHERE ${clause}`,
      values
    ),
    pool.query(
      `SELECT l.status AS key, COUNT(*) AS n FROM loans l JOIN users u ON u.id = l.farmer_id
       WHERE ${clause} GROUP BY l.status`,
      values
    ),
    pool.query(
      `SELECT fp.rank AS key, COUNT(*) AS n FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
       WHERE u.role_type = 'farmer' AND ${clause} GROUP BY fp.rank`,
      values
    ),
  ]);

  const toBreakdown = (rows) => rows.map((r) => ({ key: r.key || "Not stated", count: Number(r.n) }));

  res.json({
    scope: { rank: scope.rank, state: scope.state, lga: scope.lga, ward: scope.ward, unit: scope.unit },
    totalFarmers: Number(totalRes.rows[0].n),
    byGender: toBreakdown(genderRes.rows),
    byAnnualIncome: toBreakdown(incomeRes.rows),
    produceByCrop: produceRes.rows.map((r) => ({ crop: r.crop, unit: r.unit, total: Number(r.total) })),
    savings: {
      mainTotal: Number(savingsRes.rows[0].main_total),
      insuranceTotal: Number(savingsRes.rows[0].insurance_total),
    },
    loansByStatus: toBreakdown(loanRes.rows),
    byLeadershipRank: toBreakdown(trainingRes.rows),
  });
}

// --- Company growth (Farmer's Room "Home" tab, 2026-08-12) --------------
// Real registration data, not fabricated — cumulative farmer count by
// month, for a simple growth bar chart. Open to any authenticated user
// (not sensitive), not just farmers, in case other rooms want it later.
export async function companyGrowth(req, res) {
  const { rows } = await pool.query(
    `SELECT date_trunc('month', created_at) AS month, COUNT(*) AS n
     FROM users WHERE role_type = 'farmer'
     GROUP BY month ORDER BY month ASC`
  );
  let cumulative = 0;
  const months = rows.map((r) => {
    cumulative += Number(r.n);
    return { month: r.month, newFarmers: Number(r.n), totalFarmers: cumulative };
  });
  res.json({ months, totalFarmers: cumulative });
}

// --- Training-completion ranking -------------------------------------
// Distinct from farmer_profiles.rank (the leadership rank). Earned purely
// by trainings a Unit Leader has cleared attendance for — computed live
// from seminar_attendance rather than a stored counter, since that's
// already the ground truth attendance_pct is computed from too.

export async function myRanking(req, res) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT date_trunc('quarter', s.event_date)) AS n
     FROM seminar_attendance sa
     JOIN seminars s ON s.id = sa.seminar_id
     WHERE sa.user_id = $1 AND sa.attended = TRUE`,
    [req.user.id]
  );
  const quartersEngaged = Number(rows[0].n);
  res.json({
    quartersEngaged,
    rankLabel: trainingRankLabel(quartersEngaged),
    nextRankLabel: nextTrainingRankLabel(quartersEngaged),
  });
}

// Admin view — supports the "criteria for choosing leaders" use case the
// user described, plus doubles as an analytics-ready export (state/LGA/
// ward/unit already on `users`, filterable/aggregatable per the data
// mandate in memory).
export async function adminListRanking(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.state, u.lga, u.ward, u.unit, fp.rank AS leadership_rank,
            COUNT(DISTINCT date_trunc('quarter', s.event_date)) FILTER (WHERE sa.attended) AS quarters_engaged
     FROM users u
     JOIN farmer_profiles fp ON fp.user_id = u.id
     LEFT JOIN seminar_attendance sa ON sa.user_id = u.id
     LEFT JOIN seminars s ON s.id = sa.seminar_id
     WHERE u.role_type = 'farmer'
     GROUP BY u.id, u.name, u.state, u.lga, u.ward, u.unit, fp.rank
     ORDER BY quarters_engaged DESC, u.name ASC`
  );
  res.json({
    farmers: rows.map((r) => ({
      userId: r.id,
      name: r.name,
      state: r.state,
      lga: r.lga,
      ward: r.ward,
      unit: r.unit,
      leadershipRank: r.leadership_rank,
      quartersEngaged: Number(r.quarters_engaged),
      trainingRankLabel: trainingRankLabel(Number(r.quarters_engaged)),
    })),
  });
}

// --- Feedback ---------------------------------------------------------------
// A direct line to admin — challenges, concerns about leadership or
// suspicious activity, or general recommendations.

export async function listMyFeedback(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM farmer_feedback WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ feedback: rows });
}

export async function submitFeedback(req, res) {
  const { category, message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  const validCategories = ["challenge", "maltreatment", "suspicious_activity", "recommendation", "other"];
  const cat = validCategories.includes(category) ? category : "other";

  const { rows } = await pool.query(
    `INSERT INTO farmer_feedback (user_id, category, message) VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, cat, message.trim()]
  );
  res.status(201).json({ feedback: rows[0] });
}

// --- Admin: feedback review ----------------------------------------------

export async function adminListFeedback(req, res) {
  const { rows } = await pool.query(
    `SELECT f.*, u.name AS farmer_name FROM farmer_feedback f
     JOIN users u ON u.id = f.user_id
     ORDER BY f.created_at DESC`
  );
  res.json({ feedback: rows.map((f) => ({ ...f, farmerName: f.farmer_name })) });
}

export async function adminMarkFeedbackReviewed(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE farmer_feedback SET status = 'reviewed' WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Feedback not found" });
  res.json({ feedback: rows[0] });
}
