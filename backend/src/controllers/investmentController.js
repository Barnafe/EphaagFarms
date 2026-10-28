import path from "node:path";
import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";
import { AGREEMENTS_DIR } from "../middleware/upload.js";
import { sendFileRef, refFromUrl } from "../utils/fileRefs.js";
import { notifyUser } from "../services/messaging.js";
import { ROI_SCHEDULE, currentObligation, quote, startInvestmentPayment, runInvestmentAutoCharge, recordOfflinePayment } from "../services/investmentPayments.js";

// The ROI schedule (see services/investmentPayments.js) matches the delivered investment proposal exactly.
const PARTNER_THRESHOLD = { amount: 1000000, altAmount: 250000, altReferrals: 25 };

const AGREEMENT_TEMPLATE_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname), "..", "..", "assets", "investment-agreement-template.pdf"
);

function mapApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    planType: row.plan_type,
    amount: Number(row.amount),
    durationYears: row.duration_years,
    paymentMode: row.payment_mode,
    hasAgreementFile: !!row.agreement_file_url,
    savedCard: row.card_auth_code ? { last4: row.card_last4, brand: row.card_brand } : null,
  };
}

async function getInvestorEmail(investorId) {
  const { rows } = await pool.query(`SELECT name, email FROM users WHERE id = $1`, [investorId]);
  return rows[0];
}

// --- Investor: submit a plan application ------------------------------

const PAYMENT_MODES = ["auto", "manual"];
const OPEN_APPLICATION_STATUSES = ["submitted", "agreement_pending", "agreement_review", "awaiting_payment", "active"];

export async function apply(req, res) {
  const { planType, durationYears: rawDuration, paymentMode } = req.body;
  const amount = Number(req.body.amount);
  const durationYears = Number(rawDuration);

  if (!["monthly", "bulk"].includes(planType)) {
    return res.status(400).json({ error: "planType must be 'monthly' or 'bulk'" });
  }
  const minAmount = planType === "monthly" ? 5000 : 100000;
  if (!Number.isFinite(amount) || amount < minAmount) {
    return res.status(400).json({ error: `amount must be a number of at least ${minAmount}` });
  }
  if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 5) {
    return res.status(400).json({ error: "durationYears must be between 1 and 5" });
  }

  // A bad/unknown paymentMode used to reach the database CHECK constraint
  // and come back as a generic 500 ("Something went wrong") — reject it
  // up front with a clear message instead. A bulk plan is a single
  // payment with no monthly schedule, so a payment mode means nothing
  // there: it's always stored as the default, whatever the client sent
  // (the form could carry over a stale "manual" from the monthly view).
  let mode = "auto";
  if (planType === "monthly" && paymentMode !== undefined && paymentMode !== null && paymentMode !== "") {
    if (!PAYMENT_MODES.includes(paymentMode)) {
      return res.status(400).json({ error: "paymentMode must be 'auto' or 'manual'" });
    }
    mode = paymentMode;
  }

  // One live application at a time. Everything else in this module
  // (payment log, ROI breakdown, due-date countdown) reads the investor's
  // MOST RECENT application, so a second submission while one is already
  // running would silently hide the first one's payment schedule.
  const { rows: openRows } = await pool.query(
    `SELECT reference, status FROM investment_applications
     WHERE investor_id = $1 AND status = ANY($2::text[]) LIMIT 1`,
    [req.user.id, OPEN_APPLICATION_STATUSES]
  );
  if (openRows[0]) {
    return res.status(409).json({
      error: `You already have an application in progress (${openRows[0].reference}). Wait for it to be decided or completed before applying again.`,
    });
  }

  const reference = generateReference(REF_PREFIX.investment);
  const { rows } = await pool.query(
    `INSERT INTO investment_applications
       (reference, investor_id, plan_type, amount, duration_years, payment_mode)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [reference, req.user.id, planType, amount, durationYears, mode]
  );
  res.status(201).json({ application: mapApplication(rows[0]) });
}

// --- Investor: my current application (most recent) --------------------
// Also attaches nextDueDate for active monthly plans, for the countdown UI.

export async function myApplication(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM investment_applications WHERE investor_id = $1
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [req.user.id]
  );
  const application = mapApplication(rows[0]);

  if (rows[0]) {
    const ob = await currentObligation(pool, rows[0]);
    if (!ob.none) {
      application.obligation = { kind: ob.kind, dueDate: ob.dueDate || null, ...(await quote(ob.net)) };
      if (ob.row?.auto_charge_error) application.autoChargeFailed = { error: ob.row.auto_charge_error, at: ob.row.auto_charge_attempted_at };
      if (ob.kind === "monthly") application.nextDueDate = ob.dueDate;
    }
  }

  res.json({ application });
}

// --- Investor: payment log (monthly plans only) -------------------------

export async function myPayments(req, res) {
  const { rows: appRows } = await pool.query(
    `SELECT id FROM investment_applications WHERE investor_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [req.user.id]
  );
  if (!appRows[0]) return res.json({ payments: [] });

  const { rows } = await pool.query(
    `SELECT * FROM investment_payments WHERE application_id = $1
     ORDER BY COALESCE(paid_date, due_date) ASC`,
    [appRows[0].id]
  );
  res.json({
    payments: rows.map((p) => ({
      id: p.id,
      dueDate: p.due_date,
      date: p.paid_date,
      amount: Number(p.amount),
      status: p.status,
      paidVia: p.paid_via || null,
    })),
  });
}

// There is no typed-in payment log any more: every payment goes through Paystack (see below).
export async function logPayment(req, res) {
  res.status(410).json({ error: "Payments are now made online. Use Pay now in your Investor Room." });
}

// POST /api/investments/me/pay — start paying what is owed right now (to activate, or the month due).
export async function payNow(req, res) {
  const r = await startInvestmentPayment(req.user);
  if (r.alreadyPaid) return res.json({ alreadyPaid: true });
  res.json({ payment: { reference: r.payment.reference, authorizationUrl: r.payment.authorization_url, amount: Number(r.payment.net_amount), fee: Number(r.payment.fee_amount), total: Number(r.payment.gross_amount) } });
}

// PATCH /api/investments/me/payment-mode { paymentMode: "auto" | "manual" } — monthly plans only.
export async function setPaymentMode(req, res) {
  const mode = req.body?.paymentMode;
  if (!PAYMENT_MODES.includes(mode)) return res.status(400).json({ error: "paymentMode must be 'auto' or 'manual'" });
  const { rows } = await pool.query(
    `SELECT * FROM investment_applications WHERE investor_id = $1 AND status IN ('awaiting_payment','active') ORDER BY created_at DESC LIMIT 1`, [req.user.id]);
  const app = rows[0];
  if (!app) return res.status(404).json({ error: "No investment found" });
  if (app.plan_type !== "monthly") return res.status(400).json({ error: "Only monthly plans have a payment mode" });
  const { rows: u } = await pool.query(
    `UPDATE investment_applications SET payment_mode = $2 WHERE id = $1 RETURNING *`, [app.id, mode]);
  res.json({ application: mapApplication(u[0]), needsCard: mode === "auto" && !u[0].card_auth_code });
}

// DELETE /api/investments/me/card — forget the saved card; the plan goes back to Pay now.
export async function removeCard(req, res) {
  const { rows } = await pool.query(
    `UPDATE investment_applications SET card_auth_code = NULL, card_last4 = NULL, card_brand = NULL, card_email = NULL, card_saved_at = NULL, payment_mode = 'manual'
      WHERE id = (SELECT id FROM investment_applications WHERE investor_id = $1 AND status IN ('awaiting_payment','active') ORDER BY created_at DESC LIMIT 1) RETURNING *`, [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: "No investment found" });
  res.json({ application: mapApplication(rows[0]) });
}

// POST /api/investments/applications/:id/record-offline { reason } — admin exception (money received outside Paystack).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function recordOffline(req, res) {
  if (!UUID_RE.test(String(req.params.id))) return res.status(404).json({ error: "Application not found" });
  const r = await recordOfflinePayment(req.params.id, req.user, req.body?.reason);
  res.status(201).json({ recorded: r });
}

export async function runAutoChargeNow(req, res) {
  res.json(await runInvestmentAutoCharge());
}

// --- Investor: ROI breakdown --------------------------------------------

export async function myRoi(req, res) {
  const { rows: appRows } = await pool.query(
    `SELECT id FROM investment_applications WHERE investor_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [req.user.id]
  );
  if (!appRows[0]) return res.json({ records: [] });

  const { rows } = await pool.query(
    `SELECT * FROM roi_records WHERE application_id = $1 ORDER BY year_number ASC`,
    [appRows[0].id]
  );
  res.json({
    records: rows.map((r) => ({
      year: r.year_number,
      roiPercent: Number(r.roi_percent),
      penaltyPercent: Number(r.penalty_percent),
      netPayout: Number(r.net_payout),
      adminApproved: r.admin_approved,
    })),
  });
}

// --- Investor: referral summary -----------------------------------------

export async function myReferral(req, res) {
  const { rows: profileRows } = await pool.query(
    `SELECT referral_code, partner_status FROM investor_profiles WHERE user_id = $1`,
    [req.user.id]
  );
  const profile = profileRows[0];
  if (!profile) return res.status(404).json({ error: "Investor profile not found" });

  const { rows: referredRows } = await pool.query(
    `SELECT referred_investor_id FROM referrals WHERE referrer_id = $1`,
    [req.user.id]
  );
  const referredIds = referredRows.map((r) => r.referred_investor_id);

  let totalInvested = 0;
  if (referredIds.length > 0) {
    const { rows: sumRows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM investment_applications
       WHERE investor_id = ANY($1::uuid[]) AND status = 'active'`,
      [referredIds]
    );
    totalInvested = Number(sumRows[0].total);
  }

  res.json({
    referral: {
      code: profile.referral_code,
      referralCount: referredIds.length,
      totalInvested,
      partnerStatus: profile.partner_status,
    },
    threshold: PARTNER_THRESHOLD,
  });
}

// --- Investor: upload signed agreement ----------------------------------
// Only valid while status = 'agreement_pending'. Moves the application to
// 'agreement_review' for Finance's final look.

export async function uploadSignedAgreement(req, res) {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const { rows } = await pool.query(
    `SELECT * FROM investment_applications WHERE id = $1 AND investor_id = $2`,
    [id, req.user.id]
  );
  const application = rows[0];
  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status !== "agreement_pending") {
    return res.status(400).json({ error: "This application isn't awaiting an agreement upload" });
  }

  const fileUrl = `/uploads/agreements/${req.file.filename}`;
  const { rows: updated } = await pool.query(
    `UPDATE investment_applications SET agreement_file_url = $1, status = 'agreement_review'
     WHERE id = $2 RETURNING *`,
    [fileUrl, id]
  );
  res.json({ application: mapApplication(updated[0]) });
}

// --- Admin: download an investor's uploaded signed agreement ------------

export async function downloadAgreement(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT agreement_file_url FROM investment_applications WHERE id = $1`,
    [id]
  );
  const fileUrl = rows[0]?.agreement_file_url;
  if (!fileUrl) return res.status(404).json({ error: "No agreement uploaded for this application" });

  await sendFileRef(res, refFromUrl(fileUrl), { legacyDir: AGREEMENTS_DIR });
}

// --- Admin (Finance): application review --------------------------------
// Lists everything mid-flow (plus active monthly plans, so a payment received outside Paystack can be recorded): 'submitted' (Finance's first look),
// 'agreement_pending' (waiting on the investor — shown read-only so
// Finance can see who's outstanding), and 'agreement_review' (investor
// uploaded their signed copy — needs Finance's final decision).

export async function listApplications(req, res) {
  const { rows } = await pool.query(
    `SELECT a.*, u.name AS investor_name FROM investment_applications a
     JOIN users u ON u.id = a.investor_id
     WHERE a.status IN ('submitted', 'agreement_pending', 'agreement_review', 'awaiting_payment')
        OR (a.status = 'active' AND a.plan_type = 'monthly')
     ORDER BY a.created_at ASC`
  );
  res.json({
    applications: rows.map((a) => ({ ...mapApplication(a), investorName: a.investor_name })),
  });
}

// body: { decision: 'approve' | 'reject' }
// From 'submitted': approve -> agreement_pending (emails the agreement
//   template to the investor, with instructions to sign and upload it back).
//   reject -> rejected.
// From 'agreement_review': approve -> awaiting_payment (the investor then pays online; the verified
//   payment activates the investment, generates the ROI schedule and the monthly due dates).
//   reject -> rejected.
// 'agreement_pending' has no Finance decision to make — it's waiting on
//   the investor to upload — but Finance can still reject a stale one.
export async function decideApplication(req, res) {
  const { id } = req.params;
  const { decision } = req.body;
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
  }

  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM investment_applications WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const application = rows[0];
    if (!application) {
      throw Object.assign(new Error("Application not found"), { status: 404 });
    }

    const approveRoute = { submitted: "agreement_pending", agreement_review: "awaiting_payment" };
    let nextStatus;
    if (decision === "reject") {
      if (!["submitted", "agreement_pending", "agreement_review", "awaiting_payment"].includes(application.status)) {
        throw Object.assign(new Error("Application isn't awaiting a decision"), { status: 400 });
      }
      nextStatus = "rejected";
    } else {
      nextStatus = approveRoute[application.status];
      if (!nextStatus) {
        throw Object.assign(new Error("Application isn't awaiting a decision"), { status: 400 });
      }
    }

    const { rows: updated } = await client.query(
      `UPDATE investment_applications SET status = $1 WHERE id = $2 RETURNING *`,
      [nextStatus, id]
    );

    // Nothing is activated here any more: the investor's online payment activates the investment
    // (see services/investmentPayments.js). A rejected application's unpaid payment pages are closed.
    if (nextStatus === "rejected") {
      await client.query(`UPDATE gateway_payments SET status = 'abandoned', updated_at = now() WHERE type = 'investment' AND meta->>'applicationId' = $1 AND status IN ('initiated','pending')`, [id]);
    }

    await client.query("COMMIT");
    client.release(); // hand the connection back before the notices use the pool
    released = true;

    // Email is intentionally NOT awaited here — sendMail() never throws
    // (it catches its own errors internally), so firing it without
    // blocking the response means a slow or unreachable mail server never
    // delays this admin action. The status change is already committed.
    const investor = await getInvestorEmail(application.investor_id);
    if (nextStatus === "agreement_pending" && investor?.email) {
      sendMail({
        to: investor.email,
        subject: `Your EPHAAG Farms investment agreement — ${application.reference}`,
        html: `
          <p>Hi ${investor.name},</p>
          <p>Good news — Finance has reviewed and approved your investment application
          (<strong>${application.reference}</strong>). The next step is the physical
          agreement.</p>
          <p>Attached is your agreement form. Please:</p>
          <ol>
            <li>Download and print it</li>
            <li>Fill in your details and sign it</li>
            <li>Upload the signed copy back through your Investor Room, against the same
            application reference above</li>
          </ol>
          <p>Once uploaded, Finance will do a final review and confirm your investment.</p>
          <p>— EPHAAG Farms</p>
        `,
        attachments: [{ filename: "investment-agreement.pdf", path: AGREEMENT_TEMPLATE_PATH }],
      });
    }
    if (nextStatus === "awaiting_payment") {
      notifyUser(application.investor_id, "investment_payment_requested", { reference: application.reference, planType: application.plan_type, amount: Number(application.amount) }).catch(() => {});
    }

    res.json({ application: mapApplication(updated[0]) });
  } catch (err) {
    if (!released) await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not update application" });
  } finally {
    if (!released) client.release();
  }
}

// --- Admin (Finance): Partner Investor review ---------------------------

export async function partnerReviews(req, res) {
  const { rows } = await pool.query(
    `SELECT
       u.id AS investor_id, u.name AS investor_name, ip.partner_status,
       COUNT(DISTINCT r.id) AS referral_count,
       COALESCE(SUM(a.amount) FILTER (WHERE a.status = 'active'), 0) AS total_invested
     FROM users u
     JOIN investor_profiles ip ON ip.user_id = u.id
     LEFT JOIN referrals r ON r.referrer_id = u.id
     LEFT JOIN investment_applications a ON a.investor_id = r.referred_investor_id
     WHERE ip.partner_status = 'none'
     GROUP BY u.id, u.name, ip.partner_status`
  );

  const eligible = rows.filter((r) => {
    const total = Number(r.total_invested);
    const count = Number(r.referral_count);
    return total >= PARTNER_THRESHOLD.amount || (total >= PARTNER_THRESHOLD.altAmount && count >= PARTNER_THRESHOLD.altReferrals);
  });

  res.json({
    reviews: eligible.map((r) => ({
      id: r.investor_id,
      investorName: r.investor_name,
      totalInvested: Number(r.total_invested),
      referralCount: Number(r.referral_count),
      status: "pending",
    })),
  });
}

export async function approvePartner(req, res) {
  const { investorId } = req.params;
  const { rows } = await pool.query(
    `UPDATE investor_profiles SET partner_status = 'approved' WHERE user_id = $1 RETURNING *`,
    [investorId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Investor not found" });
  res.json({ investor: rows[0] });
}

// --- Admin (Finance): ROI payout approval --------------------------------

export async function roiPayouts(req, res) {
  const { rows } = await pool.query(
    `SELECT rr.*, u.name AS investor_name FROM roi_records rr
     JOIN investment_applications a ON a.id = rr.application_id
     JOIN users u ON u.id = a.investor_id
     WHERE rr.admin_approved = FALSE
     ORDER BY rr.id ASC`
  );
  res.json({
    payouts: rows.map((r) => ({
      id: r.id,
      investorName: r.investor_name,
      year: r.year_number,
      netPayout: Number(r.net_payout),
      status: "pending",
    })),
  });
}

export async function approveRoiPayout(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE roi_records SET admin_approved = TRUE WHERE id = $1 AND admin_approved = FALSE RETURNING *`,
    [id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Payout not found or already approved" });
  res.json({ roi: rows[0] });
}

// --- Daily reminder job: payments due tomorrow ---------------------------
// Runs on a schedule (see server.js) and is also exposed via a manual
// admin-only trigger endpoint for testing without waiting a real day.

export async function runDueDateReminders() {
  const { rows } = await pool.query(
    `SELECT ip.*, a.reference, a.investor_id, a.payment_mode, a.card_last4, u.name AS investor_name, u.email AS investor_email
     FROM investment_payments ip
     JOIN investment_applications a ON a.id = ip.application_id
     JOIN users u ON u.id = a.investor_id
     WHERE ip.status = 'due' AND ip.reminder_sent = FALSE
       AND ip.due_date = CURRENT_DATE + INTERVAL '1 day'`
  );

  let sent = 0;
  for (const row of rows) {
    if (!row.investor_email) continue;
    await sendMail({
      to: row.investor_email,
      subject: `Reminder — your EPHAAG Farms investment payment is due tomorrow`,
      html: `
        <p>Hi ${row.investor_name},</p>
        <p>This is a reminder that your next payment of
        <strong>₦${Number(row.amount).toLocaleString()}</strong> on investment
        <strong>${row.reference}</strong> is due <strong>tomorrow (${row.due_date})</strong>,
        as agreed and signed in your investment agreement.</p>
        ${row.payment_mode === "auto" && row.card_last4 ? `<p>It will be charged automatically to your saved card ending ${row.card_last4}. Please make sure it has enough funds.</p>` : `<p>Open your Investor Room and use <strong>Pay now</strong>.</p>`}
        <p>Please make your payment on time to stay in good standing. As a reminder, the
        agreed terms note that inconsistent payments carry a penalty of 2% of profit per
        month, so we'd encourage settling this before the due date.</p>
        <p>— EPHAAG Farms</p>
      `,
    });
    await pool.query(`UPDATE investment_payments SET reminder_sent = TRUE WHERE id = $1`, [row.id]);
    sent++;
  }
  return { checked: rows.length, sent };
}

// Admin-only manual trigger, for testing/ops use — same logic the daily
// cron job runs automatically.
export async function runReminderCheckNow(req, res) {
  const result = await runDueDateReminders();
  res.json(result);
}
