import { pool } from "../db/pool.js";
import { PAYOUT_LABEL, payoutSettings, savePayoutSettings, retryPayout, runPayouts, recheckProcessingPayouts } from "../services/payouts.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function list(req, res) {
  const status = req.query.status;
  const where = ["failed", "held", "queued", "processing", "success"].includes(status) ? `WHERE p.status = '${status}'` : "";
  const { rows } = await pool.query(
    `SELECT p.*, u.name AS user_name FROM payouts p JOIN users u ON u.id = p.user_id ${where} ORDER BY p.created_at DESC LIMIT 200`);
  const { rows: counts } = await pool.query(`SELECT status, count(*)::int AS n FROM payouts GROUP BY status`);
  res.json({
    payouts: rows.map((p) => ({ id: p.id, kind: p.kind, label: PAYOUT_LABEL[p.kind], userName: p.user_name, amount: Number(p.amount), status: p.status, holdReason: p.hold_reason, failureReason: p.failure_reason, attempts: p.attempts, reference: p.reference, createdAt: p.created_at, completedAt: p.completed_at })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), settings: await payoutSettings(),
  });
}
export async function getSettings(req, res) { res.json(await payoutSettings()); }
export async function putSettings(req, res) {
  const { paused, dailyCap } = req.body || {};
  if (paused !== undefined && typeof paused !== "boolean") return res.status(400).json({ error: "paused must be true or false." });
  if (dailyCap !== undefined && dailyCap !== null && dailyCap !== "" && !(Number(dailyCap) > 0)) return res.status(400).json({ error: "The daily cap must be an amount greater than zero, or empty for no cap." });
  await savePayoutSettings({ paused, dailyCap }, req.user.id);
  if (paused === false || dailyCap !== undefined) runPayouts().catch(() => {});
  res.json(await payoutSettings());
}
export async function retry(req, res) {
  if (!UUID_RE.test(String(req.params.id))) return res.status(404).json({ error: "Payout not found" });
  if (!(await retryPayout(req.params.id))) return res.status(409).json({ error: "Only a failed payout can be retried." });
  res.json({ ok: true });
}
export async function runNow(req, res) {
  const sent = await runPayouts();
  const re = await recheckProcessingPayouts().catch(() => ({}));
  res.json({ ...sent, ...re });
}
