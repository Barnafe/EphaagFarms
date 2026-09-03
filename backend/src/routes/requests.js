import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadRequestAttachment } from "../middleware/upload.js";
import * as requests from "../controllers/requestsController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/admin-users", requests.listAdminUsers);
router.post("/", uploadRequestAttachment.single("attachment"), requests.createRequest);
router.get("/mine", requests.myRequests);
router.get("/awaiting-me", requests.awaitingMyApproval);
router.get("/:id", requests.getRequest);
router.get("/:id/attachment", requests.downloadAttachment);
router.post("/:id/cancel", requests.cancelRequest);
router.post("/:id/steps/:stepId/decide", requests.decideStep);

export default router;
