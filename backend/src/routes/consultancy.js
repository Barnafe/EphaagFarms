import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { publicBookingLimiter } from "../middleware/rateLimits.js";
import * as c from "../controllers/consultancyController.js";

const router = Router();

// Public: anyone can see the services, apply, follow a request with their private link, and pay once it is approved.
router.get("/offerings", c.listOfferings);
router.post("/requests", publicBookingLimiter, c.submitRequest);
router.get("/track/:token", c.trackRequest);
router.post("/track/:token/pay", c.payRequest);

// A signed-in member's own requests
router.get("/requests/me", requireAuth, c.myRequests);

// Admin (TRC): decide, schedule, complete
router.get("/admin/requests", requireAuth, requireRole("admin"), c.adminList);
router.post("/admin/requests/:id/approve", requireAuth, requireRole("admin"), c.adminApprove);
router.post("/admin/requests/:id/reject", requireAuth, requireRole("admin"), c.adminReject);
router.post("/admin/requests/:id/cancel", requireAuth, requireRole("admin"), c.adminCancel);
router.post("/admin/requests/:id/schedule", requireAuth, requireRole("admin"), c.adminSchedule);
router.post("/admin/requests/:id/complete", requireAuth, requireRole("admin"), c.adminComplete);

export default router;
