import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as production from "../controllers/productionController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

// Farms
router.get("/farms", production.listFarms);
router.post("/farms", production.createFarm);
router.patch("/farms/:id", production.updateFarm);
router.delete("/farms/:id", production.deleteFarm);

// Harvest declarations
router.get("/harvests", production.listHarvests);
router.post("/harvests", production.declareHarvest);

// Annual summary
router.get("/summary", production.annualSummary);

export default router;
