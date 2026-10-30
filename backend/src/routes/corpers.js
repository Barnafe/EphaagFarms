import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireCorperPaid } from "../middleware/corperPaid.js";
import * as corpers from "../controllers/corperController.js";
import * as payments from "../controllers/corperPaymentController.js";
import * as learning from "../controllers/corperLearningController.js";
import * as certs from "../controllers/corperCertificateController.js";

const router = Router();

// Paystack calls this itself (no login) — it is authenticated by the HMAC
// signature over the raw body, so it must be registered BEFORE requireAuth.
router.post("/paystack-webhook", payments.paystackWebhook);

router.use(requireAuth, requireRole("corper"));

router.get("/me", corpers.getMyProfile);
router.put("/me/profile/:section", corpers.updateMySection);

// Phase 3 — access-fee payments (always open to a signed-in NYSC AGROALLIED SAED member).
router.get("/payments", payments.myPayments);
router.post("/payments/initiate", payments.initiatePayment);
router.post("/payments/:id/cancel", payments.cancelPayment);
router.post("/payments/:reference/verify", payments.verifyPayment);

// Certificate status + PDF. Not behind the payment gate (a member who has
// finished keeps access to their own certificate); only a RELEASED
// certificate can be downloaded.
router.get("/certificate", certs.myCertificate);
router.get("/certificate/download", certs.downloadMyCertificate);

// Everything below opens training content, so it sits behind the payment
// gate: an unpaid or refunded member gets 402 PAYMENT_REQUIRED from every
// one of these (their saved progress comes back if they pay again).
// Phase 4 — learning, quizzes and progress.
router.get("/courses", requireCorperPaid, learning.listMyCourses);
router.get("/progress", requireCorperPaid, learning.getMyProgress);
router.get("/courses/:id", requireCorperPaid, learning.getCourse);
router.post("/courses/:id/lessons/:lessonId/complete", requireCorperPaid, learning.completeLesson);
router.get("/courses/:id/lessons/:lessonId/file", requireCorperPaid, learning.downloadLessonFile);
router.get("/courses/:id/quiz", requireCorperPaid, learning.getQuiz);
router.post("/courses/:id/quiz/attempts", requireCorperPaid, learning.submitQuiz);
router.get("/courses/:id/quiz/attempts", requireCorperPaid, learning.listAttempts);
router.get("/courses/:id/quiz/attempts/:attemptId", requireCorperPaid, learning.getAttempt);

export default router;
