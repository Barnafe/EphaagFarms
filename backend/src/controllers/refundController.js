import { listAttention, listHistory, searchRefundable, refundPayment } from "../services/refunds.js";
import { logSecurityEvent } from "../utils/securityLog.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function attention(req, res) { res.json({ items: await listAttention() }); }
export async function history(req, res) { res.json({ items: await listHistory() }); }
export async function search(req, res) { res.json({ items: await searchRefundable(req.query.q) }); }

export async function refund(req, res) {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Payment not found" });
  await refundPayment(req.params.id, { reason: req.body?.reason, userId: req.user.id });
  await logSecurityEvent("refund_issued", { userId: req.user.id, req, detail: { payment: req.params.id } });
  res.json({ ok: true });
}
