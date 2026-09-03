import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as transport from "../controllers/transportController.js";

const router = Router();
router.use(requireAuth);

// Transport Department (admin)
router.get("/queue", requireRole("admin"), transport.dispatchQueue);
router.get("/drivers", requireRole("admin"), transport.driverDirectory);
router.post("/orders/:id/assign-driver", requireRole("admin"), transport.assignDriver);

// Transporter's Room (driver)
router.get("/shipments/me", requireRole("transporter"), transport.myShipments);
router.post("/shipments/:id/pickup", requireRole("transporter"), transport.markPickedUp);
router.post("/shipments/:id/deliver", requireRole("transporter"), transport.markDelivered);

export default router;
