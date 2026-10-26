import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadCourseMaterial } from "../middleware/upload.js";
import * as rtc from "../controllers/rtcController.js";
import * as content from "../controllers/trainingContentController.js";
import * as corpsPayments from "../controllers/corperPaymentController.js";
import * as corpsProgress from "../controllers/corperProgressAdminController.js";
import * as corpsAdmin from "../controllers/corpsAdminController.js";

const router = Router();

router.use(requireAuth);

// Lesson/question ids in the URL must be real UUIDs — anything else is
// simply "not found" rather than a database error.
const uuidParam = (req, res, next, value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? next()
    : res.status(404).json({ error: "Not found" });
router.param("lessonId", uuidParam);
router.param("questionId", uuidParam);

// Admin (TRC department) — Training: upload + approve training courses.
// This is also exactly what farmers see in their own Farmer's Room tab
// (labeled "Seminar" there) — same endpoints, same data, just a
// narrower farmer-facing label on the same underlying feature.
router.get("/admin/dashboard", requireRole("admin"), rtc.dashboardSummary);
router.get("/admin/courses", requireRole("admin"), rtc.adminListCourses);
router.post("/admin/courses", requireRole("admin"), uploadCourseMaterial.single("material"), rtc.adminCreateCourse);
router.post("/admin/courses/:id/approve", requireRole("admin"), rtc.adminApproveCourse);

// Admin (TRC department) — Corps courses: lessons + quiz.
router.get("/admin/courses/:id/content", requireRole("admin"), content.adminGetCourseContent);
router.post("/admin/courses/:id/lessons", requireRole("admin"), uploadCourseMaterial.single("material"), content.adminAddLesson);
router.put("/admin/courses/:id/lessons/:lessonId", requireRole("admin"), uploadCourseMaterial.single("material"), content.adminUpdateLesson);
router.delete("/admin/courses/:id/lessons/:lessonId", requireRole("admin"), content.adminDeleteLesson);
router.post("/admin/courses/:id/lessons/:lessonId/move", requireRole("admin"), content.adminMoveLesson);
router.get("/admin/lessons/:lessonId/file", requireRole("admin"), content.adminDownloadLessonFile);
router.post("/admin/courses/:id/questions", requireRole("admin"), content.adminAddQuestion);
router.put("/admin/courses/:id/questions/:questionId", requireRole("admin"), content.adminUpdateQuestion);
router.delete("/admin/courses/:id/questions/:questionId", requireRole("admin"), content.adminDeleteQuestion);

// Admin (TRC department) — Corps access-fee payments + the fee itself.
router.get("/admin/corps/fee", requireRole("admin"), corpsPayments.adminGetFee);
router.put("/admin/corps/fee", requireRole("admin"), corpsPayments.adminSetFee);
router.get("/admin/corps/payments/summary", requireRole("admin"), corpsPayments.adminPaymentSummary);
router.get("/admin/corps/payments", requireRole("admin"), corpsPayments.adminListPayments);
router.post("/admin/corps/payments/:id/confirm", requireRole("admin"), corpsPayments.adminConfirmPayment);
router.post("/admin/corps/payments/:id/reject", requireRole("admin"), corpsPayments.adminRejectPayment);
router.post("/admin/corps/payments/:id/refund", requireRole("admin"), corpsPayments.adminRefundPayment);

// Admin (TRC department) — Corps member progress (phase 4).
router.get("/admin/corps/progress", requireRole("admin"), corpsProgress.adminCorpsProgress);

// Batches, certificates and the NYSC export
router.get("/admin/corps/batches", requireRole("admin"), corpsAdmin.adminListBatches);
router.put("/admin/corps/batches/:id", requireRole("admin"), corpsAdmin.adminSetDueDate);
router.post("/admin/corps/batches/:id/complete", requireRole("admin"), corpsAdmin.adminCompleteBatch);
router.post("/admin/corps/batches/:id/uncomplete", requireRole("admin"), corpsAdmin.adminUncompleteBatch);
router.post("/admin/corps/batches/:id/resend-emails", requireRole("admin"), corpsAdmin.adminResendEmails);
router.get("/admin/corps/members", requireRole("admin"), corpsAdmin.adminListMembers);
router.get("/admin/corps/members/export", requireRole("admin"), corpsAdmin.adminExportMembers);
router.post("/admin/corps/members/:userId/certificate/reissue", requireRole("admin"), corpsAdmin.adminReissueCertificate);
router.get("/admin/corps/members/:userId/certificate", requireRole("admin"), corpsAdmin.adminDownloadCertificate);

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
