import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadAgreement } from "../middleware/upload.js";
import * as investments from "../controllers/investmentController.js";

const router = Router();

router.use(requireAuth);

// Investor (Boys' Quarters)
router.post("/apply", requireRole("investor"), investments.apply);
router.get("/me", requireRole("investor"), investments.myApplication);
router.get("/me/payments", requireRole("investor"), investments.myPayments);
router.post("/me/payments", requireRole("investor"), investments.logPayment);
router.get("/me/roi", requireRole("investor"), investments.myRoi);
router.get("/me/referral", requireRole("investor"), investments.myReferral);
router.post(
  "/applications/:id/agreement",
  requireRole("investor"),
  uploadAgreement.single("file"),
  investments.uploadSignedAgreement
);

// Finance (admin)
router.get("/applications", requireRole("admin"), investments.listApplications);
router.post("/applications/:id/decide", requireRole("admin"), investments.decideApplication);
router.get("/applications/:id/agreement", requireRole("admin"), investments.downloadAgreement);
router.get("/partner-reviews", requireRole("admin"), investments.partnerReviews);
router.post("/partner-reviews/:investorId/approve", requireRole("admin"), investments.approvePartner);
router.get("/roi-payouts", requireRole("admin"), investments.roiPayouts);
router.post("/roi-payouts/:id/approve", requireRole("admin"), investments.approveRoiPayout);
router.post("/admin/run-reminder-check", requireRole("admin"), investments.runReminderCheckNow);

export default router;
