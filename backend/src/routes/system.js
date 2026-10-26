import crypto from "node:crypto";
import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { tick, runJob, systemStatus } from "../jobs/runner.js";
import { getSetting, setSetting } from "../utils/settings.js";
import { normalizeNgPhone } from "../utils/phone.js";
import { logSecurityEvent } from "../utils/securityLog.js";
import { recordWebhookEvent } from "../jobs/alerts.js";

const router = Router();

function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")); const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Secured address for an outside pinger on a sleeping host: wakes the server
// and runs whatever is due.  GET or POST /api/system/tick  with  x-tick-secret.
async function tickHandler(req, res) {
  const secret = process.env.JOB_TICK_SECRET;
  if (!secret) return res.status(404).json({ error: "Not enabled" });
  if (!safeEqual(req.headers["x-tick-secret"], secret)) {
    await recordWebhookEvent("tick", "bad_signature", "wrong tick secret", req);
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(await tick({ trigger: "external" }));
}
router.get("/tick", tickHandler);
router.post("/tick", tickHandler);

router.use(requireAuth, requireRole("admin"));
router.get("/status", async (req, res) => res.json(await systemStatus()));
router.post("/jobs/:name/run", async (req, res) => {
  const out = await runJob(req.params.name, { trigger: "manual" });
  await logSecurityEvent("job_run_now", { userId: req.user.id, req, detail: { job: req.params.name } });
  res.json(out);
});
router.get("/alert-settings", async (req, res) => res.json({ alertSmsPhone: await getSetting("alert_sms_phone", null) }));
router.put("/alert-settings", async (req, res) => {
  const raw = req.body?.alertSmsPhone;
  const phone = raw ? normalizeNgPhone(raw) : null;
  if (raw && !phone) return res.status(400).json({ error: "Enter a valid Nigerian phone number" });
  await setSetting("alert_sms_phone", phone, req.user.id);
  await logSecurityEvent("alert_phone_changed", { userId: req.user.id, req });
  res.json({ alertSmsPhone: phone });
});
export default router;
