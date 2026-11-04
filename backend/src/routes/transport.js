import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireStage } from "../middleware/purchasingRoles.js";
import { uploadDeliveryPhoto } from "../middleware/upload.js";
import * as transport from "../controllers/transportController.js";

const router = Router();
router.use(requireAuth);

// Transport Department (admin)
const admin = requireRole("admin");
router.get("/dashboard", admin, transport.dashboardSummary);
router.get("/queue", admin, transport.dispatchQueue);
router.get("/drivers", admin, transport.driverDirectory);
router.put("/drivers/:id/profile", admin, transport.saveDriverProfile);

router.get("/vehicles", admin, transport.listVehicles);
router.post("/vehicles", admin, transport.createVehicle);
router.patch("/vehicles/:id", admin, transport.updateVehicle);

router.get("/trips", admin, transport.listTrips);
router.post("/trips", admin, transport.createTrip);
router.post("/trips/:id/cancel", admin, transport.cancelTrip);
router.post("/trips/:id/rescue", admin, transport.rescueTrip);
router.post("/shipments/:id/override-delivery", admin, transport.overrideDelivery);

router.get("/costs", admin, transport.listCosts);
router.post("/costs", admin, transport.createCost);
router.post("/costs/:id/budget-decision", admin, requireStage("finance"), transport.costBudgetDecision);
router.get("/reports/fleet", admin, transport.fleetReport);

// Transporter's Room (driver)
const driver = requireRole("transporter");
router.get("/trips/me", driver, transport.myTrips);
router.post("/trips/:id/start", driver, transport.startTrip);
router.post("/trips/:id/complete", driver, transport.completeTrip);
router.post("/trips/:id/breakdown", driver, transport.reportBreakdown);
router.post("/costs/me", driver, transport.createMyCost);
router.post("/shipments/:id/deliver", driver, uploadDeliveryPhoto.single("photo"), transport.markDelivered);

export default router;
