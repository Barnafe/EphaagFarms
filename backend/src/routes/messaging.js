import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sesEvents, listMessages, resendMessage, removeSuppression, testSend, templatesList, templatePreview } from "../controllers/messagingController.js";

const router = Router();
router.post("/ses-events", sesEvents); // public, signature-checked
router.use(requireAuth, requireRole("admin"));
router.get("/", listMessages);
router.post("/test-send", testSend);
router.get("/templates", templatesList);
router.get("/templates/:name/preview", templatePreview);
router.post("/:id/resend", resendMessage);
router.delete("/suppressions/:address", removeSuppression);
export default router;
