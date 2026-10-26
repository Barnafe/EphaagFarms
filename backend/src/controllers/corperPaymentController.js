import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";
import {
  corperPaymentMode,
  paystackRequest,
  toKobo,
  checkPaystackTransaction,
  verifyPaystackSignature,
} from "../utils/paymentProvider.js";
import { recordWebhookEvent } from "../jobs/alerts.js";

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A malformed id in the URL is "not found", never a database error.
function assertUuid(id) {
  if (!UUID_RE.test(String(id))) throw httpError("Payment not found", 404);
}

const FEE_CATEGORY = "system_configuration";
const FEE_KEY = "corper_access_fee";
const MAX_FEE = 10_000_000;

// ---------------------------------------------------------------------
// Fee (stored in finance_settings so Finance sees it; editable any time)
// ---------------------------------------------------------------------

export async function getFee(runner = pool) {
  const { rows } = await runner.query(
    `SELECT value FROM finance_settings WHERE category = $1 AND key = $2`,
    [FEE_CATEGORY, FEE_KEY]
  );
  const n = Number(rows[0]?.value?.amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------

function mapPayment(p) {
  return {
    id: p.id,
    reference: p.reference,
    amount: Number(p.amount),
    status: p.status,
    provider: p.provider,
    authorizationUrl: p.status === "pending" ? p.authorization_url : null,
    confirmedAt: p.confirmed_at,
    failedReason: p.failed_reason,
    refundReason: p.refund_reason,
    refundedAt: p.refunded_at,
    createdAt: p.created_at,
  };
}

function mapAdminPayment(p) {
  return {
    ...mapPayment(p),
    authorizationUrl: undefined,
    providerReference: p.provider_reference,
    userId: p.user_id,
    memberName: p.member_name,
    memberEmail: p.member_email,
    stateCode: p.state_code || null,
    confirmedByName: p.confirmed_by_name || null,
    refundedByName: p.refunded_by_name || null,
  };
}

// A member's access summary — shared with GET /corpers/me so every screen
// agrees on whether they've paid. Only a 'paid' row opens the gate.
export async function loadAccess(userId, runner = pool) {
  const { rows } = await runner.query(
    `SELECT * FROM corper_payments WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  const paid = rows.find((r) => r.status === "paid");
  const pending = rows.find((r) => r.status === "pending");
  return {
    status: paid ? "paid" : pending ? "pending" : "unpaid",
    paid: !!paid,
    paidAt: paid?.confirmed_at || null,
    reference: paid?.reference || null,
    pending: pending ? mapPayment(pending) : null,
  };
}

// ---------------------------------------------------------------------
// The one confirmation path. Used by an admin confirming by hand, by the
// member's Paystack return (verify) and by the Paystack webhook. Safe to run
// twice (a second call just reports `already: true`), and posts the money to
// the Finance ledger in the SAME transaction so the two can never disagree.
// ---------------------------------------------------------------------

export async function confirmPayment(paymentId, { via, confirmedBy = null, providerReference = null }) {
  const client = await pool.connect();
  let payment;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT p.*, u.name AS member_name, u.email AS member_email
       FROM corper_payments p JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 FOR UPDATE OF p`,
      [paymentId]
    );
    const p = rows[0];
    if (!p) throw httpError("Payment not found", 404);
    if (p.status === "paid") {
      await client.query("ROLLBACK");
      return { payment: p, already: true };
    }
    // Money verified by the gateway may arrive after a member cancelled or
    // after a rejection, so those can still be confirmed. A manual (admin)
    // confirmation only applies to a payment that is still waiting.
    const allowed = via === "paystack" ? ["pending", "cancelled", "failed"] : ["pending"];
    if (!allowed.includes(p.status)) {
      throw httpError(`A ${p.status} payment can't be confirmed`, 409);
    }

    const incomeRef = generateReference(REF_PREFIX.financeIncome);
    const { rows: incomeRows } = await client.query(
      `INSERT INTO finance_income (reference, source, category, amount, description, received_from, recorded_by)
       VALUES ($1, 'customer_payment', 'Corps access fee', $2, $3, $4, $5) RETURNING id`,
      [incomeRef, p.amount, `Corps access fee ${p.reference}`, p.member_name, confirmedBy]
    );
    await client.query(
      `INSERT INTO finance_transactions (reference, txn_type, amount, department, description, related_table, related_id, recorded_by)
       VALUES ($1, 'income', $2, 'TRC', $3, 'corper_payments', $4, $5)`,
      [generateReference(REF_PREFIX.financeTransaction), p.amount, `Corps access fee ${p.reference} — ${p.member_name}`, p.id, confirmedBy]
    );

    const { rows: updated } = await client.query(
      `UPDATE corper_payments
       SET status = 'paid', confirmed_by = $2, confirmed_at = now(), provider_reference = $3,
           finance_income_id = $4, failed_reason = NULL, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [p.id, confirmedBy, providerReference || (via === "admin" ? "ADMIN" : null), incomeRows[0].id]
    );
    // Any other payment this member still had waiting is now pointless.
    await client.query(
      `UPDATE corper_payments SET status = 'cancelled', updated_at = now()
       WHERE user_id = $1 AND status = 'pending' AND id <> $2`,
      [p.user_id, p.id]
    );
    await client.query("COMMIT");
    payment = { ...updated[0], member_name: p.member_name, member_email: p.member_email };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      // The member already has a different paid payment (unique index).
      console.error("Corps payment confirmation blocked — member already has a paid access fee", paymentId);
      throw httpError("This member has already paid the access fee", 409);
    }
    throw err;
  } finally {
    client.release();
  }

  sendReceipt(payment).catch((e) => console.error("Corps receipt email failed", e));
  return { payment, already: false };
}

// Never blocks or fails the payment — a mail problem is logged and ignored.
async function sendReceipt(p) {
  if (!p.member_email) return;
  const naira = Number(p.amount).toLocaleString("en-NG");
  await sendMail({
    to: p.member_email,
    subject: `EPHAAG Farms — payment received (${p.reference})`,
    html:
      `<p>Hello ${escapeHtml(p.member_name)},</p>` +
      `<p>We have received your one-time access fee of <strong>₦${naira}</strong>. ` +
      `Your corps training is now unlocked — sign in and open <em>My Training</em> to begin.</p>` +
      `<p>Receipt reference: <strong>${escapeHtml(p.reference)}</strong></p>` +
      `<p>EPHAAG Farms</p>`,
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------
// Member endpoints (role: corper)
// ---------------------------------------------------------------------

// GET /api/corpers/payments
export async function myPayments(req, res) {
  const [fee, access, { rows }] = await Promise.all([
    getFee(),
    loadAccess(req.user.id),
    pool.query(`SELECT * FROM corper_payments WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.id]),
  ]);
  res.json({ fee, mode: corperPaymentMode(), access, payments: rows.map(mapPayment) });
}

// POST /api/corpers/payments/initiate — the amount ALWAYS comes from the
// server's fee setting; anything the browser sends is ignored.
export async function initiatePayment(req, res) {
  const fee = await getFee();
  if (!fee) throw httpError("The access fee hasn't been set yet — please check back soon", 409);

  const access = await loadAccess(req.user.id);
  if (access.paid) throw httpError("Your access fee is already paid", 409);
  if (access.pending) return res.json({ payment: access.pending, existing: true });

  const mode = corperPaymentMode();
  let row = null;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO corper_payments (reference, user_id, amount, provider)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [generateReference(REF_PREFIX.corperPayment), req.user.id, fee, mode]
      );
      row = rows[0];
    } catch (err) {
      if (err.code !== "23505") throw err;
      // Either a double-click raced us (a pending/paid row now exists) or the
      // random reference collided. Re-read and answer accordingly.
      const now = await loadAccess(req.user.id);
      if (now.paid) throw httpError("Your access fee is already paid", 409);
      if (now.pending) return res.json({ payment: now.pending, existing: true });
    }
  }
  if (!row) throw httpError("Couldn't start the payment — please try again", 500);

  if (mode === "paystack") {
    const { rows: u } = await pool.query(`SELECT email, phone FROM users WHERE id = $1`, [req.user.id]);
    const email = u[0]?.email || `${u[0]?.phone || req.user.id}@corpers.ephaag.app`;
    const base = (process.env.FRONTEND_ORIGIN || "").split(",")[0].trim().replace(/\/$/, "");
    let init;
    try {
      init = await paystackRequest("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email,
          amount: toKobo(row.amount),
          currency: "NGN",
          reference: row.reference,
          callback_url: base ? `${base}/dashboard/corper?corperPayment=${row.reference}` : undefined,
          metadata: { userId: req.user.id, purpose: "corper_access_fee" },
        }),
      });
    } catch (err) {
      console.error("Paystack initialize threw", err);
      init = { ok: false, body: null };
    }
    if (!init.ok || !init.body?.status || !init.body?.data?.authorization_url) {
      console.error("Paystack initialize failed", init.body);
      await pool.query(
        `UPDATE corper_payments SET status = 'failed', failed_reason = $2, updated_at = now() WHERE id = $1`,
        [row.id, "Couldn't reach the payment gateway"]
      );
      throw httpError("Couldn't start the payment — please try again", 502);
    }
    const { rows } = await pool.query(
      `UPDATE corper_payments SET authorization_url = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [row.id, init.body.data.authorization_url]
    );
    row = rows[0];
  }

  res.status(201).json({ payment: mapPayment(row) });
}

// POST /api/corpers/payments/:id/cancel
export async function cancelPayment(req, res) {
  assertUuid(req.params.id);
  const { rows } = await pool.query(
    `UPDATE corper_payments SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (!rows[0]) throw httpError("There's no pending payment to cancel", 404);
  res.json({ payment: mapPayment(rows[0]) });
}

// POST /api/corpers/payments/:reference/verify — after returning from
// Paystack (or on refresh). The member's own word is never trusted: for
// Paystack we ask Paystack. For manual payments this just reports status.
export async function verifyPayment(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM corper_payments WHERE reference = $1 AND user_id = $2`,
    [req.params.reference, req.user.id]
  );
  const payment = rows[0];
  if (!payment) throw httpError("Payment not found", 404);

  const retryable = ["pending", "cancelled", "failed"].includes(payment.status);
  if (retryable && payment.provider === "paystack" && corperPaymentMode() === "paystack") {
    const v = await paystackRequest(`/transaction/verify/${encodeURIComponent(payment.reference)}`);
    const data = v.body?.data;
    if (!v.ok || !v.body?.status || !data) {
      return res.status(502).json({ error: "Couldn't confirm the payment yet — please try again in a moment" });
    }
    const check = checkPaystackTransaction(data, payment);
    if (!check.ok) {
      if (check.code === "mismatch" || check.code === "reference") console.error("Paystack check failed", payment.reference, check.code);
      return res.status(402).json({ error: check.message });
    }
    await confirmPayment(payment.id, { via: "paystack", providerReference: String(data.id ?? "") });
  }

  const [access, { rows: fresh }] = await Promise.all([
    loadAccess(req.user.id),
    pool.query(`SELECT * FROM corper_payments WHERE id = $1`, [payment.id]),
  ]);
  res.json({ payment: mapPayment(fresh[0]), access });
}

// ---------------------------------------------------------------------
// Paystack webhook (no login — authenticated by the HMAC signature)
// ---------------------------------------------------------------------
export async function paystackWebhook(req, res) {
  if (!verifyPaystackSignature(req.rawBody, req.headers["x-paystack-signature"])) {
    await recordWebhookEvent("paystack", "bad_signature", "corps webhook", req);
    return res.status(401).json({ error: "Invalid signature" });
  }
  await recordWebhookEvent("paystack", "ok", "corps webhook");
  try {
    await applyCorpsPaystackEvent(req.body || {});
  } catch (err) {
    await recordWebhookEvent("paystack", "error", err.message);
    throw err; // 5xx -> Paystack retries later
  }
  res.json({ received: true });
}

// The corps part of a Paystack event. Used by the old corps webhook address and
// by the shared /api/payments/paystack-webhook, so corps behaves identically on both.
export async function applyCorpsPaystackEvent(event) {
  if (event.event !== "charge.success" || !event.data?.reference) return false;
  const { rows } = await pool.query(`SELECT * FROM corper_payments WHERE reference = $1`, [event.data.reference]);
  const payment = rows[0];
  if (!payment) return false; // not one of ours

  const check = checkPaystackTransaction(event.data, payment);
  if (!check.ok) {
    console.error("Paystack webhook check failed", payment.reference, check.code);
    return true;
  }
  try {
    await confirmPayment(payment.id, { via: "paystack", providerReference: String(event.data.id ?? "") });
  } catch (err) {
    if (err.status && err.status < 500) {
      console.error("Paystack webhook not applied:", err.message);
      return true;
    }
    throw err;
  }
  return true;
}

// ---------------------------------------------------------------------
// Admin endpoints (TRC -> Corps -> Payments)
// ---------------------------------------------------------------------

const ADMIN_SELECT = `
  SELECT p.*, u.name AS member_name, u.email AS member_email, cp.state_code,
         cb.name AS confirmed_by_name, rb.name AS refunded_by_name
  FROM corper_payments p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN corper_profiles cp ON cp.user_id = p.user_id
  LEFT JOIN users cb ON cb.id = p.confirmed_by
  LEFT JOIN users rb ON rb.id = p.refunded_by`;

const STATUSES = ["pending", "paid", "failed", "cancelled", "refunded"];

// GET /api/rtc/admin/corps/payments?status=&q=
export async function adminListPayments(req, res) {
  const { status, q } = req.query;
  if (status && status !== "all" && !STATUSES.includes(status)) {
    throw httpError(`status must be one of ${STATUSES.join(", ")} or all`);
  }
  const params = [];
  const clauses = [];
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`p.status = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    const i = params.length;
    clauses.push(`(u.name ILIKE $${i} OR u.email ILIKE $${i} OR p.reference ILIKE $${i} OR cp.state_code ILIKE $${i})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`${ADMIN_SELECT} ${where} ORDER BY p.created_at DESC LIMIT 500`, params);
  res.json({ payments: rows.map(mapAdminPayment) });
}

// GET /api/rtc/admin/corps/payments/summary
export async function adminPaymentSummary(req, res) {
  const [{ rows }, fee] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float8 AS total FROM corper_payments GROUP BY status`),
    getFee(),
  ]);
  const get = (s) => rows.find((r) => r.status === s) || { count: 0, total: 0 };
  res.json({
    fee,
    mode: corperPaymentMode(),
    paidCount: get("paid").count,
    collected: get("paid").total,
    pendingCount: get("pending").count,
    pendingTotal: get("pending").total,
    failedCount: get("failed").count,
    refundedCount: get("refunded").count,
    refundedTotal: get("refunded").total,
  });
}

// POST /api/rtc/admin/corps/payments/:id/confirm
export async function adminConfirmPayment(req, res) {
  assertUuid(req.params.id);
  const { payment, already } = await confirmPayment(req.params.id, { via: "admin", confirmedBy: req.user.id });
  res.json({ payment: mapAdminPayment(payment), already });
}

function requireReason(raw) {
  const reason = String(raw ?? "").trim();
  if (reason.length < 3) throw httpError("Please give a reason (at least a few words)");
  if (reason.length > 500) throw httpError("The reason is too long (500 characters at most)");
  return reason;
}

// POST /api/rtc/admin/corps/payments/:id/reject — a waiting payment that
// wasn't actually received. The member sees the reason and can try again.
export async function adminRejectPayment(req, res) {
  assertUuid(req.params.id);
  const reason = requireReason(req.body?.reason);
  const { rows } = await pool.query(
    `UPDATE corper_payments SET status = 'failed', failed_reason = $2, updated_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [req.params.id, reason]
  );
  if (!rows[0]) throw httpError("Only a pending payment can be rejected", 409);
  const { rows: full } = await pool.query(`${ADMIN_SELECT} WHERE p.id = $1`, [rows[0].id]);
  res.json({ payment: mapAdminPayment(full[0]) });
}

// POST /api/rtc/admin/corps/payments/:id/refund — refund + revoke access,
// with a recorded reason. Reverses the income in the Finance ledger. (If the
// member paid through Paystack, return the money from the Paystack dashboard
// — this action records it here and closes their access.)
export async function adminRefundPayment(req, res) {
  assertUuid(req.params.id);
  const reason = requireReason(req.body?.reason);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT p.*, u.name AS member_name FROM corper_payments p JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 FOR UPDATE OF p`,
      [req.params.id]
    );
    const p = rows[0];
    if (!p) throw httpError("Payment not found", 404);
    if (p.status !== "paid") throw httpError("Only a paid payment can be refunded", 409);

    // Negative income keeps the Finance revenue totals honest.
    await client.query(
      `INSERT INTO finance_income (reference, source, category, amount, description, received_from, recorded_by)
       VALUES ($1, 'other', 'Corps access fee refund', $2, $3, $4, $5)`,
      [generateReference(REF_PREFIX.financeIncome), -Number(p.amount), `Refund of corps access fee ${p.reference}: ${reason}`, p.member_name, req.user.id]
    );
    await client.query(
      `INSERT INTO finance_transactions (reference, txn_type, amount, department, description, related_table, related_id, recorded_by)
       VALUES ($1, 'refund', $2, 'TRC', $3, 'corper_payments', $4, $5)`,
      [generateReference(REF_PREFIX.financeTransaction), p.amount, `Refund of corps access fee ${p.reference} — ${p.member_name}: ${reason}`, p.id, req.user.id]
    );
    await client.query(
      `UPDATE corper_payments
       SET status = 'refunded', refund_reason = $2, refunded_by = $3, refunded_at = now(), updated_at = now()
       WHERE id = $1`,
      [p.id, reason, req.user.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const { rows: full } = await pool.query(`${ADMIN_SELECT} WHERE p.id = $1`, [req.params.id]);
  res.json({ payment: mapAdminPayment(full[0]) });
}

// GET /api/rtc/admin/corps/fee
export async function adminGetFee(req, res) {
  res.json({ fee: await getFee(), mode: corperPaymentMode() });
}

// PUT /api/rtc/admin/corps/fee — editable any time. Payments already
// created keep the amount they were created with.
export async function adminSetFee(req, res) {
  const raw = req.body?.amount;
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(n) || n <= 0) {
    throw httpError("The fee must be a number greater than zero");
  }
  if (n > MAX_FEE) throw httpError(`The fee can't be more than ₦${MAX_FEE.toLocaleString("en-NG")}`);
  const amount = Math.round(n * 100) / 100;

  const previous = await getFee();
  await pool.query(
    `INSERT INTO finance_settings (category, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category, key) DO UPDATE SET value = $3, updated_by = $4, updated_at = now()`,
    [FEE_CATEGORY, FEE_KEY, JSON.stringify({ amount }), req.user.id]
  );
  await pool.query(
    `INSERT INTO finance_audit_log (actor_id, action, entity_table, details) VALUES ($1, 'corps_fee_changed', 'finance_settings', $2)`,
    [req.user.id, JSON.stringify({ from: previous, to: amount })]
  );
  res.json({ fee: amount });
}
