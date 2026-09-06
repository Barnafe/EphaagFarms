import { Router } from "../utils/asyncRouter.js";
import { requireAuth } from "../middleware/auth.js";
import { myReferrals } from "../controllers/referralController.js";

const router = Router();

router.use(requireAuth);

router.get("/me", myReferrals);

export default router;
