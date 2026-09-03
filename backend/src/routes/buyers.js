import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as buyers from "../controllers/buyerController.js";

const router = Router();

router.use(requireAuth);

router.put("/me", requireRole("buyer"), buyers.updateMyProfile);

// Admin: full buyer directory (same visibility model as the farmer registry).
router.get("/admin", requireRole("admin"), buyers.adminListBuyers);

export default router;
