import { Router } from "../utils/asyncRouter.js";
import {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  uploadProfilePhoto,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadPhoto } from "../middleware/upload.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/me/photo", requireAuth, uploadPhoto.single("photo"), uploadProfilePhoto);

export default router;
