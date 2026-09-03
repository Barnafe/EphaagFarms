import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFarmerRankOrAdmin } from "../middleware/farmerRank.js";
import { uploadSheet } from "../middleware/upload.js";
import * as farmers from "../controllers/farmerController.js";
import * as savings from "../controllers/savingsController.js";
import * as shares from "../controllers/farmerSharesController.js";

const router = Router();

router.use(requireAuth);

// Farmer-only
router.put("/me", requireRole("farmer"), farmers.updateMyProfile);

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
router.post("/me/savings/withdraw", requireRole("farmer"), savings.requestWithdrawal);

router.get("/me/ranking", requireRole("farmer"), farmers.myRanking);
router.get("/me/jurisdiction-report", requireRole("farmer", "admin"), farmers.myJurisdictionReport);
router.get("/company-growth", farmers.companyGrowth);

router.get("/me/shares", requireRole("farmer"), shares.myShares);
router.post("/me/shares", requireRole("farmer"), shares.buyShare);
router.post("/me/shares/:id/withdraw-interest", requireRole("farmer"), shares.withdrawInterest);
router.post("/me/shares/:id/withdraw-capital", requireRole("farmer"), shares.withdrawCapital);

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

// Admin
router.get("/admin/savings", requireRole("admin"), savings.adminListSavings);
router.post("/admin/savings/withdrawals/:id/decide", requireRole("admin"), savings.adminDecideWithdrawal);
router.post("/admin/savings/insurance-apply", requireRole("admin"), savings.adminApplyInsurance);
router.get("/admin/ranking", requireRole("admin"), farmers.adminListRanking);
router.get("/admin/feedback", requireRole("admin"), farmers.adminListFeedback);
router.post("/admin/feedback/:id/review", requireRole("admin"), farmers.adminMarkFeedbackReviewed);

export default router;
