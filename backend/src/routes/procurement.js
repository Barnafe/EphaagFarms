import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as procurement from "../controllers/procurementController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/queue", procurement.sourcingQueue);
router.get("/farmers", procurement.farmerDirectory);
router.get("/farmers/:farmerId/products", procurement.farmerAvailableProducts);
router.post("/orders/:id/source", procurement.sourceOrder);

router.get("/sourced", procurement.assignmentQueue);
router.get("/processors", procurement.processorDirectory);
router.post("/orders/:id/assign-processor", procurement.assignProcessor);

export default router;
