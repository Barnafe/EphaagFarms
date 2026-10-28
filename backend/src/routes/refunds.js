import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as c from "../controllers/refundController.js";

// The Refund room. Any admin may use it.
const router = Router();
router.use(requireAuth, requireRole("admin"));
router.get("/attention", c.attention);
router.get("/history", c.history);
router.get("/search", c.search);
router.post("/:id", c.refund);
export default router;
