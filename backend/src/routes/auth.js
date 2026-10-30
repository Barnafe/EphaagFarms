import { Router } from "../utils/asyncRouter.js";
import {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  uploadProfilePhoto,
  referralLookup,
  logoutAll,
  changePassword,
} from "../controllers/authController.js";
import { verifyNinPublic } from "../controllers/farmerIdentityController.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadPhoto } from "../middleware/upload.js";
import { loginLimiter, registerLimiter, ninLimiter, forgotPasswordLimiter, resetPasswordLimiter } from "../middleware/rateLimits.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/verify-nin", ninLimiter, verifyNinPublic);
router.get("/referral-lookup", referralLookup);
router.post("/login", loginLimiter, login);
router.get("/me", requireAuth, me);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);
router.post("/logout-all", requireAuth, logoutAll);
router.post("/change-password", requireAuth, changePassword);
router.post("/me/photo", requireAuth, uploadPhoto.single("photo"), uploadProfilePhoto);

export default router;
