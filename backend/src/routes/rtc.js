import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadCourseMaterial } from "../middleware/upload.js";
import * as rtc from "../controllers/rtcController.js";

const router = Router();

router.use(requireAuth);

// Admin (TRC department) — Training: upload + approve training courses.
// This is also exactly what farmers see in their own Farmer's Room tab
// (labeled "Seminar" there) — same endpoints, same data, just a
// narrower farmer-facing label on the same underlying feature.
router.get("/admin/dashboard", requireRole("admin"), rtc.dashboardSummary);
router.get("/admin/courses", requireRole("admin"), rtc.adminListCourses);
router.post("/admin/courses", requireRole("admin"), uploadCourseMaterial.single("material"), rtc.adminCreateCourse);
router.post("/admin/courses/:id/approve", requireRole("admin"), rtc.adminApproveCourse);

// Admin (TRC department) — Research: publish/manage research write-ups
router.get("/admin/research", requireRole("admin"), rtc.adminListResearch);
router.post("/admin/research", requireRole("admin"), rtc.adminCreateResearch);
router.delete("/admin/research/:id", requireRole("admin"), rtc.adminDeleteResearch);

// Admin (TRC department) — Consultancy: offerings + incoming requests
router.get("/admin/consultancy/offerings", requireRole("admin"), rtc.adminListConsultancyOfferings);
router.post("/admin/consultancy/offerings", requireRole("admin"), rtc.adminCreateConsultancyOffering);
router.delete("/admin/consultancy/offerings/:id", requireRole("admin"), rtc.adminDeleteConsultancyOffering);
router.get("/admin/consultancy/requests", requireRole("admin"), rtc.adminListConsultancyRequests);
router.post("/admin/consultancy/requests/:id/status", requireRole("admin"), rtc.adminUpdateConsultancyRequestStatus);

// Member (farmer) — browse + complete approved courses, always free
router.get("/courses", requireRole("farmer"), rtc.myCourses);
router.post("/courses/:id/complete", requireRole("farmer"), rtc.completeCourse);

// Member (farmer) — browse research, request/track consultancy
router.get("/research", requireRole("farmer"), rtc.listResearch);
router.get("/consultancy/offerings", requireRole("farmer"), rtc.listConsultancyOfferings);
router.post("/consultancy/requests", requireRole("farmer"), rtc.submitConsultancyRequest);
router.get("/consultancy/requests/me", requireRole("farmer"), rtc.myConsultancyRequests);

// Shared — download a course's materials (admin can preview pending ones)
router.get("/courses/:id/material", rtc.downloadMaterial);

export default router;
