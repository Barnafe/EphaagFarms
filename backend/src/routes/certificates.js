import { Router } from "../utils/asyncRouter.js";
import { verifyCertificate } from "../controllers/corperCertificateController.js";

// Public (no login): confirm a certificate is genuine. Shows only the
// holder's name, batch and issue date.
const router = Router();
router.get("/verify/:code", verifyCertificate);
export default router;
