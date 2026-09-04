import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as contact from "../controllers/contactController.js";

const router = Router();

// Public — no auth required, this is the site's contact form.
router.post("/", contact.submitContactMessage);

// Admin — view + review submitted messages.
router.get("/admin", requireAuth, requireRole("admin"), contact.adminListContactMessages);
router.post("/admin/:id/review", requireAuth, requireRole("admin"), contact.adminMarkContactMessageReviewed);

export default router;
