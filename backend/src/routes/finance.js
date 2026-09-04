import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as finance from "../controllers/financeController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/prices", finance.listPrices);
router.post("/prices", finance.createPrice);
router.patch("/prices/:id", finance.updatePrice);

router.get("/payments/farmers", finance.listFarmerPayments);
router.post("/payments/:id/pay", finance.markPaymentPaid);

export default router;
