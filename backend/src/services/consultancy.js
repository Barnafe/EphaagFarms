// Phase 7: Consultancy. Anyone (a member or a guest with no account) applies with their details.
// Nothing is paid at application. After an admin approves, the amount and payment terms are sent to the
// applicant, who pays through Paystack (the applicant adds Paystack's fee). When it is paid, an admin schedules
// the session and the applicant gets the date, time, place or meeting link and a note from the consultant.
import { pool } from "../db/pool.js";
import { generateReference } from "../utils/reference.js";
import { paystackConfigured, calculateFee, getFeeConfig } from "./paystack.js";
import { registerPaymentType, createPayment, startCheckout, verifyAndSettle, notifyFinance, TYPE_LABEL } from "./payments.js";
import { notifyAddress } from "./messaging.js";
import { registerTemplate, escapeHtml } from "./messageTemplates.js";
import "./paymentTemplates.js";

export const httpError = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, expose: true, ...extra });
const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const row = (a, b) => `<tr><td style="padding:4px 12px 4px 0;color:#57534e;">${escapeHtml(a)}</td><td style="padding:4px 0;"><strong>${escapeHtml(b)}</strong></td></tr>`;
const origin = () => (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim();
export const trackUrl = (token) => `${origin()}/consultancy/request/${token}`;

// ---- messages -----------------------------------------------------------------------------
registerTemplate("consultancy_received", (d) => ({
  subject: `We received your consultancy request (${d.reference})`,
  title: "Consultancy request received",
  html: `<p>Hello ${escapeHtml(d.name)}, thank you. We have received your consultancy request. You do not pay anything now.</p>
<p>Our team will review it. If it is approved, we will send you the amount and payment terms here, and you can pay online. You can follow your request at any time:</p>
<p><a href="${escapeHtml(d.link)}">${escapeHtml(d.link)}</a></p>${d.topic ? `<table role="presentation">${row("Request", d.reference)}${row("About", d.topic)}</table>` : ""}`,
  sms: `EPHAAG: your consultancy request ${d.reference} was received. Nothing to pay yet. Follow it: ${d.link}`,
}), { name: "Amina", reference: "CNS-20261101-ABCD", topic: "Poultry feed plan", link: "http://localhost:5173/consultancy/request/abc" });

registerTemplate("consultancy_approved", (d) => ({
  subject: `Your consultancy request is approved: fee ${naira(d.amount)} (${d.reference})`,
  title: "Consultancy request approved",
  html: `<p>Hello ${escapeHtml(d.name)}, good news: your consultancy request was approved.</p>
<table role="presentation">${row("Request", d.reference)}${row("Consultancy fee", naira(d.amount))}</table>
<p><strong>Payment terms:</strong> ${escapeHtml(d.paymentTerms)}</p>
<p>Pay online here: <a href="${escapeHtml(d.link)}">${escapeHtml(d.link)}</a></p>
<p>After your payment is received we will schedule your session and send you the date, time and place or meeting link.</p>`,
  sms: `EPHAAG: consultancy ${d.reference} approved. Fee ${naira(d.amount)}. Pay: ${d.link}`,
}), { name: "Amina", reference: "CNS-20261101-ABCD", amount: 20000, fee: 400, totalToPay: 20400, paymentTerms: "Pay within 7 days", link: "http://localhost:5173/consultancy/request/abc" });

registerTemplate("consultancy_approved_free", (d) => ({
  subject: `Your consultancy request is approved (${d.reference})`,
  title: "Consultancy request approved",
  html: `<p>Hello ${escapeHtml(d.name)}, your consultancy request ${escapeHtml(d.reference)} was approved and there is nothing to pay. We will schedule your session and send you the date, time and place or meeting link.</p><p><a href="${escapeHtml(d.link)}">${escapeHtml(d.link)}</a></p>`,
  sms: `EPHAAG: consultancy ${d.reference} approved, nothing to pay. We will send your session details. ${d.link}`,
}), { name: "Amina", reference: "CNS-20261101-ABCD", link: "http://localhost:5173/consultancy/request/abc" });

registerTemplate("consultancy_rejected", (d) => ({
  subject: `About your consultancy request (${d.reference})`,
  title: "Consultancy request not taken forward",
  html: `<p>Hello ${escapeHtml(d.name)}, thank you for your interest. We are not able to take your consultancy request ${escapeHtml(d.reference)} forward.</p><p><strong>Reason:</strong> ${escapeHtml(d.reason)}</p><p>You have not been charged anything.</p>`,
  sms: `EPHAAG: we cannot take consultancy request ${d.reference} forward. Reason: ${d.reason}`,
}), { name: "Amina", reference: "CNS-20261101-ABCD", reason: "Outside our current areas" });

registerTemplate("consultancy_receipt", (d) => ({
  subject: `Payment received for consultancy ${d.reference}`,
  title: "Payment received",
  html: `<p>Hello ${escapeHtml(d.name)}, we have received your payment. We will now schedule your session and send you the date, time and place or meeting link.</p>
<table role="presentation">${row("Request", d.reference)}${row("Consultancy fee", naira(d.amount))}${row("Payment reference", d.paymentReference)}</table><p>Keep this email as your receipt.</p>`,
  sms: `EPHAAG: payment of ${naira(d.amount)} received for consultancy ${d.reference}. We will schedule your session.`,
}), { name: "Amina", reference: "CNS-20261101-ABCD", amount: 20000, fee: 400, totalCharged: 20400, paymentReference: "CNS-20261101-ABCDXYZ" });

registerTemplate("consultancy_scheduled", (d) => ({
  subject: `Your consultancy session is scheduled: ${d.date} at ${d.time}`,
  title: "Consultancy session scheduled",
  html: `<p>Hello ${escapeHtml(d.name)}, your consultancy session is scheduled.</p>
<table role="presentation">${row("Request", d.reference)}${row("Date", d.date)}${row("Time", d.time)}${row("Place or meeting link", d.place)}</table>
${d.note ? `<p><strong>Note from your consultant:</strong> ${escapeHtml(d.note)}</p>` : ""}`,
  sms: `EPHAAG: consultancy ${d.reference} on ${d.date} at ${d.time}. ${d.place}${d.note ? ` Note: ${d.note}` : ""}`,
}), { name: "Amina", reference: "CNS-20261101-ABCD", date: "2026-11-10", time: "10:00", place: "EPHAAG office, Yelwa", note: "Bring your farm records" });

registerTemplate("consultancy_admin_new", (d) => ({
  subject: `[Consultancy] New request ${d.reference} from ${d.applicant}`,
  title: "New consultancy request",
  html: `<p>A ${d.member ? "member" : "guest"} applied for consultancy.</p><table role="presentation">${row("Request", d.reference)}${row("Applicant", d.applicant)}${row("About", d.topic)}</table><p>Open TRC &rarr; Consultancy to approve it (set the amount and payment terms) or decline it.</p>`,
}), { reference: "CNS-20261101-ABCD", applicant: "Amina", topic: "Poultry feed plan", member: false });

registerTemplate("consultancy_admin_ready", (d) => ({
  subject: `[Consultancy] ${d.reference} is paid: schedule the session`,
  title: "Consultancy paid, ready to schedule",
  html: `<p>${escapeHtml(d.applicant)} has paid for consultancy ${escapeHtml(d.reference)}.</p><p>Open TRC &rarr; Consultancy to set the date, time and place or meeting link.</p>`,
}), { reference: "CNS-20261101-ABCD", applicant: "Amina" });

// ---- the applicant ----------------------------------------------------------------------------
const who = (r) => ({ email: r.applicant_email, phone: r.applicant_phone, name: r.applicant_name || "" });
// A DATE column arrives as a JS Date at local midnight; keep the calendar day exactly as stored.
const dateOnly = (d) => (d instanceof Date
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : String(d).slice(0, 10));
export const topicOf = (r, offeringTitle = null) => offeringTitle || r.topic || "Consultancy";

export async function quoteFor(amount) {
  const q = calculateFee(Number(amount), await getFeeConfig());
  return { amount: q.net, fee: q.fee, totalToPay: q.gross };
}

/** What the applicant (and the admin) may see of a request. */
export function mapRequest(r, { admin = false } = {}) {
  const out = {
    id: r.id, reference: r.reference, status: r.status, createdAt: r.created_at,
    offeringId: r.offering_id, offeringTitle: r.offering_title || null, topic: r.topic, message: r.message,
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount), paymentTerms: r.payment_terms,
    decisionReason: r.decision_reason, paidAt: r.paid_at,
    session: r.session_date ? { date: dateOnly(r.session_date), time: r.session_time, place: r.session_place, note: r.consultant_note } : null,
  };
  if (admin) {
    Object.assign(out, {
      applicantName: r.applicant_name, applicantEmail: r.applicant_email, applicantPhone: r.applicant_phone, organisation: r.organisation,
      isMember: !!r.user_id, userId: r.user_id, decidedAt: r.decided_at, scheduledAt: r.scheduled_at,
    });
  }
  return out;
}

// ---- paying ---------------------------------------------------------------------------------------
const placeholderEmail = (r) => `${String(r.applicant_phone || r.id).replace(/[^a-z0-9]/gi, "")}@${process.env.FARMER_PLACEHOLDER_EMAIL_DOMAIN || "farmers.ephaag.app"}`;

async function openPayment(requestId, net) {
  const { rows } = await pool.query(
    `SELECT * FROM gateway_payments WHERE type = 'consultancy' AND subject_id = $1 AND status IN ('initiated','pending') AND net_amount = $2 AND authorization_url IS NOT NULL AND created_at > now() - interval '1 hour' ORDER BY created_at DESC LIMIT 1`,
    [requestId, net]);
  const p = rows[0];
  return p ? { reference: p.reference, authorizationUrl: p.authorization_url, amount: Number(p.net_amount), fee: Number(p.fee_amount), total: Number(p.gross_amount), reused: true } : null;
}

/** Money may already have arrived for an open payment: ask Paystack and apply it first. */
export async function settleOpen(requestId) {
  const { rows } = await pool.query(`SELECT reference FROM gateway_payments WHERE type = 'consultancy' AND subject_id = $1 AND status IN ('initiated','pending')`, [requestId]);
  for (const r of rows) await verifyAndSettle(r.reference).catch(() => null);
}

export async function startConsultancyPayment(token) {
  if (!paystackConfigured()) throw httpError("Online payment is unavailable right now. Please try again later.", 503);
  const { rows } = await pool.query(`SELECT * FROM consultancy_requests WHERE access_token = $1`, [String(token || "")]);
  const r = rows[0];
  if (!r) throw httpError("Request not found", 404);
  await settleOpen(r.id);
  const { rows: again } = await pool.query(`SELECT * FROM consultancy_requests WHERE id = $1`, [r.id]);
  const req = again[0];
  if (req.status !== "awaiting_payment") {
    const why = ["ready", "scheduled", "completed"].includes(req.status) ? "This request has already been paid." : "This request is not waiting for a payment.";
    throw httpError(why, 409);
  }
  const net = Number(req.amount);
  const reuse = await openPayment(req.id, net);
  if (reuse) return reuse;
  const payment = await createPayment({
    type: "consultancy", userId: req.user_id, subjectId: req.id, netAmount: net,
    meta: { requestReference: req.reference, contactName: req.applicant_name, contactEmail: req.applicant_email, contactPhone: req.applicant_phone },
  });
  const started = await startCheckout(payment, { email: req.applicant_email || placeholderEmail(req), returnPath: `/consultancy/request/${req.access_token}` });
  return { reference: started.reference, authorizationUrl: started.authorization_url, amount: Number(started.net_amount), fee: Number(started.fee_amount), total: Number(started.gross_amount) };
}

// What a verified Paystack payment means for a consultancy request.
registerPaymentType("consultancy", {
  async apply(gp, client) {
    const { rows } = await client.query(`SELECT * FROM consultancy_requests WHERE id = $1 FOR UPDATE`, [gp.subject_id]);
    const r = rows[0];
    if (!r) return { refuse: { reason: "purchase_missing" } };
    if (["ready", "scheduled", "completed"].includes(r.status)) return { refuse: { reason: "duplicate_payment" } };
    if (r.status !== "awaiting_payment") return { refuse: { reason: "payment_closed" } };
    await client.query(`UPDATE consultancy_requests SET status = 'ready', paid_at = now(), paid_payment_id = $2, updated_at = now() WHERE id = $1`, [r.id, gp.id]);
    // Finance income is the consultancy fee only; the processing fee goes to Paystack.
    await client.query(
      `INSERT INTO finance_income (reference, source, category, amount, description, received_from)
       VALUES ($1, 'customer_payment', 'Consultancy fee', $2, $3, $4)`,
      [generateReference("INC"), gp.net_amount, `Consultancy fee ${r.reference} (${gp.reference})`, r.applicant_name || "Consultancy client"]);
    return {
      after: async () => {
        await notifyAddress(who(r), "consultancy_receipt", {
          reference: r.reference, amount: Number(gp.net_amount), fee: Number(gp.fee_amount), totalCharged: Number(gp.gross_amount), paymentReference: gp.reference,
        });
        await notifyFinance("payment_finance_notice", {
          typeLabel: TYPE_LABEL.consultancy, payer: r.applicant_name || "client", netAmount: Number(gp.net_amount), fee: Number(gp.fee_amount),
          grossAmount: Number(gp.gross_amount), reference: gp.reference, review: "",
        });
        const { notifyAdmins } = await import("./messaging.js");
        await notifyAdmins("consultancy_admin_ready", { reference: r.reference, applicant: r.applicant_name || "A client" });
      },
    };
  },
});
