import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFarmerRankOrAdmin } from "../middleware/farmerRank.js";
import * as loans from "../controllers/loanController.js";

const router = Router();

router.use(requireAuth);

// Farmer — Boost Cash deposits (declared before any loan application exists)
router.post("/boost-deposits", requireRole("farmer"), loans.declareBoostDeposit);
router.get("/boost-deposits/me", requireRole("farmer"), loans.myBoostDeposits);

// Farmer — apply, view own, log repayments
router.post("/", requireRole("farmer"), loans.applyForLoan);
router.get("/me", requireRole("farmer"), loans.myLoans);
router.get("/me/eligibility", requireRole("farmer"), loans.myEligibilityIndices);
router.get("/me/aided-terms", requireRole("farmer"), loans.myAidedLoanTerms);
router.get("/me/eligibility/history", requireRole("farmer"), loans.myEligibilityHistory);
router.get("/:loanId/repayments", requireRole("farmer"), loans.myLoanRepayments);
router.post("/:loanId/repayments", requireRole("farmer"), loans.logRepayment);
router.get("/:loanId/history", requireRole("farmer"), loans.myLoanHistory);

// Unit Leader — recommend/reject. Admin bypasses the jurisdiction check
// entirely (company-wide) — see requireFarmerRankOrAdmin and the
// controller-side admin branches in pendingForMyUnit/recommendLoan.
router.get("/pending/my-unit", requireFarmerRankOrAdmin("Unit Leader"), loans.pendingForMyUnit);
router.post("/:id/recommend", requireFarmerRankOrAdmin("Unit Leader"), loans.recommendLoan);
router.post("/:id/reject", requireFarmerRankOrAdmin("Unit Leader", "Federal"), loans.rejectLoan);

// Federal — final approval (also admin, same pattern)
router.get("/recommended", requireFarmerRankOrAdmin("Federal"), loans.financeVerifiedLoans);
router.post("/:id/approve", requireFarmerRankOrAdmin("Federal"), loans.approveLoan);

// Finance Department (admin) — verification stage (NEW 2026-08-11, sits
// between Unit Leader recommend and Federal final approval), disbursement,
// repayment reconciliation, Boost Cash deposit verification
router.get("/finance-review", requireRole("admin"), loans.recommendedLoans);
router.post("/:id/finance-verify", requireRole("admin"), loans.financeVerifyLoan);
// Used by Unit Leader review and Federal approval (both farmer ranks) as
// well as admin/Finance — same access pattern as recommend/reject/approve
// above, not admin-only like the rest of this Finance block.
router.get("/:id/applicant-indices", requireFarmerRankOrAdmin("Unit Leader", "Federal"), loans.loanApplicantIndices);
router.get("/awaiting-disbursement", requireRole("admin"), loans.awaitingDisbursement);
router.post("/:id/disburse", requireRole("admin"), loans.disburseLoan);
router.get("/boost-deposits/pending", requireRole("admin"), loans.adminPendingBoostDeposits);
router.post("/boost-deposits/:id/verify", requireRole("admin"), loans.adminVerifyBoostDeposit);
router.get("/repayments/unverified", requireRole("admin"), loans.unverifiedRepayments);
router.post("/repayments/:id/verify", requireRole("admin"), loans.verifyRepayment);

export default router;
