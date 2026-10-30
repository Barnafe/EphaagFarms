import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFarmerRankOrAdmin } from "../middleware/farmerRank.js";
import * as units from "../controllers/unitController.js";
import * as catalog from "../controllers/unitCatalogController.js";

const router = Router();

router.use(requireAuth);

// Unit Leader (or admin acting as one) — propose a new unit / see their own.
router.post("/", requireFarmerRankOrAdmin("Unit Leader"), units.proposeUnit);
router.get("/mine", requireFarmerRankOrAdmin("Unit Leader"), units.myUnits);

// Official units and their locations (used to place a farmer by their address).
router.get("/catalog", requireRole("admin"), catalog.listCatalog);
router.post("/catalog", requireRole("admin"), catalog.createCatalogUnit);
router.put("/catalog/:id", requireRole("admin"), catalog.updateCatalogUnit);
router.get("/mine/location", requireFarmerRankOrAdmin("Unit Leader"), catalog.getMyUnitLocation);
router.put("/mine/location", requireFarmerRankOrAdmin("Unit Leader"), catalog.setMyUnitLocation);

// Admin — review queue.
router.get("/admin/pending", requireRole("admin"), units.adminPendingUnits);
router.post("/admin/:id/decide", requireRole("admin"), units.adminDecideUnit);

export default router;
