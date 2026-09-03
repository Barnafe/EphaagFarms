import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as positions from "../controllers/adminPositionsController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/farmers/search", positions.searchFarmers);
router.post("/farmers/:userId/promote", positions.promoteFarmerRank);
router.post("/farmers/:userId/demote", positions.demoteFarmerRank);

router.get("/hods", positions.listAdminsForHod);
router.post("/hods/:userId/promote", positions.promoteHod);
router.post("/hods/:userId/demote", positions.demoteHod);

router.get("/history", positions.appointmentHistory);

export default router;
