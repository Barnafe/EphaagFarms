import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFarmerRankOrAdmin } from "../middleware/farmerRank.js";
import { uploadSheet } from "../middleware/upload.js";
import * as farmers from "../controllers/farmerController.js";
import * as savings from "../controllers/savingsController.js";
import * as shares from "../controllers/farmerSharesController.js";
import { requireVerifiedFarmer } from "../services/farmerIdentity.js";
import * as identity from "../controllers/farmerIdentityController.js";

const router = Router();

router.use(requireAuth);

// Farmer-only
router.put("/me", requireRole("farmer"), identity.updateMyProfile);
router.put("/me/residence", requireRole("farmer"), identity.changeResidence);
router.post("/me/verify-nin", requireRole("farmer"), identity.verifyMyNin);
router.get("/me/profile-status", requireRole("farmer"), identity.myProfileStatus);
router.get("/admin/identity-settings", requireRole("admin"), identity.adminIdentitySettings);
router.put("/admin/identity-settings", requireRole("admin"), identity.adminSetIdentitySettings);

router.get("/me/products", requireRole("farmer"), farmers.listMyProducts);
router.post("/me/products", requireRole("farmer"), farmers.createMyProduct);
router.patch("/me/products/:id", requireRole("farmer"), farmers.updateMyProduct);
router.delete("/me/products/:id", requireRole("farmer"), farmers.deleteMyProduct);

router.get("/me/declarations", requireRole("farmer"), farmers.listMyDeclarations);
router.post("/me/declarations", requireRole("farmer"), farmers.createMyDeclaration);
router.get("/me/declared-balances", requireRole("farmer"), farmers.myDeclaredBalances);
router.get("/prices", requireRole("farmer"), farmers.myVisiblePrices);

router.get("/me/transactions", requireRole("farmer"), farmers.myTransactions);

router.get("/me/savings", requireRole("farmer"), savings.mySavings);
router.post("/me/savings/deposit", requireRole("farmer"), savings.deposit);
router.post("/me/savings/withdraw", requireRole("farmer"), requireVerifiedFarmer, savings.requestWithdrawal);

router.get("/me/ranking", requireRole("farmer"), farmers.myRanking);
router.get("/me/jurisdiction-report", requireRole("farmer", "admin"), farmers.myJurisdictionReport);
router.get("/company-growth", farmers.companyGrowth);

router.get("/shares/terms", requireRole("farmer"), shares.shareTerms);
router.get("/me/shares", requireRole("farmer"), shares.myShares);
router.get("/me/shares/:id", requireRole("farmer"), shares.shareDetail);
// Buying: checkout (creates a pending purchase) -> pay -> verify (the
// system confirms the payment, creates one separate share per unit bought).
// There is deliberately no direct "create a share" endpoint any more.
router.post("/me/shares/checkout", requireRole("farmer"), requireVerifiedFarmer, shares.checkout);
router.get("/shares/quote", requireRole("farmer"), shares.quote);
router.post("/me/shares/purchases/:reference/verify", requireRole("farmer"), shares.verifyPurchase);
router.post("/me/shares/purchases/:reference/pay", requireRole("farmer"), shares.payPurchase);
router.post("/me/shares/purchases/:reference/cancel", requireRole("farmer"), shares.cancelPurchase);
router.post("/me/shares/:id/withdraw-interest", requireRole("farmer"), requireVerifiedFarmer, shares.withdrawInterest);
router.post("/me/shares/:id/withdraw-capital", requireRole("farmer"), requireVerifiedFarmer, shares.withdrawCapital);

router.get("/me/feedback", requireRole("farmer"), farmers.listMyFeedback);
router.post("/me/feedback", requireRole("farmer"), farmers.submitFeedback);

router.get(
  "/jurisdiction",
  requireFarmerRankOrAdmin("Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"),
  farmers.jurisdictionOverview
);

router.post(
  "/attendance",
  requireFarmerRankOrAdmin("Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"),
  uploadSheet.single("sheet"),
  farmers.recordAttendance
);
router.get(
  "/attendance/history",
  requireFarmerRankOrAdmin("Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"),
  farmers.attendanceHistory
);
router.get(
  "/jurisdiction/:id",
  requireFarmerRankOrAdmin("Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"),
  farmers.jurisdictionFarmerProfile
);
router.get("/attendance/me", requireRole("farmer"), farmers.myAttendanceRecord);

// Admin
router.get("/admin/savings", requireRole("admin"), savings.adminListSavings);
router.post("/admin/savings/withdrawals/:id/decide", requireRole("admin"), savings.adminDecideWithdrawal);
router.post("/admin/savings/insurance-apply", requireRole("admin"), savings.adminApplyInsurance);
router.get("/admin/ranking", requireRole("admin"), farmers.adminListRanking);
router.get("/admin/feedback", requireRole("admin"), farmers.adminListFeedback);
router.post("/admin/feedback/:id/review", requireRole("admin"), farmers.adminMarkFeedbackReviewed);

export default router;
