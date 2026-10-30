import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as processor from "../controllers/processorController.js";

const router = Router();

// Processing jobs are worked by Buyers/Processor accounts (role_type "buyer").
// "processor" is kept only so a not-yet-converted legacy account still works.
router.use(requireAuth, requireRole("buyer", "processor"));

router.get("/jobs/me", processor.myJobs);
router.post("/jobs/:id/advance", processor.advanceJob);

export default router;
