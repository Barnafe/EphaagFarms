import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as purchasing from "../controllers/purchasingController.js";
import { requireStage } from "../middleware/purchasingRoles.js";
import { uploadPurchasingFile } from "../middleware/upload.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

// Who am I in the purchasing pipeline?
router.get("/me", purchasing.myPurchasingRole);

// Suppliers (Procurement)
router.get("/suppliers", purchasing.listSuppliers);
router.post("/suppliers", requireStage("procurement"), purchasing.createSupplier);
router.patch("/suppliers/:id", requireStage("procurement"), purchasing.updateSupplier);

// Annual department budgets: anyone in admin can see them, Finance sets them.
router.get("/budgets", purchasing.listBudgets);
router.put("/budgets/:department", requireStage("finance"), purchasing.setBudget);

// Purchase requests. Each approval stage belongs to one role: Procurement, Finance or CEO.
router.get("/requests", purchasing.listRequests);
router.get("/requests/:id", purchasing.getRequest);
router.post("/requests", purchasing.createRequest);

router.post("/requests/:id/approve", requireStage("procurement"), purchasing.approveRequest);
router.post("/requests/:id/reject", requireStage("procurement"), purchasing.rejectRequest);
router.post("/requests/:id/cancel", requireStage("procurement"), purchasing.cancelRequest);

router.post("/requests/:id/quotations", requireStage("procurement"), uploadPurchasingFile.single("file"), purchasing.addQuotation);
router.post("/requests/:id/quotations/:qid/attachment", requireStage("procurement"), uploadPurchasingFile.single("file"), purchasing.attachQuotationFile);
router.get("/requests/:id/quotations/:qid/file", purchasing.downloadQuotationFile);
router.post("/requests/:id/select-supplier", requireStage("procurement"), purchasing.selectSupplier);
router.post("/requests/:id/purchase-order", requireStage("procurement"), purchasing.createPurchaseOrder);

router.post("/requests/:id/budget-decision", requireStage("finance"), purchasing.budgetDecision);
router.post("/purchase-orders/:id/decide", requireStage("ceo"), purchasing.decidePurchaseOrder);

router.post("/requests/:id/authorize-payment", requireStage("finance"), purchasing.authorizeInitialPayment);
router.post("/requests/:id/mark-delivered", requireStage("procurement"), purchasing.markDelivered);
router.post("/requests/:id/verify-goods", requireStage("procurement"), purchasing.verifyGoods);
router.post("/requests/:id/resolve-dispute", requireStage("procurement"), purchasing.resolveDispute);
router.post("/requests/:id/invoice", requireStage("procurement"), uploadPurchasingFile.single("file"), purchasing.recordInvoice);
router.post("/requests/:id/invoice/attachment", requireStage("procurement"), uploadPurchasingFile.single("file"), purchasing.attachInvoiceFile);
router.get("/requests/:id/invoice/file", purchasing.downloadInvoiceFile);
router.post("/requests/:id/verify-invoice", requireStage("finance"), purchasing.verifyInvoice);
router.post("/requests/:id/final-payment", requireStage("finance"), purchasing.recordFinalPayment);

export default router;
