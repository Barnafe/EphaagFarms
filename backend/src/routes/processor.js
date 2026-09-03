import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as processor from "../controllers/processorController.js";

const router = Router();

router.use(requireAuth, requireRole("processor"));

router.get("/jobs/me", processor.myJobs);
router.post("/jobs/:id/advance", processor.advanceJob);

export default router;
