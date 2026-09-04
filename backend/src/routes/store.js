import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as store from "../controllers/storeController.js";

const router = Router();
router.use(requireAuth);

// Store Department (admin) — inventory
router.get("/inventory", requireRole("admin"), store.inventory);
router.patch("/inventory/:id/reorder-level", requireRole("admin"), store.updateReorderLevel);
router.get("/movements", requireRole("admin"), store.stockMovementHistory);

// Store Department (admin) — receiving
router.get("/receiving-queue", requireRole("admin"), store.receivingQueue);
router.post("/orders/:id/receive", requireRole("admin"), store.receiveOrder);

// Store Department (admin) — orders: audit + allocate
router.get("/queue", requireRole("admin"), store.allocationQueue);
router.get("/distributors", requireRole("admin"), store.distributorDirectory);
router.post("/orders/:id/audit", requireRole("admin"), store.auditOrder);
router.post("/orders/:id/allocate", requireRole("admin"), store.allocate);

// Store Department (admin) — restock requests
router.post("/restock-requests", requireRole("admin"), store.createRestockRequest);

// Store Department (admin) — Production's declared company harvests
router.get("/production-queue", requireRole("admin"), store.productionReceivingQueue);
router.post("/production-harvests/:id/receive", requireRole("admin"), store.receiveProductionHarvest);

// Store Room (distributor)
router.get("/allocations/me", requireRole("distributor"), store.myAllocations);
router.post("/allocations/:id/confirm", requireRole("distributor"), store.confirmAllocation);

export default router;
