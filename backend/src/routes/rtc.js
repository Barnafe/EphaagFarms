import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as rtc from "../controllers/rtcController.js";

const router = Router();

router.use(requireAuth);

// Admin (TRC department) — publish content
router.get("/admin/courses", requireRole("admin"), rtc.adminListCourses);
router.post("/admin/courses", requireRole("admin"), rtc.adminCreateCourse);
router.get("/admin/seminars", requireRole("admin"), rtc.adminListSeminars);
router.post("/admin/seminars", requireRole("admin"), rtc.adminCreateSeminar);
router.get("/admin/research", requireRole("admin"), rtc.adminListResearch);
router.post("/admin/research", requireRole("admin"), rtc.adminCreateResearch);
router.get("/admin/consultancy", requireRole("admin"), rtc.adminListConsultancy);
router.post("/admin/consultancy", requireRole("admin"), rtc.adminCreateConsultancy);
router.get("/admin/consultancy-requests", requireRole("admin"), rtc.adminListConsultancyRequests);
router.post("/admin/consultancy-requests/:id/status", requireRole("admin"), rtc.adminUpdateConsultancyRequest);

// Member (farmer) — browse + complete courses, always free
router.get("/courses", requireRole("farmer"), rtc.myCourses);
router.post("/courses/:id/complete", requireRole("farmer"), rtc.completeCourse);
router.get("/seminars", requireRole("farmer"), rtc.mySeminars);
router.get("/research", requireRole("farmer"), rtc.myResearch);
router.get("/consultancy", requireRole("farmer"), rtc.myConsultancy);
router.post("/consultancy/:id/apply", requireRole("farmer"), rtc.applyForConsultancy);

export default router;
