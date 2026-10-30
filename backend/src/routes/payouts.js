import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as payouts from "../controllers/payoutsController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.get("/", payouts.list);
router.get("/settings", payouts.getSettings);
router.put("/settings", payouts.putSettings);
router.post("/run", payouts.runNow);
router.post("/:id/retry", payouts.retry);
export default router;
