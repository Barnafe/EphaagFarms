import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as orders from "../controllers/orderController.js";

const router = Router();

router.use(requireAuth);

router.get("/catalog", requireRole("buyer"), orders.catalog);
router.post("/", requireRole("buyer"), orders.placeOrder);
router.get("/me", requireRole("buyer"), orders.myOrders);
router.post("/commitment", requireRole("buyer"), orders.setStandingCommitment);

// Finance (admin) — payment confirmation gates Procurement
router.get("/pending-confirmation", requireRole("admin"), orders.pendingConfirmation);
router.post("/:id/confirm-payment", requireRole("admin"), orders.confirmPayment);

export default router;
