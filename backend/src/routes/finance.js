import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadProductImage } from "../middleware/upload.js";
import * as finance from "../controllers/financeController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/dashboard", finance.dashboardSummary);

router.get("/prices", finance.listPrices);
router.post("/prices", uploadProductImage.single("image"), finance.createPrice);
router.patch("/prices/:id", finance.updatePrice);
router.delete("/prices/:id", finance.deletePrice);
router.post("/prices/:id/image", uploadProductImage.single("image"), finance.uploadPriceImage);

router.get("/payments/farmers", finance.listFarmerPayments);
router.post("/payments/:id/pay", finance.markPaymentPaid);

export default router;
