import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFarmerRankOrAdmin } from "../middleware/farmerRank.js";
import { uploadReportProof } from "../middleware/upload.js";
import * as reports from "../controllers/profileReportController.js";

const router = Router();

router.use(requireAuth);

// Unit Leader (or admin acting as one).
router.post(
  "/",
  requireFarmerRankOrAdmin("Unit Leader"),
  uploadReportProof.single("proof"),
  reports.submitReport
);
router.get("/mine", requireFarmerRankOrAdmin("Unit Leader"), reports.myReports);

// Admin — review queue.
router.get("/admin/pending", requireRole("admin"), reports.adminPendingReports);
router.post("/admin/:id/decide", requireRole("admin"), reports.adminDecideReport);

export default router;
