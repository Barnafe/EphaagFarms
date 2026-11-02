import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import { generateReference } from "../utils/reference.js";
import { normalizeNgPhone } from "../utils/phone.js";
import { notifyAddress, notifyAdmins } from "../services/messaging.js";
import { verifyAndSettle } from "../services/payments.js";
import { paystackConfigured } from "../services/paystack.js";
import { httpError, mapRequest, quoteFor, startConsultancyPayment, settleOpen, trackUrl, topicOf } from "../services/consultancy.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const who = (r) => ({ email: r.applicant_email, phone: r.applicant_phone, name: r.applicant_name || "" });
const SELECT = `SELECT cr.*, co.title AS offering_title FROM consultancy_requests cr LEFT JOIN consultancy_offerings co ON co.id = cr.offering_id`;

// A signed-in member is linked to the request; anyone else applies as a guest. A bad token is simply "guest".
async function optionalUser(req) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  try {
    const p = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const { rows } = await pool.query("SELECT id, name, email, phone, token_version FROM users WHERE id = $1", [p.id]);
    return rows[0] && (p.tv ?? 0) === rows[0].token_version ? rows[0] : null;
  } catch { return null; }
}
const clean = (v, max) => String(v ?? "").trim().slice(0, max);

// ---- public ---------------------------------------------------------------------------------
export async function listOfferings(req, res) {
  const { rows } = await pool.query(`SELECT id, title, description FROM consultancy_offerings ORDER BY created_at DESC`);
  res.json({ offerings: rows });
}

export async function submitRequest(req, res) {
  const user = await optionalUser(req);
  const b = req.body || {};
  const name = clean(b.name || user?.name, 120);
  const email = clean(b.email || user?.email, 200).toLowerCase();
  const phoneRaw = clean(b.phone || user?.phone, 30);
  const message = clean(b.message, 2000);
  const organisation = clean(b.organisation, 160) || null;
  const topic = clean(b.topic, 160) || null;
  if (name.length < 2) throw httpError("Please enter your name.");
  if (!email && !phoneRaw) throw httpError("Please give an email address or a phone number so we can reach you.");
  if (email && !EMAIL_RE.test(email)) throw httpError("That email address doesn't look right.");
  const phone = phoneRaw ? normalizeNgPhone(phoneRaw) : null;
  if (phoneRaw && !phone) throw httpError("That phone number doesn't look right. Use a Nigerian number like 0803 000 0000.");
  if (message.length < 10) throw httpError("Please tell us what you need help with (at least a sentence).");

  let offering = null;
  if (b.offeringId) {
    if (!UUID_RE.test(String(b.offeringId))) throw httpError("That consultancy service was not found.", 404);
    const { rows } = await pool.query(`SELECT id, title FROM consultancy_offerings WHERE id = $1`, [b.offeringId]);
    if (!rows[0]) throw httpError("That consultancy service was not found.", 404);
    offering = rows[0];
  } else if (!topic) {
    throw httpError("Choose a consultancy service or say what it is about.");
  }

  // The system spots a repeat on its own: the same person asking for the same thing while it is still being looked at.
  const dup = await pool.query(
    `SELECT reference FROM consultancy_requests
      WHERE status IN ('pending','awaiting_payment','ready','scheduled')
        AND ((($1::text <> '') AND lower(applicant_email) = $1) OR (($2::text <> '') AND applicant_phone = $2))
        AND offering_id IS NOT DISTINCT FROM $3::uuid AND COALESCE(topic,'') = COALESCE($4,'')
        AND created_at > now() - interval '30 days' LIMIT 1`,
    [email, phone || "", offering?.id || null, topic]);
  if (dup.rows[0]) throw httpError(`You already have an open request for this (${dup.rows[0].reference}). We will contact you about it.`, 409, { reference: dup.rows[0].reference });

  const token = crypto.randomBytes(24).toString("hex");
  const reference = generateReference("CNS");
  const { rows } = await pool.query(
    `INSERT INTO consultancy_requests (reference, access_token, user_id, offering_id, topic, message, applicant_name, applicant_email, applicant_phone, organisation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [reference, token, user?.id || null, offering?.id || null, topic, message, name, email || null, phone, organisation]);
  const r = rows[0];
  const link = trackUrl(token);
  notifyAddress(who(r), "consultancy_received", { reference, topic: topicOf(r, offering?.title), link }).catch((e) => console.error("[consultancy] notice failed", e.message));
  notifyAdmins("consultancy_admin_new", { reference, applicant: name, topic: topicOf(r, offering?.title), member: !!user }).catch(() => {});
  res.status(201).json({ request: { reference, status: r.status }, trackToken: token, trackPath: `/consultancy/request/${token}` });
}

async function byToken(token) {
  if (!/^[0-9a-f]{32,64}$/i.test(String(token || ""))) throw httpError("Request not found", 404);
  const { rows } = await pool.query(`${SELECT} WHERE cr.access_token = $1`, [token]);
  if (!rows[0]) throw httpError("Request not found", 404);
  return rows[0];
}

export async function trackRequest(req, res) {
  let r = await byToken(req.params.token);
  let unreachable = false;
  if (r.status === "awaiting_payment" && paystackConfigured()) {
    const { rows } = await pool.query(`SELECT reference FROM gateway_payments WHERE type='consultancy' AND subject_id=$1 AND status IN ('initiated','pending')`, [r.id]);
    for (const p of rows) { const out = await verifyAndSettle(p.reference).catch(() => null); if (out?.unreachable) unreachable = true; }
    r = await byToken(req.params.token);
  }
  const { rows: pay } = await pool.query(
    `SELECT reference, status, refusal_reason FROM gateway_payments WHERE type='consultancy' AND subject_id=$1 ORDER BY created_at DESC LIMIT 1`, [r.id]);
  const out = mapRequest(r);
  if (r.status === "awaiting_payment" && r.amount !== null) out.quote = await quoteFor(r.amount);
  res.json({ request: out, applicantName: r.applicant_name, lastPayment: pay[0] ? { reference: pay[0].reference, status: pay[0].status } : null, unreachable });
}

export async function payRequest(req, res) {
  const r = await byToken(req.params.token);
  // A phone-only applicant must give an email once: Paystack needs one for the receipt.
  if (!r.applicant_email && req.body?.email) {
    const email = clean(req.body.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) throw httpError("That email address doesn't look right.");
    await pool.query(`UPDATE consultancy_requests SET applicant_email = $2, updated_at = now() WHERE id = $1`, [r.id, email]);
  }
  res.json(await startConsultancyPayment(req.params.token));
}

export async function myRequests(req, res) {
  const { rows } = await pool.query(`${SELECT} WHERE cr.user_id = $1 ORDER BY cr.created_at DESC`, [req.user.id]);
  res.json({ requests: rows.map((r) => ({ ...mapRequest(r), trackPath: `/consultancy/request/${r.access_token}` })) });
}

// ---- admin ---------------------------------------------------------------------------------
export async function adminList(req, res) {
  const { status } = req.query;
  const values = [];
  let where = "";
  if (status) { values.push(String(status)); where = "WHERE cr.status = $1"; }
  const { rows } = await pool.query(`${SELECT} ${where} ORDER BY cr.created_at DESC LIMIT 500`, values);
  const counts = (await pool.query(`SELECT status, COUNT(*)::int AS n FROM consultancy_requests GROUP BY status`)).rows;
  res.json({ requests: rows.map((r) => mapRequest(r, { admin: true })), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}

async function load(id, allowed) {
  if (!UUID_RE.test(String(id))) throw httpError("Request not found", 404);
  const { rows } = await pool.query(`${SELECT} WHERE cr.id = $1`, [id]);
  const r = rows[0];
  if (!r) throw httpError("Request not found", 404);
  if (allowed && !allowed.includes(r.status)) throw httpError(`This request is ${r.status.replace("_", " ")}, so you can't do that now.`, 409);
  return r;
}

export async function adminApprove(req, res) {
  const r = await load(req.params.id, ["pending"]);
  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  const terms = clean(req.body?.paymentTerms, 1000);
  if (!Number.isFinite(amount) || amount < 0) throw httpError("Enter the consultancy fee (0 if it is free).");
  if (amount > 0 && amount < 100) throw httpError("The fee must be at least ₦100, or 0 if it is free.");
  if (amount > 0 && !terms) throw httpError("Write the payment terms the applicant will see (for example: pay within 7 days).");
  const next = amount > 0 ? "awaiting_payment" : "ready";
  const { rows } = await pool.query(
    `UPDATE consultancy_requests SET status = $2, amount = $3, payment_terms = $4, updated_at = now(), decided_by = $5, decided_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING *`, [r.id, next, amount, amount > 0 ? terms : null, req.user.id]);
  if (!rows[0]) throw httpError("This request was just changed by someone else. Refresh and try again.", 409);
  const link = trackUrl(r.access_token);
  if (amount > 0) {
    const q = await quoteFor(amount);
    notifyAddress(who(r), "consultancy_approved", { reference: r.reference, amount: q.amount, fee: q.fee, totalToPay: q.totalToPay, paymentTerms: terms, link }, { allChannels: true }).catch(() => {});
  } else {
    notifyAddress(who(r), "consultancy_approved_free", { reference: r.reference, link }, { allChannels: true }).catch(() => {});
  }
  res.json({ request: mapRequest({ ...rows[0], offering_title: r.offering_title }, { admin: true }) });
}

export async function adminReject(req, res) {
  const r = await load(req.params.id, ["pending"]);
  const reason = clean(req.body?.reason, 1000);
  if (!reason) throw httpError("Give the applicant a reason.");
  const { rows } = await pool.query(
    `UPDATE consultancy_requests SET status = 'rejected', decision_reason = $2, updated_at = now(), decided_by = $3, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`, [r.id, reason, req.user.id]);
  if (!rows[0]) throw httpError("This request was just changed by someone else. Refresh and try again.", 409);
  notifyAddress(who(r), "consultancy_rejected", { reference: r.reference, reason }).catch(() => {});
  res.json({ request: mapRequest({ ...rows[0], offering_title: r.offering_title }, { admin: true }) });
}

export async function adminCancel(req, res) {
  const r = await load(req.params.id, ["pending", "awaiting_payment"]);
  const reason = clean(req.body?.reason, 1000) || "Cancelled by EPHAAG";
  const { rows } = await pool.query(
    `UPDATE consultancy_requests SET status = 'cancelled', decision_reason = $2, updated_at = now() WHERE id = $1 AND status IN ('pending','awaiting_payment') RETURNING *`, [r.id, reason]);
  if (!rows[0]) throw httpError("This request was just changed by someone else. Refresh and try again.", 409);
  notifyAddress(who(r), "consultancy_rejected", { reference: r.reference, reason }).catch(() => {});
  res.json({ request: mapRequest({ ...rows[0], offering_title: r.offering_title }, { admin: true }) });
}

export async function adminSchedule(req, res) {
  const r = await load(req.params.id, ["ready", "scheduled"]);
  const b = req.body || {};
  const date = clean(b.date, 10), time = clean(b.time, 5), place = clean(b.place, 500), note = clean(b.note, 1000) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) throw httpError("Choose a valid date.");
  if (date < new Date().toISOString().slice(0, 10)) throw httpError("The session date can't be in the past.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw httpError("Choose a valid time (for example 10:30).");
  if (place.length < 3) throw httpError("Give the place or the meeting link.");
  const { rows } = await pool.query(
    `UPDATE consultancy_requests SET status = 'scheduled', session_date = $2, session_time = $3, session_place = $4, consultant_note = $5,
            scheduled_by = $6, scheduled_at = now(), updated_at = now() WHERE id = $1 AND status IN ('ready','scheduled') RETURNING *`,
    [r.id, date, time, place, note, req.user.id]);
  if (!rows[0]) throw httpError("This request was just changed by someone else. Refresh and try again.", 409);
  notifyAddress(who(r), "consultancy_scheduled", { reference: r.reference, date, time, place, note: note || "" }, { allChannels: true }).catch(() => {});
  res.json({ request: mapRequest({ ...rows[0], offering_title: r.offering_title }, { admin: true }) });
}

export async function adminComplete(req, res) {
  const r = await load(req.params.id, ["scheduled"]);
  const { rows } = await pool.query(`UPDATE consultancy_requests SET status = 'completed', updated_at = now() WHERE id = $1 AND status = 'scheduled' RETURNING *`, [r.id]);
  if (!rows[0]) throw httpError("This request was just changed by someone else. Refresh and try again.", 409);
  res.json({ request: mapRequest({ ...rows[0], offering_title: r.offering_title }, { admin: true }) });
}
