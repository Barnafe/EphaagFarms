import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";
import { getIndicesSnapshot, getIndicesHistory, computeAndStoreIndices } from "../utils/indicesEngine.js";
import { getBalances as getSavingsBalances } from "./savingsController.js";

// --- Loan types & terms (2026-08-09 spec, Boost Cash sequencing corrected
// 2026-08-11, Aided loan sequencing + savings-tied amount corrected
// 2026-08-29) — see [[ephaag-farms-farmer-room-specs]] memory.
const LOAN_TERMS = {
  aided: {
    interestRate: 0,
    allowedRepaymentMonths: [5, 8, 11],
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

// --- Aided loan: sequential fixed duration by borrow count (2026-08-29) --
// "1st time borrowing... 5 months flat... 2nd time... 8 months flat...
// after repaying back all the two without default, the 3rd time loan will
// now be 11 months" — the farmer no longer picks a duration for `aided`,
// the server computes it. A prior aided loan counts toward the sequence
// once it's disbursed AND fully repaid (sum of verified repayments >= the
// loan amount) — an open/still-repaying or defaulted one does not advance
// the sequence. Stays at 11 months for the 4th and any later aided loan,
// since the spec only names three tiers.
const AIDED_MONTHS_BY_BORROW_COUNT = [5, 8, 11];

async function aidedTermsFor(farmerId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.amount, COALESCE(SUM(r.amount) FILTER (WHERE r.verified), 0) AS repaid
     FROM loans l LEFT JOIN loan_repayments r ON r.loan_id = l.id
     WHERE l.farmer_id = $1 AND l.loan_type = 'aided' AND l.status = 'disbursed'
     GROUP BY l.id, l.amount`,
    [farmerId]
  );
  const completedCount = rows.filter((r) => Number(r.repaid) >= Number(r.amount)).length;
  const tierIndex = Math.min(completedCount, AIDED_MONTHS_BY_BORROW_COUNT.length - 1);
  return {
    borrowNumber: completedCount + 1, // 1st-time, 2nd-time, 3rd-time...
    forcedRepaymentMonths: AIDED_MONTHS_BY_BORROW_COUNT[tierIndex],
  };
}

export async function myAidedLoanTerms(req, res) {
  const terms = await aidedTermsFor(req.user.id);
  res.json(terms);
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

async function notifyFederal(loan) {
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
  if (!amt || amt <= 0) return res.status(400).json({ error: "intendedLoanAmount is required" });

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

export async function adminPendingBoostDeposits(req, res) {
  const { rows } = await pool.query(
    `SELECT bcd.*, u.name AS farmer_name FROM boost_cash_deposits bcd
     JOIN users u ON u.id = bcd.farmer_id
     WHERE bcd.verified_at IS NULL ORDER BY bcd.created_at ASC`
  );
  res.json({ deposits: rows.map((d) => ({ ...mapDeposit(d), farmerName: d.farmer_name })) });
}

export async function adminVerifyBoostDeposit(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE boost_cash_deposits SET verified_at = now(), verified_by = $1
     WHERE id = $2 AND verified_at IS NULL RETURNING *`,
    [req.user.id, id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Deposit not found or already verified" });
  res.json({ deposit: mapDeposit(rows[0]) });
}

// --- Farmer actions ---------------------------------------------------

export async function applyForLoan(req, res) {
  const { loan_type, amount, repayment_months, reason, depositId } = req.body;
  if (!loan_type) return res.status(400).json({ error: "loan_type is required" });
  const terms = LOAN_TERMS[loan_type];
  if (!terms) {
    return res.status(400).json({ error: "loan_type must be 'aided', 'boost_cash', or 'business_fast_cash'" });
  }

  let loanAmount = Number(amount);
  let depositRow = null;
  let forcedMonths = null;

  // --- Aided loan: savings-tied amount + forced sequential duration ------
  // (A) requested amount can't exceed the farmer's current MAIN savings
  // balance — declined automatically, showing the savings total, if it
  // does. (B) if it's within balance, the actual loan disbursed is 2x the
  // requested amount (save 10k, request 10k -> loan is 20k). This is
  // Claude's placement of the 2026-08-29 "Loan amount" rule onto `aided`
  // specifically (it was written directly under the Aided-loan changes in
  // the request, and Boost Cash/Business fast cash already have their own
  // distinct amount mechanics) — flagged to the user, not explicitly
  // confirmed to be aided-only.
  if (loan_type === "aided") {
    if (!loanAmount || loanAmount <= 0) {
      return res.status(400).json({ error: "amount is required" });
    }
    const { mainBalance } = await getSavingsBalances(req.user.id);
    if (loanAmount > mainBalance) {
      return res.status(400).json({
        error: `You can't request more than your main savings balance of ₦${mainBalance.toLocaleString()}. Lower your requested amount to proceed.`,
        mainBalance,
      });
    }
    loanAmount = loanAmount * 2;
    const terms = await aidedTermsFor(req.user.id);
    forcedMonths = terms.forcedRepaymentMonths;
  }

  if (loan_type === "boost_cash") {
    if (!depositId) {
      return res.status(400).json({ error: "Boost Cash requires an eligible, verified deposit — declare and verify one first" });
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
  } else if (!loanAmount) {
    return res.status(400).json({ error: "amount is required" });
  }

  // Aided's duration is never a farmer choice — it's forced by borrow
  // sequence (computed above), ignoring whatever the client sent.
  const months = loan_type === "aided" ? forcedMonths : Number(repayment_months) || terms.allowedRepaymentMonths[0];
  if (loan_type !== "aided" && !terms.allowedRepaymentMonths.includes(months)) {
    return res.status(400).json({
      error: `${loan_type} repayment duration must be one of: ${terms.allowedRepaymentMonths.join(", ")} months`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = generateReference(REF_PREFIX.loan);
    const { rows } = await client.query(
      `INSERT INTO loans
         (reference, farmer_id, loan_type, interest_rate, amount, requested_amount, repayment_months, reason,
          deposit_required, deposit_paid_at, deposit_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        reference,
        req.user.id,
        loan_type,
        terms.interestRate,
        loanAmount,
        loan_type === "aided" ? Number(amount) : null,
        months,
        reason || null,
        depositRow ? Number(depositRow.deposit_amount) : null,
        depositRow ? depositRow.paid_at : null,
        !!depositRow, // already verified before the loan existed
      ]
    );
    const loan = rows[0];
    if (depositRow) {
      await client.query(`UPDATE boost_cash_deposits SET used_for_loan_id = $1 WHERE id = $2`, [loan.id, depositRow.id]);
    }
    await logTransition(client, loan.id, null, "pending", req.user.id, "Application submitted");
    await client.query("COMMIT");
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
  res.json({ loans: rows });
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
  const { loanId } = req.params;
  const { amount, method } = req.body;
  if (!amount) return res.status(400).json({ error: "amount is required" });

  const loan = await pool.query("SELECT * FROM loans WHERE id = $1 AND farmer_id = $2", [
    loanId,
    req.user.id,
  ]);
  if (!loan.rows[0]) return res.status(404).json({ error: "Loan not found" });
  if (loan.rows[0].status !== "disbursed") {
    return res.status(400).json({ error: "This loan isn't active yet" });
  }

  const { rows } = await pool.query(
    `INSERT INTO loan_repayments (loan_id, amount, method) VALUES ($1, $2, $3) RETURNING *`,
    [loanId, amount, method || null]
  );
  res.status(201).json({ repayment: rows[0] });
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

// Federal's queue — loans Finance has already verified, awaiting final approval.
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
    notifyFederal(rows[0]).catch(() => {});
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

// --- Federal (final approval) actions -----------------------------------

export async function approveLoan(req, res) {
  const { id } = req.params;
  const client = await pool.connect();
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
    await client.query("COMMIT");
    notifyFinanceClearToDisburse(rows[0]).catch(() => {});
    notifyFarmerDecision(rows[0], "approved").catch(() => {});
    res.json({ loan: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not approve loan" });
  } finally {
    client.release();
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

export async function disburseLoan(req, res) {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const check = await client.query(`SELECT * FROM loans WHERE id = $1 AND status = 'approved' FOR UPDATE`, [id]);
    const loan = check.rows[0];
    if (!loan) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Loan not found or not awaiting disbursement" });
    }
    if (loan.loan_type === "boost_cash" && !loan.deposit_verified) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Boost Cash loans require the 25% upfront deposit to be verified before disbursement",
      });
    }
    const { rows } = await client.query(
      `UPDATE loans SET status = 'disbursed' WHERE id = $1 RETURNING *`,
      [id]
    );
    await logTransition(client, id, "approved", "disbursed", req.user.id, "Funds disbursed");
    await client.query("COMMIT");
    res.json({ loan: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not disburse loan" });
  } finally {
    client.release();
  }
}

export async function unverifiedRepayments(req, res) {
  const { rows } = await pool.query(
    `SELECT r.*, l.reference AS loan_reference, u.name AS farmer_name
     FROM loan_repayments r
     JOIN loans l ON l.id = r.loan_id
     JOIN users u ON u.id = l.farmer_id
     WHERE r.verified = FALSE ORDER BY r.paid_at ASC`
  );
  res.json({ repayments: rows });
}

export async function verifyRepayment(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE loan_repayments SET verified = TRUE WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Repayment not found" });

  // Real-time indices recompute (2026-08-11 spec) — fire-and-forget.
  const { rows: loanRows } = await pool.query(`SELECT farmer_id FROM loans WHERE id = $1`, [rows[0].loan_id]);
  if (loanRows[0]) {
    computeAndStoreIndices(loanRows[0].farmer_id).catch((err) => console.error("indices recompute failed", err));
  }
  res.json({ repayment: rows[0] });
}

// --- Grading indices (loan-eligibility prerequisite) --------------------
// Real-time, quarter-based, stored — see indicesEngine.js. IMPORTANT: this
// is a TRANSPARENT SCORE DISPLAY only, it does NOT gate loan applications
// — index (v) has no assigned point value and there's no stated total-
// points threshold yet. Real eligibility gating still runs through the
// human pipeline above (Unit Leader -> Finance -> Federal).
export async function myEligibilityIndices(req, res) {
  const indices = await getIndicesSnapshot(req.user.id);
  res.json(indices);
}

export async function myEligibilityHistory(req, res) {
  const history = await getIndicesHistory(req.user.id);
  res.json({ history });
}
