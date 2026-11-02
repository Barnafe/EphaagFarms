import { pool } from "../db/pool.js";
import { getSetting } from "./settings.js";

// Grading-indices engine (2026-08-11 spec), see
// [[ephaag-farms-farmer-room-specs]] memory for the full spec and the
// judgment calls made resolving it. Key points:
//
// - Quarters are CALENDAR quarters ending Mar/Jun/Sep/Dec (user's own
//   framing), computed with date_trunc('quarter', ...), which aligns to
//   Jan/Apr/Jul/Oct starts.
// - Scoring is REAL-TIME and INCREMENTAL ("anytime attendance is marked...
//   points are calculated and added automatically"), not a single batch
//   recompute at period end. This function is called after every relevant
//   event (deposit, verified repayment, attendance mark) and upserts the
//   CURRENT quarter's stored snapshot.
// - Confirmed index maxes (2026-08-11): savings 6, repayment 12,
//   training 20 (revised up from 10, 2 sessions/month x 2.5pts, all
//   sessions in a quarter = 20), funds utilization 12 (still untracked,
//   always 0). Unit leader recommendation has NO assigned point value BY
//   DESIGN, confirmed 2026-09-06, it is a direct application GATE, not a
//   graded index: a farmer holding an unused recommendation ticket skips
//   the normal eligibility pipeline outright rather than earning points
//   toward it. See loan_recommendation_tickets / issueRecommendationTicket
//   in loanController.js for the actual gate mechanism; this engine only
//   ever surfaces it as a read-only boolean for display.
// - Training and repayment maxes are reached via PROPORTIONAL credit
//   against an expected-per-quarter count (6 sessions, 3 monthly
//   repayments) rather than a hardcoded pass/fail, this is Claude's
//   interpretation of "smart, real-time accumulation", not a number the
//   user gave directly; flagged to them.

const INDEX_MAX = {
  savings: 6,
  repayment: 12,
  training: 20,
  fundsUtilization: 12,
};
// Total of the four scored indices (the Unit Leader recommendation is a yes/no gate, no points).
export const LOAN_SCORE_MAX = INDEX_MAX.savings + INDEX_MAX.repayment + INDEX_MAX.training + INDEX_MAX.fundsUtilization; // 50

const EXPECTED_TRAINING_SESSIONS_PER_QUARTER = 6; // 2/month x 3 months
const EXPECTED_REPAYMENTS_PER_QUARTER = 3; // monthly repayment cadence

// Phase 6 (2026-10): "productive funds utilization" is worked out from system
// data, half from each signal: produce DECLARED in the quarter and produce
// LISTED for sale in the quarter. A farmer whose loan was paid out inside the
// quarter only gets credit for produce declared/listed AFTER the payout.
const FUNDS_PER_SIGNAL = INDEX_MAX.fundsUtilization / 2;

export const MIN_SCORE_SETTING = "loan_min_total_score";

const iso = (d) => d.toISOString().slice(0, 10);
const quarterStartOf = (d) => new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
const addMonths = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

export function currentQuarterStart(now = new Date()) {
  return iso(quarterStartOf(now));
}
/** The most recent COMPLETED calendar quarter: the one whose score counts for a loan application. */
export function lastCompletedQuarterStart(now = new Date()) {
  return iso(addMonths(quarterStartOf(now), -3));
}
const nextQuarterStart = (qs) => iso(addMonths(new Date(`${qs}T00:00:00Z`), 3));

/** The points a farmer earned in ONE quarter (start inclusive, next quarter's start exclusive). */
export async function scoreQuarter(farmerId, quarterStart, runner = pool) {
  const to = nextQuarterStart(quarterStart);

  const { rows: depositMonths } = await runner.query(
    `SELECT COUNT(DISTINCT date_trunc('month', created_at)) AS n
     FROM savings_deposits
     WHERE user_id = $1 AND created_at >= $2::date AND created_at < $3::date`,
    [farmerId, quarterStart, to]
  );
  const savings = Math.min(INDEX_MAX.savings, (Number(depositMonths[0].n) / 3) * INDEX_MAX.savings);

  const { rows: repaymentCounts } = await runner.query(
    `SELECT COUNT(*) AS n FROM loan_repayments r
     JOIN loans l ON l.id = r.loan_id
     WHERE l.farmer_id = $1 AND r.verified = TRUE AND r.paid_at >= $2::date AND r.paid_at < $3::date`,
    [farmerId, quarterStart, to]
  );
  const repayment = Math.min(
    INDEX_MAX.repayment,
    (Number(repaymentCounts[0].n) / EXPECTED_REPAYMENTS_PER_QUARTER) * INDEX_MAX.repayment
  );

  const { rows: trainingCounts } = await runner.query(
    `SELECT COUNT(*) AS n FROM seminar_attendance sa
     JOIN seminars s ON s.id = sa.seminar_id
     WHERE sa.user_id = $1 AND sa.attended = TRUE AND s.event_date >= $2::date AND s.event_date < $3::date`,
    [farmerId, quarterStart, to]
  );
  const training = Math.min(
    INDEX_MAX.training,
    (Number(trainingCounts[0].n) / EXPECTED_TRAINING_SESSIONS_PER_QUARTER) * INDEX_MAX.training
  );

  // Productive funds utilization. If a loan was paid out during this quarter, only produce
  // activity after the (latest) payout counts; otherwise the whole quarter counts.
  const { rows: payoutRows } = await runner.query(
    `SELECT MAX(h.created_at) AS paid_at FROM loan_status_history h
     JOIN loans l ON l.id = h.loan_id
     WHERE l.farmer_id = $1 AND h.to_status = 'disbursed' AND h.created_at >= $2::date AND h.created_at < $3::date`,
    [farmerId, quarterStart, to]
  );
  const since = payoutRows[0].paid_at || null;
  const { rows: decl } = await runner.query(
    `SELECT COUNT(*) AS n FROM farmer_declarations
     WHERE farmer_id = $1 AND created_at >= COALESCE($4::timestamptz, $2::date) AND created_at >= $2::date AND created_at < $3::date`,
    [farmerId, quarterStart, to, since]
  );
  const { rows: listed } = await runner.query(
    `SELECT COUNT(*) AS n FROM farmer_products
     WHERE farmer_id = $1 AND created_at >= COALESCE($4::timestamptz, $2::date) AND created_at >= $2::date AND created_at < $3::date`,
    [farmerId, quarterStart, to, since]
  );
  const declared = Number(decl[0].n) > 0;
  const isListed = Number(listed[0].n) > 0;
  const funds = (declared ? FUNDS_PER_SIGNAL : 0) + (isListed ? FUNDS_PER_SIGNAL : 0);

  return {
    quarterStart, savings, repayment, training, funds,
    fundsDetail: { declared, listed: isListed, afterLoanPayout: since !== null },
    total: savings + repayment + training + funds,
  };
}

async function storeQuarter(farmerId, s, runner = pool) {
  await runner.query(
    `INSERT INTO farmer_index_snapshots
       (farmer_id, quarter_start, savings_points, repayment_points, training_points, funds_utilization_points, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (farmer_id, quarter_start) DO UPDATE SET
       savings_points = EXCLUDED.savings_points,
       repayment_points = EXCLUDED.repayment_points,
       training_points = EXCLUDED.training_points,
       funds_utilization_points = EXCLUDED.funds_utilization_points,
       updated_at = now()`,
    [farmerId, s.quarterStart, s.savings, s.repayment, s.training, s.funds]
  );
}

export async function computeAndStoreIndices(farmerId, quarterStart = currentQuarterStart()) {
  const s = await scoreQuarter(farmerId, quarterStart);
  await storeQuarter(farmerId, s);
  return s;
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** The admin-set minimum total score (points out of LOAN_SCORE_MAX). Not set = 0 = no minimum. */
export async function getMinimumScore(runner = pool) {
  const v = Number(await getSetting(MIN_SCORE_SETTING, 0, runner));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * The score that counts for a loan application: the LAST COMPLETED calendar quarter,
 * recomputed fresh (and stored) so it is never stale. Nobody is exempt from the minimum.
 */
export async function getLoanScoreStatus(farmerId, now = new Date()) {
  const quarterStart = lastCompletedQuarterStart(now);
  const s = await computeAndStoreIndices(farmerId, quarterStart);
  const minimum = await getMinimumScore();
  const total = round2(s.total);
  const { rows } = await pool.query(`SELECT created_at FROM users WHERE id = $1`, [farmerId]);
  const joined = rows[0]?.created_at ? new Date(rows[0].created_at) : null;
  const newThisQuarter = !!joined && iso(joined) >= currentQuarterStart(now);
  const pct = (n) => Math.round((n / LOAN_SCORE_MAX) * 100);
  return {
    quarterStart,
    quarterEnd: iso(new Date(new Date(`${nextQuarterStart(quarterStart)}T00:00:00Z`).getTime() - 86400000)),
    total, totalMax: LOAN_SCORE_MAX, totalPercent: pct(total),
    minimum, minimumPercent: pct(minimum),
    // A farmer who joined this quarter has not finished a quarter yet, so (when a minimum is set) they cannot apply.
    meetsMinimum: total >= minimum && !(minimum > 0 && newThisQuarter),
    newThisQuarter,
    breakdown: {
      savings: round2(s.savings), repayment: round2(s.repayment), training: round2(s.training), fundsUtilization: round2(s.funds),
    },
    fundsDetail: s.fundsDetail,
  };
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

  const counting = await getLoanScoreStatus(farmerId);

  return {
    quarterStart,
    indices: [
      { key: "savings_record", label: "Maintaining monthly savings record", points: round2(snap.savings_points), maxPoints: INDEX_MAX.savings },
      { key: "loan_repayment", label: "Maintenance of loan repayment", points: round2(snap.repayment_points), maxPoints: INDEX_MAX.repayment },
      { key: "training_attendance", label: "Training attendance", points: round2(snap.training_points), maxPoints: INDEX_MAX.training },
      { key: "funds_utilization", label: "Productive funds utilization", points: round2(snap.funds_utilization_points), maxPoints: INDEX_MAX.fundsUtilization, note: "Worked out from the produce you declare and list" },
      { key: "unit_leader_recommendation", label: "Unit leader recommendation", points: null, maxPoints: null, recommended: unitLeaderRecommended, note: "A yes/no gate with no points" },
    ],
    subtotal: round2(Number(snap.savings_points) + Number(snap.repayment_points) + Number(snap.training_points) + Number(snap.funds_utilization_points)),
    subtotalMax: LOAN_SCORE_MAX,
    counting,
    note: "This quarter's points are shown as they build up. The score that counts for a loan application is the last completed quarter's (see 'counting').",
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
