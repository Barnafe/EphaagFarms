import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as production from "../controllers/productionController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

// Dashboard
router.get("/dashboard", production.dashboardSummary);

// Farms
router.get("/farms", production.listFarms);
router.post("/farms", production.createFarm);
router.patch("/farms/:id", production.updateFarm);
router.delete("/farms/:id", production.deleteFarm);

// Harvest declarations
router.get("/harvests", production.listHarvests);
router.post("/harvests", production.declareHarvest);

// Annual summary (computed from farm harvest logs)
router.get("/summary", production.annualSummary);

// Annual production declarations — the company's own official
// company-wide figure per crop/year, separate from the per-farm harvest
// logs above (see production_annual_declarations in 001_init.sql).
router.get("/declarations", production.listAnnualDeclarations);
router.post("/declarations", production.declareAnnualProduction);

export default router;
