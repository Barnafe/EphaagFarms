import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as analytics from "../controllers/analyticsController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/overview", analytics.overview);
router.get("/farmers", analytics.farmerDemographics);
router.get("/produce", analytics.produceDeclarations);
router.get("/produce/capacity", analytics.produceCapacityQuery);
router.get("/loans", analytics.loanAnalytics);
router.get("/savings", analytics.savingsAnalytics);
router.get("/training", analytics.trainingAnalytics);

export default router;
