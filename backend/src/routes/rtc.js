import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadCourseMaterial } from "../middleware/upload.js";
import * as rtc from "../controllers/rtcController.js";

const router = Router();

router.use(requireAuth);

// Admin (Seminal department) — upload + approve training courses
router.get("/admin/courses", requireRole("admin"), rtc.adminListCourses);
router.post("/admin/courses", requireRole("admin"), uploadCourseMaterial.single("material"), rtc.adminCreateCourse);
router.post("/admin/courses/:id/approve", requireRole("admin"), rtc.adminApproveCourse);

// Member (farmer) — browse + complete approved courses, always free
router.get("/courses", requireRole("farmer"), rtc.myCourses);
router.post("/courses/:id/complete", requireRole("farmer"), rtc.completeCourse);

// Shared — download a course's materials (admin can preview pending ones)
router.get("/courses/:id/material", rtc.downloadMaterial);

export default router;
