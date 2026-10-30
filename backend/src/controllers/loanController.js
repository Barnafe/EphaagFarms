import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";
import { queueLoanPayout, startRepaymentPayment, startBoostPayment } from "../services/moneyIn.js";
import { kickPayouts } from "../services/payouts.js";
import { getIndicesSnapshot, getIndicesHistory, computeAndStoreIndices } from "../utils/indicesEngine.js";
import { getBalances as getSavingsBalances } from "./savingsController.js";

// --- Loan types & terms — the approved financing banner is the single
// source of truth (2026-10-20: "the banner is the official and agreed
// prices"). Everything below mirrors it exactly; see [[ephaag-finance-banner]].
//
// LT1 "Progressive Savings Loan" (loan_type 'aided'): 0% interest, six
//   fixed levels. The farmer's main savings must reach the level's savings
//   figure, the loan is a FIXED amount per level (2x savings in levels 1-3,
//   3x in levels 4-6) and the repayment period is fixed per level.
// LT2 "Business Boost" (loan_type 'boost_cash'): 25% deposit, four fixed
//   deposit -> loan pairs, 5-month repayment, 1-90 day maturity period.
// LT3 "Business Enlargement" (loan_type 'business_fast_cash'): 100%
//   interest (repay x2), 8-month repayment, loans of 100k / 200k / 300k.
const LOAN_TERMS = {
  aided: {
    interestRate: 0,
    allowedRepaymentMonths: [5, 8, 10, 12],
  },
  boost_cash: {
    interestRate: 25, // the 25% upfront deposit functions as the fixed interest
    allowedRepaymentMonths: [5],
  },
  business_fast_cash: {
    interestRate: 100,
    allowedRepaymentMonths: [8],
  },
};

export const AIDED_LEVELS = [
  { level: 1, savings: 10000, loan: 20000, months: 5 },
  { level: 2, savings: 20000, loan: 40000, months: 8 },
  { level: 3, savings: 30000, loan: 60000, months: 10 },
  { level: 4, savings: 40000, loan: 120000, months: 12 },
  { level: 5, savings: 50000, loan: 150000, months: 12 },
  { level: 6, savings: 60000, loan: 180000, months: 12 },
];

// LT2: loan -> required 25% deposit (deposit is always exactly 25%).
export const BOOST_CASH_LOAN_AMOUNTS = [50000, 100000, 200000, 300000];
// LT3: allowed loan amounts (repay double).
export const FAST_CASH_LOAN_AMOUNTS = [100000, 200000, 300000];

const fmtN = (n) => `₦${Number(n).toLocaleString()}`;

// Total the farmer must repay: the loan itself, plus the interest for
// loans that charge it on repayment. Only LT3 does (100% -> x2); LT2's
// 25% is paid up front as the deposit, and LT1 is interest-free.
export function repayableTotal(loan) {
  const amount = Number(loan.amount);
  if (loan.loan_type === "business_fast_cash") {
    return amount * (1 + Number(loan.interest_rate ?? 100) / 100);
  }
  return amount;
}

// --- LT1 progression ----------------------------------------------------
// A farmer climbs one level each time a previous LT1 loan is disbursed AND
// fully repaid (verified repayments >= the amount owed). An open or
// defaulted loan does not advance the sequence. After level 6 the farmer
// stays on level 6 — the banner defines no level 7.
async function aidedTermsFor(farmerId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.amount, l.loan_type, l.interest_rate,
            COALESCE(SUM(r.amount) FILTER (WHERE r.verified), 0) AS repaid
     FROM loans l LEFT JOIN loan_repayments r ON r.loan_id = l.id
     WHERE l.farmer_id = $1 AND l.loan_type = 'aided' AND l.status = 'disbursed'
     GROUP BY l.id, l.amount, l.loan_type, l.interest_rate`,
    [farmerId]
  );
  const completedCount = rows.filter((r) => Number(r.repaid) >= repayableTotal(r)).length;
  const lvl = AIDED_LEVELS[Math.min(completedCount, AIDED_LEVELS.length - 1)];
  return {
    level: lvl.level,
    borrowNumber: lvl.level, // kept for older clients
    requiredSavings: lvl.savings,
    loanAmount: lvl.loan,
    forcedRepaymentMonths: lvl.months,
    multiplier: lvl.loan / lvl.savings,
    atTopLevel: completedCount >= AIDED_LEVELS.length - 1,
    levels: AIDED_LEVELS,
  };
}

export async function myAidedLoanTerms(req, res) {
  const terms = await aidedTermsFor(req.user.id);
  res.json(terms);
}

// A farmer can't open a second loan of the same type while one is still
// running — otherwise two LT1 applications could both be sized at "level 1"
// against the same savings, or an LT3 loan stacked on an unpaid LT3 loan.
async function openLoanOfType(farmerId, loanType) {
  const { rows } = await pool.query(
    `SELECT l.id, l.reference, l.status, l.amount, l.loan_type, l.interest_rate,
            COALESCE(SUM(r.amount) FILTER (WHERE r.verified), 0) AS repaid
     FROM loans l LEFT JOIN loan_repayments r ON r.loan_id = l.id
     WHERE l.farmer_id = $1 AND l.loan_type = $2 AND l.status <> 'rejected'
     GROUP BY l.id, l.reference, l.status, l.amount, l.loan_type, l.interest_rate`,
    [farmerId, loanType]
  );
  return rows.find((r) => r.status !== "disbursed" || Number(r.repaid) < repayableTotal(r)) || null;
}

const BOOST_CASH_DEPOSIT_PCT = 25;
const BOOST_CASH_MIN_HOLD_MONTHS = 1; // earliest a verified deposit becomes usable

// --- Audit trail (hard requirement — see spec: "otherwise it will be a
// failed system if someone falsefully claim something") ------------------
async function logTransition(client, loanId, fromStatus, toStatus, actorId, note) {
  await client.query(
    `INSERT INTO loan_status_history (loan_id, from_status, to_status, actor_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [loanId, fromStatus, toStatus, actorId || null, note || null]
  );
}

// Fire-and-forget notification helpers — never block the request, never
// throw (sendMail itself already never throws).
async function notifyFinance(loan) {
  const { rows } = await pool.query(`SELECT email FROM users WHERE role_type = 'admin' AND email IS NOT NULL`);
  for (const { email } of rows) {
    sendMail({
      to: email,
      subject: `Loan ${loan.reference} awaiting Finance review`,
      html: `<p>A Unit-Leader-recommended loan application (₦${Number(loan.amount).toLocaleString()}, ${loan.loan_type}) is waiting for Finance's credit/financial review.</p>`,
    }).catch(() => {});
  }
}

async function notifyTopRank(loan) {
  const { rows } = await pool.query(
    `SELECT u.email FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
     WHERE fp.rank = 'Federal' AND u.email IS NOT NULL`
  );
  for (const { email } of rows) {
    sendMail({
      to: email,
      subject: `Loan ${loan.reference} awaiting final approval`,
      html: `<p>A Finance-verified loan application (₦${Number(loan.amount).toLocaleString()}, ${loan.loan_type}) is waiting for your final approval.</p>`,
    }).catch(() => {});
  }
}

async function notifyFinanceClearToDisburse(loan) {
  const { rows } = await pool.query(`SELECT email FROM users WHERE role_type = 'admin' AND email IS NOT NULL`);
  for (const { email } of rows) {
    sendMail({
      to: email,
      subject: `Loan ${loan.reference} approved — clear to disburse`,
      html: `<p>Loan ${loan.reference} has received final approval. Finance may proceed with disbursement.</p>`,
    }).catch(() => {});
  }
}

async function notifyFarmerDecision(loan, decision) {
  const { rows } = await pool.query(`SELECT email, name FROM users WHERE id = $1`, [loan.farmer_id]);
  const farmer = rows[0];
  if (!farmer?.email) return;
  sendMail({
    to: farmer.email,
    subject: decision === "rejected" ? `Loan ${loan.reference} was not approved` : `Loan ${loan.reference} approved`,
    html: `<p>Hi ${farmer.name}, your loan application ${loan.reference} has been ${decision}.</p>`,
  }).catch(() => {});
}

// --- Boost Cash deposits (2026-08-11: deposit now happens BEFORE the loan
// application exists — farmer declares an intended amount, pays 25%,
// Finance verifies, then after a minimum hold period the deposit becomes
// usable to fund exactly one loan application) -----------------------

export async function declareBoostDeposit(req, res) {
  const { intendedLoanAmount } = req.body;
  const amt = Number(intendedLoanAmount);
  if (!BOOST_CASH_LOAN_AMOUNTS.includes(amt)) {
    return res.status(400).json({
      error: `Business Boost loans are ${BOOST_CASH_LOAN_AMOUNTS.map(fmtN).join(", ")} (with a 25% deposit of ${BOOST_CASH_LOAN_AMOUNTS.map((x) => fmtN(x / 4)).join(", ")} respectively)`,
    });
  }

  const depositAmount = Math.round(amt * (BOOST_CASH_DEPOSIT_PCT / 100));
  const { rows } = await pool.query(
    `INSERT INTO boost_cash_deposits (farmer_id, intended_loan_amount, deposit_amount)
     VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, amt, depositAmount]
  );
  res.status(201).json({ deposit: mapDeposit(rows[0]) });
}

function mapDeposit(d) {
  const verified = !!d.verified_at;
  const eligibleFrom = verified
    ? new Date(new Date(d.verified_at).setMonth(new Date(d.verified_at).getMonth() + BOOST_CASH_MIN_HOLD_MONTHS))
    : null;
  const isEligible = verified && !d.used_for_loan_id && eligibleFrom && new Date() >= eligibleFrom;
  return {
    id: d.id,
    intendedLoanAmount: Number(d.intended_loan_amount),
    depositAmount: Number(d.deposit_amount),
    paidAt: d.paid_at,
    verifiedAt: d.verified_at,
    usedForLoanId: d.used_for_loan_id,
    eligibleFrom,
    isEligible,
  };
}

export async function myBoostDeposits(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM boost_cash_deposits WHERE farmer_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ deposits: rows.map(mapDeposit) });
}

// The 25% deposit is paid through Paystack, which confirms it: nothing is left for Finance to verify.
export async function adminPendingBoostDeposits(req, res) { res.json({ deposits: [] }); }
export async function adminVerifyBoostDeposit(req, res) {
  res.status(410).json({ error: "Boost Cash deposits are verified automatically through Paystack." });
}

// --- Recommendation tickets (2026-09-06 spec) ---------------------------
// A proactive, one-time gate — separate from recommendLoan() above, which
// reviews an ALREADY-SUBMITTED pending application. This lets a Unit
// Leader pre-authorize a specific farmer, before any application exists,
// so that farmer's next applyForLoan() call skips the pending review step
// entirely. See the migration comment on loan_recommendation_tickets for
// the full design.

export async function issueRecommendationTicket(req, res) {
  const { farmerId, reason } = req.body;
  if (!farmerId || !reason || !reason.trim()) {
    return res.status(400).json({ error: "farmerId and reason are required" });
  }

  const { rows: farmerRows } = await pool.query(
    `SELECT u.id, u.state, u.lga, u.ward, u.unit FROM users u
     JOIN farmer_profiles fp ON fp.user_id = u.id WHERE u.id = $1`,
    [farmerId]
  );
  const farmer = farmerRows[0];
  if (!farmer) return res.status(404).json({ error: "Farmer not found" });

  // Same jurisdiction rule as recommendLoan — admin bypasses (company-wide).
  if (req.user.role_type !== "admin") {
    const sameUnit =
      farmer.state === req.farmerProfile.state &&
      farmer.lga === req.farmerProfile.lga &&
      farmer.ward === req.farmerProfile.ward &&
      farmer.unit === req.farmerProfile.unit;
    if (!sameUnit) {
      return res.status(403).json({ error: "This farmer isn't in your jurisdiction" });
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO loan_recommendation_tickets (farmer_id, issued_by, reason)
       VALUES ($1, $2, $3) RETURNING *`,
      [farmerId, req.user.id, reason.trim()]
    );
    res.status(201).json({ ticket: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This farmer already has an unused recommendation ticket" });
    }
    console.error(err);
    res.status(500).json({ error: "Could not issue recommendation ticket" });
  }
}

export async function myIssuedTickets(req, res) {
  const { rows } = await pool.query(
    `SELECT t.*, u.name AS farmer_name FROM loan_recommendation_tickets t
     JOIN users u ON u.id = t.farmer_id
     WHERE t.issued_by = $1 ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json({ tickets: rows });
}

export async function myRecommendationTicket(req, res) {
  const { rows } = await pool.query(
    `SELECT t.*, u.name AS issued_by_name FROM loan_recommendation_tickets t
     JOIN users u ON u.id = t.issued_by
     WHERE t.farmer_id = $1 AND t.used_at IS NULL
     ORDER BY t.created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ ticket: rows[0] || null });
}

// --- Farmer actions ---------------------------------------------------

export async function applyForLoan(req, res) {
  const { loan_type, reason, depositId } = req.body;
  if (!loan_type) return res.status(400).json({ error: "loan_type is required" });
  const terms = LOAN_TERMS[loan_type];
  if (!terms) {
    return res.status(400).json({ error: "loan_type must be 'aided', 'boost_cash', or 'business_fast_cash'" });
  }

  // No second loan of the same type while one is still running.
  const open = await openLoanOfType(req.user.id, loan_type);
  if (open) {
    return res.status(409).json({
      error: `You already have an open loan of this type (${open.reference}). Finish repaying it before applying again.`,
    });
  }

  let loanAmount;
  let requestedAmount = null;
  let depositRow = null;
  let months;

  if (loan_type === "aided") {
    // LT1 Progressive Savings Loan — everything is dictated by the farmer's
    // current level on the banner. Whatever amount/duration the client
    // sends is ignored: the level fixes the savings needed, the loan
    // amount and the repayment period.
    const lvl = await aidedTermsFor(req.user.id);
    const { mainBalance } = await getSavingsBalances(req.user.id);
    if (mainBalance < lvl.requiredSavings) {
      return res.status(400).json({
        error: `Level ${lvl.level} needs main savings of at least ${fmtN(lvl.requiredSavings)} (you have ${fmtN(mainBalance)}). Save ${fmtN(lvl.requiredSavings - mainBalance)} more to apply for your ${fmtN(lvl.loanAmount)} loan.`,
        mainBalance,
        requiredSavings: lvl.requiredSavings,
      });
    }
    loanAmount = lvl.loanAmount;
    requestedAmount = lvl.requiredSavings;
    months = lvl.forcedRepaymentMonths;
  } else if (loan_type === "boost_cash") {
    // LT2 Business Boost — loan size comes from the verified 25% deposit
    // (deposits themselves can only be declared at the banner's amounts).
    if (!depositId) {
      return res.status(400).json({ error: "Business Boost requires an eligible, verified deposit — declare and verify one first" });
    }
    const { rows } = await pool.query(
      `SELECT * FROM boost_cash_deposits WHERE id = $1 AND farmer_id = $2`,
      [depositId, req.user.id]
    );
    depositRow = rows[0];
    if (!depositRow) return res.status(404).json({ error: "Deposit not found" });
    const mapped = mapDeposit(depositRow);
    if (!mapped.isEligible) {
      return res.status(400).json({
        error: depositRow.used_for_loan_id
          ? "That deposit has already been used for a loan"
          : !depositRow.verified_at
          ? "That deposit hasn't been verified by Finance yet"
          : `That deposit isn't eligible yet — usable from ${mapped.eligibleFrom?.toISOString().slice(0, 10)}`,
      });
    }
    loanAmount = mapped.intendedLoanAmount;
    months = terms.allowedRepaymentMonths[0];
  } else {
    // LT3 Business Enlargement — fixed loan sizes, fixed 8-month term.
    loanAmount = Number(req.body.amount);
    if (!FAST_CASH_LOAN_AMOUNTS.includes(loanAmount)) {
      return res.status(400).json({
        error: `Business Enlargement loans are ${FAST_CASH_LOAN_AMOUNTS.map(fmtN).join(", ")} — pick one of those amounts`,
      });
    }
    months = terms.allowedRepaymentMonths[0];
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ticket check (2026-09-06 spec) — locked FOR UPDATE so two concurrent
    // applications can't both claim the same ticket. An unused ticket
    // means this application skips 'pending' entirely and starts life
    // already 'recommended', with recommended_by set to whoever issued
    // the ticket — the same status a normal application only reaches
    // after a Unit Leader manually reviews it (see recommendLoan above).
    const { rows: ticketRows } = await client.query(
      `SELECT * FROM loan_recommendation_tickets
       WHERE farmer_id = $1 AND used_at IS NULL
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [req.user.id]
    );
    const ticket = ticketRows[0] || null;
    const initialStatus = ticket ? "recommended" : "pending";

    const reference = generateReference(REF_PREFIX.loan);
    const { rows } = await client.query(
      `INSERT INTO loans
         (reference, farmer_id, loan_type, interest_rate, amount, requested_amount, repayment_months, reason,
          deposit_required, deposit_paid_at, deposit_verified, status, recommended_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        reference,
        req.user.id,
        loan_type,
        terms.interestRate,
        loanAmount,
        requestedAmount,
        months,
        reason || null,
        depositRow ? Number(depositRow.deposit_amount) : null,
        depositRow ? depositRow.paid_at : null,
        !!depositRow, // already verified before the loan existed
        initialStatus,
        ticket ? ticket.issued_by : null,
      ]
    );
    const loan = rows[0];
    if (depositRow) {
      await client.query(`UPDATE boost_cash_deposits SET used_for_loan_id = $1 WHERE id = $2`, [loan.id, depositRow.id]);
    }

    if (ticket) {
      await client.query(
        `UPDATE loan_recommendation_tickets SET used_at = now(), used_loan_id = $1 WHERE id = $2`,
        [loan.id, ticket.id]
      );
      await logTransition(
        client,
        loan.id,
        null,
        "recommended",
        req.user.id,
        `Application submitted — auto-recommended via Unit Leader ticket: ${ticket.reason}`
      );
    } else {
      await logTransition(client, loan.id, null, "pending", req.user.id, "Application submitted");
    }

    await client.query("COMMIT");
    if (ticket) {
      notifyFinance(loan).catch(() => {});
    }
    res.status(201).json({ loan });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not submit loan application" });
  } finally {
    client.release();
  }
}

export async function myLoans(req, res) {
  const { rows } = await pool.query(
    "SELECT * FROM loans WHERE farmer_id = $1 ORDER BY created_at DESC",
    [req.user.id]
  );
  res.json({ loans: rows.map((l) => ({ ...l, repayable_total: repayableTotal(l) })) });
}

export async function myLoanHistory(req, res) {
  const { loanId } = req.params;
  const loan = await pool.query("SELECT id FROM loans WHERE id = $1 AND farmer_id = $2", [loanId, req.user.id]);
  if (!loan.rows[0]) return res.status(404).json({ error: "Loan not found" });
  const { rows } = await pool.query(
    `SELECT h.*, u.name AS actor_name FROM loan_status_history h
     LEFT JOIN users u ON u.id = h.actor_id
     WHERE h.loan_id = $1 ORDER BY h.created_at ASC`,
    [loanId]
  );
  res.json({ history: rows });
}

export async function myLoanRepayments(req, res) {
  const { loanId } = req.params;
  const loan = await pool.query("SELECT * FROM loans WHERE id = $1 AND farmer_id = $2", [
    loanId,
    req.user.id,
  ]);
  if (!loan.rows[0]) return res.status(404).json({ error: "Loan not found" });

  const { rows } = await pool.query(
    "SELECT * FROM loan_repayments WHERE loan_id = $1 ORDER BY paid_at DESC",
    [loanId]
  );
  res.json({ repayments: rows });
}

export async function logRepayment(req, res) {
  res.status(410).json({ error: "Repayments are paid online now. Use Pay with Paystack on your loan." });
}

// POST /api/loans/:loanId/repay { amount } — any part of what is owed, never more.
export async function payRepayment(req, res) {
  const r = await startRepaymentPayment(req.user, req.params.loanId, req.body?.amount);
  res.json({ payment: r });
}

// POST /api/loans/boost-deposits/:id/pay
export async function payBoostDeposit(req, res) {
  res.json({ payment: await startBoostPayment(req.user, req.params.id) });
}

// --- Unit Leader actions ----------------------------------------------

export async function pendingForMyUnit(req, res) {
  // Admin: company-wide — every pending loan, not scoped to one unit
  // (admin has no jurisdiction of their own to filter by). See
  // requireFarmerRankOrAdmin in middleware/farmerRank.js.
  if (req.user.role_type === "admin") {
    const { rows } = await pool.query(
      `SELECT l.*, u.name AS farmer_name,
              fp.attendance_pct, fp.course_pct
       FROM loans l
       JOIN users u ON u.id = l.farmer_id
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.id
       WHERE l.status = 'pending'
       ORDER BY l.created_at ASC`
    );
    return res.json({ loans: rows });
  }
  const me = req.farmerProfile;
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS farmer_name,
            fp.attendance_pct, fp.course_pct
     FROM loans l
     JOIN users u ON u.id = l.farmer_id
     LEFT JOIN farmer_profiles fp ON fp.user_id = u.id
     WHERE l.status = 'pending' AND u.state = $1 AND u.lga = $2 AND u.ward = $3 AND u.unit = $4
     ORDER BY l.created_at ASC`,
    [me.state, me.lga, me.ward, me.unit]
  );
  res.json({ loans: rows });
}

export async function recommendLoan(req, res) {
  const { id } = req.params;
  const check = await pool.query(
    `SELECT l.*, u.state, u.lga, u.ward, u.unit FROM loans l
     JOIN users u ON u.id = l.farmer_id WHERE l.id = $1`,
    [id]
  );
  const loan = check.rows[0];
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  if (loan.status !== "pending") {
    return res.status(400).json({ error: "Only pending loans can be recommended" });
  }
  // Admin: no jurisdiction to match against — company-wide authority, skip
  // the sameUnit check entirely (see pendingForMyUnit above for the same
  // pattern).
  if (req.user.role_type !== "admin") {
    const sameUnit =
      loan.state === req.farmerProfile.state &&
      loan.lga === req.farmerProfile.lga &&
      loan.ward === req.farmerProfile.ward &&
      loan.unit === req.farmerProfile.unit;
    if (!sameUnit) {
      return res.status(403).json({ error: "This loan isn't in your jurisdiction" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE loans SET status = 'recommended', recommended_by = $1 WHERE id = $2 RETURNING *`,
      [req.user.id, id]
    );
    await logTransition(client, id, "pending", "recommended", req.user.id, "Recommended by Unit Leader");
    await client.query("COMMIT");
    notifyFinance(rows[0]).catch(() => {});
    res.json({ loan: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not recommend loan" });
  } finally {
    client.release();
  }
}

export async function rejectLoan(req, res) {
  const { id } = req.params;
  const { reason, reapplyAfterDays = 30 } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(`SELECT status, farmer_id, reference FROM loans WHERE id = $1 FOR UPDATE`, [id]);
    const prior = before.rows[0];
    if (!prior) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Loan not found" });
    }
    if (["disbursed", "rejected"].includes(prior.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Cannot reject a loan that is already ${prior.status}` });
    }
    const { rows } = await client.query(
      `UPDATE loans
       SET status = 'rejected', rejection_reason = $1,
           reapply_after = CURRENT_DATE + ($2 || ' days')::interval
       WHERE id = $3 RETURNING *`,
      [reason || "Not specified", reapplyAfterDays, id]
    );
    await logTransition(client, id, prior.status, "rejected", req.user.id, reason || "Not specified");
    await client.query("COMMIT");
    notifyFarmerDecision(rows[0], "rejected").catch(() => {});
    res.json({ loan: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not reject loan" });
  } finally {
    client.release();
  }
}

// --- Finance Department actions (verification stage, NEW 2026-08-11) ---

export async function recommendedLoans(req, res) {
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS farmer_name, r.name AS recommended_by_name
     FROM loans l
     JOIN users u ON u.id = l.farmer_id
     LEFT JOIN users r ON r.id = l.recommended_by
     WHERE l.status = 'recommended' ORDER BY l.created_at ASC`
  );
  res.json({ loans: rows });
}

// 3EI Governance's queue — loans Finance has already verified, awaiting final approval.
export async function financeVerifiedLoans(req, res) {
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS farmer_name, r.name AS recommended_by_name
     FROM loans l
     JOIN users u ON u.id = l.farmer_id
     LEFT JOIN users r ON r.id = l.recommended_by
     WHERE l.status = 'finance_verified' ORDER BY l.created_at ASC`
  );
  res.json({ loans: rows });
}

// Finance reviews the applicant's credit status / overall financial
// involvement — reads the same auto-computed grading indices the farmer
// sees, rather than re-deriving anything by hand.
export async function financeVerifyLoan(req, res) {
  const { id } = req.params;
  const check = await pool.query(`SELECT * FROM loans WHERE id = $1`, [id]);
  const loan = check.rows[0];
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  if (loan.status !== "recommended") {
    return res.status(400).json({ error: "Only Unit-Leader-recommended loans can be Finance-verified" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE loans SET status = 'finance_verified' WHERE id = $1 RETURNING *`,
      [id]
    );
    await logTransition(client, id, "recommended", "finance_verified", req.user.id, "Financial standing verified");
    await client.query("COMMIT");
    notifyTopRank(rows[0]).catch(() => {});
    res.json({ loan: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not verify loan" });
  } finally {
    client.release();
  }
}

// The applicant's grading-indices snapshot, for Finance's review screen.
export async function loanApplicantIndices(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(`SELECT farmer_id FROM loans WHERE id = $1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Loan not found" });
  const indices = await getIndicesSnapshot(rows[0].farmer_id);
  res.json(indices);
}

// --- 3EI Governance (final approval) actions -----------------------------------

export async function approveLoan(req, res) {
  const { id } = req.params;
  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");
    const check = await client.query(`SELECT * FROM loans WHERE id = $1 AND status = 'finance_verified' FOR UPDATE`, [id]);
    if (!check.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Loan not found or not awaiting final approval" });
    }
    const { rows } = await client.query(
      `UPDATE loans SET status = 'approved' WHERE id = $1 RETURNING *`,
      [id]
    );
    await logTransition(client, id, "finance_verified", "approved", req.user.id, "Final approval granted");
    await queueLoanPayout(rows[0], client); // the money goes out by itself, in the same transaction as the approval
    await client.query("COMMIT");
    client.release(); // hand the connection back before anything else uses the pool
    released = true;
    kickPayouts();
    notifyFarmerDecision(rows[0], "approved").catch(() => {});
    res.json({ loan: rows[0] });
  } catch (err) {
    if (!released) await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not approve loan" });
  } finally {
    if (!released) client.release();
  }
}

// --- Finance Department actions ----------------------------------------

export async function awaitingDisbursement(req, res) {
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS farmer_name FROM loans l
     JOIN users u ON u.id = l.farmer_id
     WHERE l.status = 'approved' ORDER BY l.created_at ASC`
  );
  res.json({ loans: rows });
}

// Loans are paid out automatically (by Paystack transfer) once the last approval is given.
export async function disburseLoan(req, res) {
  res.status(410).json({ error: "Loans are paid out automatically after final approval. Follow the payout in Finance > Payouts." });
}

// Repayments are paid through Paystack and verified by it, so there is nothing to verify by hand.
export async function unverifiedRepayments(req, res) { res.json({ repayments: [] }); }
export async function verifyRepayment(req, res) {
  res.status(410).json({ error: "Repayments are verified automatically through Paystack." });
}

// --- Grading indices (loan-eligibility prerequisite) --------------------
// Real-time, quarter-based, stored — see indicesEngine.js. IMPORTANT: this
// is a TRANSPARENT SCORE DISPLAY only, it does NOT gate loan applications
// — index (v) has no assigned point value and there's no stated total-
// points threshold yet. Real eligibility gating still runs through the
// human pipeline above (Unit Leader -> Finance -> 3EI Governance).
export async function myEligibilityIndices(req, res) {
  const indices = await getIndicesSnapshot(req.user.id);
  res.json(indices);
}

export async function myEligibilityHistory(req, res) {
  const history = await getIndicesHistory(req.user.id);
  res.json({ history });
}
