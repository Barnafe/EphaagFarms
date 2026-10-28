import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as c from "../controllers/paymentsController.js";

const router = Router();

// Public, signature-checked. ONE address for every kind of Paystack payment.
router.post("/paystack-webhook", c.paystackWebhook);

router.use(requireAuth);
router.get("/status/:reference", c.paymentStatus);

// Finance (admin)
router.use("/admin", requireRole("admin"));
router.get("/admin/ledger", c.ledger);
router.get("/admin/ledger.csv", c.ledgerCsv);
router.post("/admin/ledger/:id/recorded", c.setRecorded);
router.get("/admin/flags", c.listFlags);
router.get("/admin/unfunded-commitments", c.unfundedCommitments);
router.get("/admin/settings", c.getPaymentSettings);
router.put("/admin/settings", c.updatePaymentSettings);

export default router;
