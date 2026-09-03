import path from "node:path";
import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";
import { AGREEMENTS_DIR } from "../middleware/upload.js";

// ROI schedule matches the delivered investment proposal exactly — same
// numbers the frontend's PlanApplicationForm shows before submitting.
const ROI_SCHEDULE = {
  monthly: [10, 20, 30, 40, 50],
  bulk: [20, 25, 30, 35, 50],
};

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
  };
}

async function getInvestorEmail(investorId) {
  const { rows } = await pool.query(`SELECT name, email FROM users WHERE id = $1`, [investorId]);
  return rows[0];
}

// --- Investor: submit a plan application ------------------------------

export async function apply(req, res) {
  const { planType, amount, durationYears, paymentMode } = req.body;

  if (!["monthly", "bulk"].includes(planType)) {
    return res.status(400).json({ error: "planType must be 'monthly' or 'bulk'" });
  }
  const minAmount = planType === "monthly" ? 5000 : 100000;
  if (!amount || Number(amount) < minAmount) {
    return res.status(400).json({ error: `amount must be at least ${minAmount}` });
  }
  if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 5) {
    return res.status(400).json({ error: "durationYears must be between 1 and 5" });
  }

  const reference = generateReference(REF_PREFIX.investment);
  const { rows } = await pool.query(
    `INSERT INTO investment_applications
       (reference, investor_id, plan_type, amount, duration_years, payment_mode)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [reference, req.user.id, planType, amount, durationYears, paymentMode || "auto"]
  );
  res.status(201).json({ application: mapApplication(rows[0]) });
}

// --- Investor: my current application (most recent) --------------------
// Also attaches nextDueDate for active monthly plans, for the countdown UI.

export async function myApplication(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM investment_applications WHERE investor_id = $1
     ORDER BY id DESC LIMIT 1`,
    [req.user.id]
  );
  const application = mapApplication(rows[0]);

  if (application && application.status === "active" && application.planType === "monthly") {
    const { rows: dueRows } = await pool.query(
      `SELECT due_date FROM investment_payments
       WHERE application_id = $1 AND status = 'due' ORDER BY due_date ASC LIMIT 1`,
      [application.id]
    );
    application.nextDueDate = dueRows[0]?.due_date || null;
  }

  res.json({ application });
}

// --- Investor: payment log (monthly plans only) -------------------------

export async function myPayments(req, res) {
  const { rows: appRows } = await pool.query(
    `SELECT id FROM investment_applications WHERE investor_id = $1 ORDER BY id DESC LIMIT 1`,
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
    })),
  });
}

// Manual payment logging — matches against the oldest outstanding 'due'
// record (created on activation / after each prior payment) so the
// countdown and reminder system stay in sync. Falls back to a one-off
// log entry if there's no due schedule (e.g. a bulk plan).
export async function logPayment(req, res) {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "amount is required" });
  }

  const { rows: appRows } = await pool.query(
    `SELECT id, payment_mode, plan_type FROM investment_applications
     WHERE investor_id = $1 ORDER BY id DESC LIMIT 1`,
    [req.user.id]
  );
  const application = appRows[0];
  if (!application) return res.status(404).json({ error: "No investment application found" });
  if (application.payment_mode !== "manual") {
    return res.status(400).json({ error: "This plan is auto-charged — no manual logging needed" });
  }

  const { rows: dueRows } = await pool.query(
    `SELECT * FROM investment_payments WHERE application_id = $1 AND status = 'due'
     ORDER BY due_date ASC LIMIT 1`,
    [application.id]
  );
  const due = dueRows[0];

  if (due) {
    const status = new Date() <= new Date(due.due_date) ? "on_time" : "late";
    const { rows: updated } = await pool.query(
      `UPDATE investment_payments SET amount = $1, paid_date = CURRENT_DATE, status = $2
       WHERE id = $3 RETURNING *`,
      [amount, status, due.id]
    );

    // Roll the next due date forward a month, for monthly plans.
    if (application.plan_type === "monthly") {
      await pool.query(
        `INSERT INTO investment_payments (application_id, amount, due_date, status)
         VALUES ($1, $2, $3::date + INTERVAL '1 month', 'due')`,
        [application.id, amount, due.due_date]
      );
    }

    const p = updated[0];
    return res.status(201).json({ payment: { id: p.id, date: p.paid_date, amount: Number(p.amount), status: p.status } });
  }

  const { rows } = await pool.query(
    `INSERT INTO investment_payments (application_id, amount, paid_date, status)
     VALUES ($1, $2, CURRENT_DATE, 'on_time') RETURNING *`,
    [application.id, amount]
  );
  const p = rows[0];
  res.status(201).json({ payment: { id: p.id, date: p.paid_date, amount: Number(p.amount), status: p.status } });
}

// --- Investor: ROI breakdown --------------------------------------------

export async function myRoi(req, res) {
  const { rows: appRows } = await pool.query(
    `SELECT id FROM investment_applications WHERE investor_id = $1 ORDER BY id DESC LIMIT 1`,
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

  const filename = fileUrl.split("/").pop();
  res.sendFile(path.join(AGREEMENTS_DIR, filename));
}

// --- Admin (Finance): application review --------------------------------
// Lists everything mid-flow: 'submitted' (Finance's first look),
// 'agreement_pending' (waiting on the investor — shown read-only so
// Finance can see who's outstanding), and 'agreement_review' (investor
// uploaded their signed copy — needs Finance's final decision).

export async function listApplications(req, res) {
  const { rows } = await pool.query(
    `SELECT a.*, u.name AS investor_name FROM investment_applications a
     JOIN users u ON u.id = a.investor_id
     WHERE a.status IN ('submitted', 'agreement_pending', 'agreement_review')
     ORDER BY a.id ASC`
  );
  res.json({
    applications: rows.map((a) => ({ ...mapApplication(a), investorName: a.investor_name })),
  });
}

// body: { decision: 'approve' | 'reject' }
// From 'submitted': approve -> agreement_pending (emails the agreement
//   template to the investor, with instructions to sign and upload it back).
//   reject -> rejected.
// From 'agreement_review': approve -> active (generates the ROI schedule,
//   sets up the first payment due-date for monthly plans, emails a
//   congratulations confirmation). reject -> rejected.
// 'agreement_pending' has no Finance decision to make — it's waiting on
//   the investor to upload — but Finance can still reject a stale one.
export async function decideApplication(req, res) {
  const { id } = req.params;
  const { decision } = req.body;
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
  }

  const client = await pool.connect();
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

    const approveRoute = { submitted: "agreement_pending", agreement_review: "active" };
    let nextStatus;
    if (decision === "reject") {
      if (!["submitted", "agreement_pending", "agreement_review"].includes(application.status)) {
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

    if (nextStatus === "active") {
      const schedule = ROI_SCHEDULE[application.plan_type];
      for (let i = 0; i < application.duration_years && i < schedule.length; i++) {
        const roiPercent = schedule[i];
        const roiAmount = (Number(application.amount) * roiPercent) / 100;
        await client.query(
          `INSERT INTO roi_records (application_id, year_number, roi_percent, roi_amount, penalty_percent, net_payout)
           VALUES ($1, $2, $3, $4, 0, $4)`,
          [id, i + 1, roiPercent, roiAmount]
        );
      }

      // Monthly plans get a recurring due-date schedule starting one
      // month from activation, which drives the countdown UI and the
      // day-before reminder email.
      if (application.plan_type === "monthly") {
        await client.query(
          `INSERT INTO investment_payments (application_id, amount, due_date, status)
           VALUES ($1, $2, CURRENT_DATE + INTERVAL '1 month', 'due')`,
          [id, application.amount]
        );
      }
    }

    await client.query("COMMIT");

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
    } else if (nextStatus === "active" && investor?.email) {
      sendMail({
        to: investor.email,
        subject: `Congratulations — you're now an EPHAAG Farms investor!`,
        html: `
          <p>Hi ${investor.name},</p>
          <p>Congratulations! Your signed agreement has been reviewed and your investment
          (<strong>${application.reference}</strong>) is now active.</p>
          <p>You can track your ROI schedule and (if on the monthly plan) your upcoming
          payment dates from your Investor Room dashboard from now on.</p>
          <p>Welcome aboard — we're glad to have you with us.</p>
          <p>— EPHAAG Farms</p>
        `,
      });
    }

    res.json({ application: mapApplication(updated[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not update application" });
  } finally {
    client.release();
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
    `SELECT ip.*, a.reference, a.investor_id, u.name AS investor_name, u.email AS investor_email
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
