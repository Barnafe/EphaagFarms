import { pool } from "../db/pool.js";

// Grading-indices engine (2026-08-11 spec) — see
// [[ephaag-farms-farmer-room-specs]] memory for the full spec and the
// judgment calls made resolving it. Key points:
//
// - Quarters are CALENDAR quarters ending Mar/Jun/Sep/Dec (user's own
//   framing) — computed with date_trunc('quarter', ...), which aligns to
//   Jan/Apr/Jul/Oct starts.
// - Scoring is REAL-TIME and INCREMENTAL ("anytime attendance is marked...
//   points are calculated and added automatically") — not a single batch
//   recompute at period end. This function is called after every relevant
//   event (deposit, verified repayment, attendance mark) and upserts the
//   CURRENT quarter's stored snapshot.
// - Confirmed index maxes (2026-08-11): savings 6, repayment 12,
//   training 20 (revised up from 10 — 2 sessions/month x 2.5pts, all
//   sessions in a quarter = 20), funds utilization 12 (still untracked,
//   always 0). Unit leader recommendation has no assigned point value —
//   never included in the numeric subtotal, shown as a separate boolean.
// - Training and repayment maxes are reached via PROPORTIONAL credit
//   against an expected-per-quarter count (6 sessions, 3 monthly
//   repayments) rather than a hardcoded pass/fail — this is Claude's
//   interpretation of "smart, real-time accumulation", not a number the
//   user gave directly; flagged to them.

const INDEX_MAX = {
  savings: 6,
  repayment: 12,
  training: 20,
  fundsUtilization: 12,
};

const EXPECTED_TRAINING_SESSIONS_PER_QUARTER = 6; // 2/month x 3 months
const EXPECTED_REPAYMENTS_PER_QUARTER = 3; // monthly repayment cadence

function currentQuarterStart() {
  const now = new Date();
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  return new Date(Date.UTC(now.getFullYear(), qMonth, 1)).toISOString().slice(0, 10);
}

export async function computeAndStoreIndices(farmerId) {
  const quarterStart = currentQuarterStart();

  const { rows: depositMonths } = await pool.query(
    `SELECT COUNT(DISTINCT date_trunc('month', created_at)) AS n
     FROM savings_deposits
     WHERE user_id = $1 AND created_at >= $2::date`,
    [farmerId, quarterStart]
  );
  const savingsPoints = Math.min(INDEX_MAX.savings, (Number(depositMonths[0].n) / 3) * INDEX_MAX.savings);

  const { rows: repaymentCounts } = await pool.query(
    `SELECT COUNT(*) AS n FROM loan_repayments r
     JOIN loans l ON l.id = r.loan_id
     WHERE l.farmer_id = $1 AND r.verified = TRUE AND r.paid_at >= $2::date`,
    [farmerId, quarterStart]
  );
  const repaymentPoints = Math.min(
    INDEX_MAX.repayment,
    (Number(repaymentCounts[0].n) / EXPECTED_REPAYMENTS_PER_QUARTER) * INDEX_MAX.repayment
  );

  const { rows: trainingCounts } = await pool.query(
    `SELECT COUNT(*) AS n FROM seminar_attendance sa
     JOIN seminars s ON s.id = sa.seminar_id
     WHERE sa.user_id = $1 AND sa.attended = TRUE AND s.event_date >= $2::date`,
    [farmerId, quarterStart]
  );
  const trainingPoints = Math.min(
    INDEX_MAX.training,
    (Number(trainingCounts[0].n) / EXPECTED_TRAINING_SESSIONS_PER_QUARTER) * INDEX_MAX.training
  );

  // Productive funds utilization: no data source anywhere in the app —
  // always 0, never silently invented.
  const fundsUtilizationPoints = 0;

  await pool.query(
    `INSERT INTO farmer_index_snapshots
       (farmer_id, quarter_start, savings_points, repayment_points, training_points, funds_utilization_points, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (farmer_id, quarter_start) DO UPDATE SET
       savings_points = EXCLUDED.savings_points,
       repayment_points = EXCLUDED.repayment_points,
       training_points = EXCLUDED.training_points,
       funds_utilization_points = EXCLUDED.funds_utilization_points,
       updated_at = now()`,
    [farmerId, quarterStart, savingsPoints, repaymentPoints, trainingPoints, fundsUtilizationPoints]
  );
}

export async function getIndicesSnapshot(farmerId) {
  const quarterStart = currentQuarterStart();
  const { rows } = await pool.query(
    `SELECT * FROM farmer_index_snapshots WHERE farmer_id = $1 AND quarter_start = $2`,
    [farmerId, quarterStart]
  );
  const snap = rows[0] || {
    savings_points: 0,
    repayment_points: 0,
    training_points: 0,
    funds_utilization_points: 0,
  };

  const { rows: recRows } = await pool.query(
    `SELECT status FROM loans WHERE farmer_id = $1
     AND status IN ('recommended','finance_verified','approved','disbursed')
     ORDER BY created_at DESC LIMIT 1`,
    [farmerId]
  );
  const unitLeaderRecommended = recRows.length > 0;

  const round2 = (n) => Math.round(Number(n) * 100) / 100;

  return {
    quarterStart,
    indices: [
      { key: "savings_record", label: "Maintaining monthly savings record", points: round2(snap.savings_points), maxPoints: INDEX_MAX.savings },
      { key: "loan_repayment", label: "Maintenance of loan repayment", points: round2(snap.repayment_points), maxPoints: INDEX_MAX.repayment },
      { key: "training_attendance", label: "Training attendance", points: round2(snap.training_points), maxPoints: INDEX_MAX.training },
      { key: "funds_utilization", label: "Productive funds utilization", points: round2(snap.funds_utilization_points), maxPoints: INDEX_MAX.fundsUtilization, note: "Not yet tracked by the system" },
      { key: "unit_leader_recommendation", label: "Unit leader recommendation", points: null, maxPoints: null, recommended: unitLeaderRecommended, note: "Point value not yet set" },
    ],
    subtotal: round2(Number(snap.savings_points) + Number(snap.repayment_points) + Number(snap.training_points)),
    subtotalMax: INDEX_MAX.savings + INDEX_MAX.repayment + INDEX_MAX.training,
    note: "Funds-utilization and unit-leader-recommendation scoring are pending — this display doesn't yet gate applications.",
  };
}

export async function getIndicesHistory(farmerId) {
  const { rows } = await pool.query(
    `SELECT * FROM farmer_index_snapshots WHERE farmer_id = $1 ORDER BY quarter_start DESC`,
    [farmerId]
  );
  return rows.map((r) => ({
    quarterStart: r.quarter_start,
    savingsPoints: Number(r.savings_points),
    repaymentPoints: Number(r.repayment_points),
    trainingPoints: Number(r.training_points),
    fundsUtilizationPoints: Number(r.funds_utilization_points),
    updatedAt: r.updated_at,
  }));
}
