import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as purchasing from "../controllers/purchasingController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

// Suppliers
router.get("/suppliers", purchasing.listSuppliers);
router.post("/suppliers", purchasing.createSupplier);
router.patch("/suppliers/:id", purchasing.updateSupplier);

// Purchase requests — full pipeline
router.get("/requests", purchasing.listRequests);
router.get("/requests/:id", purchasing.getRequest);
router.post("/requests", purchasing.createRequest);

router.post("/requests/:id/approve", purchasing.approveRequest);
router.post("/requests/:id/reject", purchasing.rejectRequest);
router.post("/requests/:id/cancel", purchasing.cancelRequest);

router.post("/requests/:id/quotations", purchasing.addQuotation);
router.post("/requests/:id/select-supplier", purchasing.selectSupplier);
router.post("/requests/:id/purchase-order", purchasing.createPurchaseOrder);

router.post("/purchase-orders/:id/decide", purchasing.decidePurchaseOrder);

router.post("/requests/:id/authorize-payment", purchasing.authorizeInitialPayment);
router.post("/requests/:id/mark-delivered", purchasing.markDelivered);
router.post("/requests/:id/verify-goods", purchasing.verifyGoods);
router.post("/requests/:id/resolve-dispute", purchasing.resolveDispute);
router.post("/requests/:id/invoice", purchasing.recordInvoice);
router.post("/requests/:id/verify-invoice", purchasing.verifyInvoice);
router.post("/requests/:id/final-payment", purchasing.recordFinalPayment);

export default router;
