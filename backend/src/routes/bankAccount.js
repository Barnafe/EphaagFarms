import { Router } from "../utils/asyncRouter.js";
import { requireAuth } from "../middleware/auth.js";
import * as bank from "../controllers/bankAccountController.js";

const router = Router();
router.use(requireAuth);
router.get("/", bank.mine);
router.get("/banks", bank.banks);
router.post("/", bank.save);
export default router;
