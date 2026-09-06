import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFarmerRankOrAdmin } from "../middleware/farmerRank.js";
import * as units from "../controllers/unitController.js";

const router = Router();

router.use(requireAuth);

// Unit Leader (or admin acting as one) — propose a new unit / see their own.
router.post("/", requireFarmerRankOrAdmin("Unit Leader"), units.proposeUnit);
router.get("/mine", requireFarmerRankOrAdmin("Unit Leader"), units.myUnits);

// Admin — review queue.
router.get("/admin/pending", requireRole("admin"), units.adminPendingUnits);
router.post("/admin/:id/decide", requireRole("admin"), units.adminDecideUnit);

export default router;
