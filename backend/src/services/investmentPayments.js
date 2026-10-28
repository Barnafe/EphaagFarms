// Phase 4: every investor payment goes through Paystack (or, as a recorded exception, an admin
// records one received offline). The one-time (bulk) payment, or the first month of a monthly plan,
// activates the investment; later months are paid with "Pay now" or charged to the saved card.
import { pool, detached } from "../db/pool.js";
import { sendMail } from "../utils/email.js";
import { notifyUser } from "./messaging.js";
import { notifyAttention } from "../jobs/alerts.js";
import { paystackConfigured, calculateFee, getFeeConfig, chargeAuthorization } from "./paystack.js";
import { createPayment, startCheckout, settlePayment, verifyAndSettle, registerPaymentType, notifyFinance, TYPE_LABEL } from "./payments.js";
import "./paymentTemplates.js";

export const ROI_SCHEDULE = { monthly: [10, 20, 30, 40, 50], bulk: [20, 25, 30, 35, 50] };

const httpError = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

function paystackEmailFor(user) {
  if (user.email) return user.email;
  const domain = process.env.FARMER_PLACEHOLDER_EMAIL_DOMAIN || "farmers.ephaag.app";
  return `${String(user.phone || user.id).replace(/[^a-z0-9]/gi, "")}@${domain}`;
}

// ---------------------------------------------------------------------------
// What does this investor owe right now?
// ---------------------------------------------------------------------------
/** { kind, subjectId, net, dueDate?, rowId? } or { none: reason } */
export async function currentObligation(runner, application, { lock = false } = {}) {
  if (application.status === "awaiting_payment") {
    return { kind: "activation", subjectId: application.id, net: Number(application.amount) };
  }
  if (application.status === "active" && application.plan_type === "monthly") {
    const { rows } = await runner.query(
      `SELECT *, to_char(due_date, 'YYYY-MM-DD') AS due_text FROM investment_payments
        WHERE application_id = $1 AND status = 'due' ORDER BY due_date ASC LIMIT 1 ${lock ? "FOR UPDATE" : ""}`, [application.id]);
    if (rows[0]) return { kind: "monthly", subjectId: rows[0].id, rowId: rows[0].id, net: Number(application.amount), dueDate: rows[0].due_text, row: rows[0] };
    return { none: "Nothing is due on this plan right now." };
  }
  if (application.status === "active") return { none: "This investment is already paid in full." };
  return { none: "This investment is not waiting for a payment." };
}

export async function quote(net) {
  const { fee, gross } = calculateFee(net, await getFeeConfig());
  return { amount: Number(net), fee, total: gross };
}

// ---------------------------------------------------------------------------
// What a verified payment means
// ---------------------------------------------------------------------------
async function saveCard(client, app, authorization, email) {
  if (app.payment_mode !== "auto" || !authorization?.reusable || !authorization?.authorization_code) return;
  await client.query(
    `UPDATE investment_applications SET card_auth_code = $2, card_last4 = $3, card_brand = $4, card_email = $5, card_saved_at = now() WHERE id = $1`,
    [app.id, authorization.authorization_code, authorization.last4 || null, String(authorization.card_type || "card").trim() || "card", email || null]);
}

async function activateInTx(client, app, { reference, authorization, email, via = "paystack" }) {
  const { rows } = await client.query(
    `UPDATE investment_applications SET status = 'active', activated_at = now(), activation_reference = $2 WHERE id = $1 RETURNING *`, [app.id, reference]);
  const schedule = ROI_SCHEDULE[app.plan_type];
  for (let i = 0; i < app.duration_years && i < schedule.length; i++) {
    const roiAmount = (Number(app.amount) * schedule[i]) / 100;
    await client.query(
      `INSERT INTO roi_records (application_id, year_number, roi_percent, roi_amount, penalty_percent, net_payout) VALUES ($1,$2,$3,$4,0,$4)`,
      [app.id, i + 1, schedule[i], roiAmount]);
  }
  if (app.plan_type === "monthly") {
    // Month 1 is the activation payment itself; the next month falls due one month from today.
    await client.query(
      `INSERT INTO investment_payments (application_id, amount, due_date, paid_date, status, gateway_reference, paid_via)
       VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,'on_time',$3,$4)`, [app.id, app.amount, reference, via]);
    if (app.duration_years * 12 > 1) {
      await client.query(
        `INSERT INTO investment_payments (application_id, amount, due_date, status) VALUES ($1,$2,CURRENT_DATE + INTERVAL '1 month','due')`, [app.id, app.amount]);
    }
  }
  await saveCard(client, rows[0], authorization, email);
  return rows[0];
}

async function payMonthInTx(client, app, row, { reference, via, authorization, email }) {
  const { rows } = await client.query(
    `UPDATE investment_payments SET paid_date = CURRENT_DATE, status = CASE WHEN CURRENT_DATE <= due_date THEN 'on_time' ELSE 'late' END,
            gateway_reference = $2, paid_via = $3, amount = $4 WHERE id = $1 RETURNING *`, [row.id, reference, via, app.amount]);
  const { rows: c } = await client.query(`SELECT COUNT(*)::int AS n FROM investment_payments WHERE application_id = $1`, [app.id]);
  if (c[0].n < app.duration_years * 12) {
    await client.query(
      `INSERT INTO investment_payments (application_id, amount, due_date, status) VALUES ($1,$2,$3::date + INTERVAL '1 month','due')`, [app.id, app.amount, row.due_date]);
  }
  await saveCard(client, app, authorization, email);
  return rows[0];
}

async function afterPaid(gp, app, { kind, dueDate, autoCharged = false, offline = false }) {
  await notifyUser(app.investor_id, "investment_receipt", {
    reference: app.reference, kind, planType: app.plan_type, dueDate: dueDate || "", amount: Number(gp.net_amount), fee: Number(gp.fee_amount || 0),
    totalCharged: Number(gp.gross_amount), paymentReference: gp.reference, autoCharged,
  });
  if (kind === "activation") {
    const { rows } = await pool.query(`SELECT name, email FROM users WHERE id = $1`, [app.investor_id]);
    const u = rows[0];
    if (u?.email) {
      sendMail({
        to: u.email, subject: "Congratulations — you're now an EPHAAG Farms investor!",
        html: `<p>Hi ${u.name},</p><p>Congratulations! Your payment has been received and your investment (<strong>${app.reference}</strong>) is now active.</p>
<p>You can track your ROI schedule and (on the monthly plan) your upcoming payments from your Investor Room.</p><p>Welcome aboard.</p><p>— EPHAAG Farms</p>`,
      });
    }
  }
  const { rows: inv } = await pool.query(`SELECT name FROM users WHERE id = $1`, [app.investor_id]);
  await notifyFinance("payment_finance_notice", {
    typeLabel: TYPE_LABEL.investment, payer: inv[0]?.name || "", netAmount: Number(gp.net_amount), fee: Number(gp.fee_amount || 0),
    grossAmount: Number(gp.gross_amount), reference: gp.reference, review: offline ? "recorded by hand without Paystack" : "",
  });
}

registerPaymentType("investment", {
  async apply(gp, client, data) {
    const meta = gp.meta || {};
    const { rows: ar } = await client.query(`SELECT * FROM investment_applications WHERE id = $1 FOR UPDATE`, [meta.applicationId]);
    const app = ar[0];
    if (!app) return { refuse: { reason: "purchase_missing" } };
    const email = data?.customer?.email || null;

    if (meta.kind === "activation") {
      if (app.activation_reference === gp.reference) return {};            // already applied (never twice)
      if (app.status === "active") return { refuse: { reason: "duplicate_payment" } };
      if (app.status !== "awaiting_payment") return { refuse: { reason: "investment_closed" } };
      await activateInTx(client, app, { reference: gp.reference, authorization: data?.authorization, email });
      return { after: () => afterPaid(gp, app, { kind: "activation" }) };
    }

    const { rows: rr } = await client.query(`SELECT *, to_char(due_date,'YYYY-MM-DD') AS due_text FROM investment_payments WHERE id = $1 FOR UPDATE`, [meta.rowId]);
    const row = rr[0];
    if (!row) return { refuse: { reason: "purchase_missing" } };
    if (row.gateway_reference === gp.reference) return {};
    if (row.status !== "due") return { refuse: { reason: "duplicate_payment" } };
    if (app.status !== "active") return { refuse: { reason: "investment_closed" } };
    await payMonthInTx(client, app, row, { reference: gp.reference, via: meta.auto ? "auto_charge" : "paystack", authorization: data?.authorization, email });
    return { after: () => afterPaid(gp, app, { kind: "monthly", dueDate: row.due_text, autoCharged: !!meta.auto }) };
  },
});

// ---------------------------------------------------------------------------
// Investor: start paying ("Pay now" / pay to activate)
// ---------------------------------------------------------------------------
export async function startInvestmentPayment(user) {
  if (!paystackConfigured()) throw httpError("Online payment is unavailable right now. Please try again later.", 503);
  const { rows: ar } = await pool.query(
    `SELECT * FROM investment_applications WHERE investor_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [user.id]);
  const app = ar[0];
  if (!app) throw httpError("No investment application found", 404);
  const ob = await currentObligation(pool, app);
  if (ob.none) throw httpError(ob.none, 409);

  // Money may already have arrived for this exact payment (closed tab, late webhook): find it first.
  const { rows: open } = await pool.query(
    `SELECT * FROM gateway_payments WHERE type = 'investment' AND subject_id = $1 AND status IN ('initiated','pending') ORDER BY created_at DESC`, [ob.subjectId]);
  for (const p of open) await verifyAndSettle(p.reference).catch(() => null);
  const { rows: again } = await pool.query(`SELECT * FROM investment_applications WHERE id = $1`, [app.id]);
  const ob2 = await currentObligation(pool, again[0]);
  if (ob2.none || ob2.subjectId !== ob.subjectId) return { alreadyPaid: true };

  const { rows: stillOpen } = await pool.query(
    `SELECT * FROM gateway_payments WHERE type = 'investment' AND subject_id = $1 AND status IN ('initiated','pending') AND authorization_url IS NOT NULL
        AND created_at > now() - interval '1 hour' ORDER BY created_at DESC LIMIT 1`, [ob.subjectId]);
  if (stillOpen[0]) return { payment: stillOpen[0], reused: true };

  const { rows: u } = await pool.query(`SELECT id, email, phone FROM users WHERE id = $1`, [user.id]);
  const payment = await createPayment({ type: "investment", userId: user.id, subjectId: ob.subjectId, netAmount: ob.net, meta: { kind: ob.kind, applicationId: app.id, rowId: ob.rowId || null } });
  const started = await startCheckout(payment, { email: paystackEmailFor(u[0] || {}), returnPath: `/dashboard/investor?investmentPayment=${encodeURIComponent(payment.reference)}` });
  return { payment: started };
}

// ---------------------------------------------------------------------------
// Scheduled: charge saved cards on the due date. One attempt only; a decline is never retried.
// ---------------------------------------------------------------------------
export async function runInvestmentAutoCharge() {
  const { rows } = await pool.query(
    `SELECT ip.id AS row_id, ip.amount, to_char(ip.due_date,'YYYY-MM-DD') AS due_text, a.id AS app_id, a.reference AS app_ref, a.investor_id,
            a.card_auth_code, a.card_email, a.amount AS agreed, u.name AS investor_name
       FROM investment_payments ip
       JOIN investment_applications a ON a.id = ip.application_id
       JOIN users u ON u.id = a.investor_id
      WHERE ip.status = 'due' AND ip.due_date <= CURRENT_DATE AND ip.auto_charge_attempted_at IS NULL
        AND a.status = 'active' AND a.payment_mode = 'auto'
      ORDER BY ip.due_date ASC LIMIT 200`);
  const out = { checked: rows.length, charged: 0, failed: 0, skipped: 0, unreachable: 0 };

  const fail = async (r, error) => {
    await pool.query(`UPDATE investment_payments SET auto_charge_attempted_at = now(), auto_charge_error = $2 WHERE id = $1`, [r.row_id, error]);
    const d = { reference: r.app_ref, amount: Number(r.agreed), dueDate: r.due_text, error };
    await notifyUser(r.investor_id, "investment_auto_charge_failed", d, { allChannels: true });
    await notifyFinance("investment_auto_charge_failed_finance", { ...d, investor: r.investor_name });
    out.failed++;
  };

  for (const r of rows) {
    // The investor is already paying by hand for this month: leave it to them.
    const { rowCount: busy } = await pool.query(
      `SELECT 1 FROM gateway_payments WHERE type = 'investment' AND subject_id = $1 AND status IN ('initiated','pending') AND created_at > now() - interval '1 hour'`, [r.row_id]);
    if (busy) { out.skipped++; continue; }
    if (!r.card_auth_code) { await fail(r, "no saved card on file"); continue; }

    const payment = await createPayment({ type: "investment", userId: r.investor_id, subjectId: r.row_id, netAmount: Number(r.agreed), meta: { kind: "monthly", applicationId: r.app_id, rowId: r.row_id, auto: true } });
    let data;
    try {
      data = await chargeAuthorization({ email: r.card_email || "investor@ephaag.app", amountNaira: payment.gross_amount, reference: payment.reference, authorizationCode: r.card_auth_code, metadata: { type: "investment", subject_id: r.row_id } });
    } catch {
      // Paystack could not be reached: that is not a decline. Close this attempt and try again on the next run.
      await pool.query(`UPDATE gateway_payments SET status = 'abandoned', updated_at = now() WHERE id = $1`, [payment.id]);
      out.unreachable++; continue;
    }
    await pool.query(`UPDATE investment_payments SET auto_charge_attempted_at = now() WHERE id = $1`, [r.row_id]);
    if (data.status === "success") {
      const res = await settlePayment(payment.reference, data, { source: "auto_charge" });
      if (res.outcome === "success") out.charged++; else await fail(r, "the charge could not be applied");
    } else if (["pending", "ongoing", "queued", "processing"].includes(data.status)) {
      await pool.query(`UPDATE gateway_payments SET status = 'pending', updated_at = now() WHERE id = $1`, [payment.id]); // the re-check job settles it
    } else {
      await pool.query(`UPDATE gateway_payments SET status = 'failed', updated_at = now() WHERE id = $1`, [payment.id]);
      await fail(r, data.gateway_response || "the card was declined");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Admin exception: a payment received outside Paystack (bank transfer / cash). A written reason is
// required, it is flagged for review and every admin is told.
// ---------------------------------------------------------------------------
export async function recordOfflinePayment(applicationId, admin, reason) {
  const text = String(reason || "").trim();
  if (text.length < 5) throw httpError("Please write the reason (for example the bank transfer details).", 400);
  const client = await pool.connect();
  let gp, app, ob;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM investment_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
    app = rows[0];
    if (!app) throw httpError("Application not found", 404);
    ob = await currentObligation(client, app, { lock: true });
    if (ob.none) throw httpError(ob.none, 409);
    const created = await createPayment({ client, type: "investment", userId: app.investor_id, subjectId: ob.subjectId, netAmount: ob.net,
      meta: { kind: ob.kind, applicationId: app.id, rowId: ob.rowId || null, offline: true, reason: text, recordedBy: admin.id } });
    const { rows: g } = await client.query(
      `UPDATE gateway_payments SET status = 'success', provider = 'offline', fee_amount = 0, gross_amount = net_amount, paid_amount = net_amount, paid_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`, [created.id]);
    gp = g[0];
    await client.query(`INSERT INTO payment_flags (payment_id, kind, reason, detail) VALUES ($1,'review','offline_record',$2)`, [gp.id, text]);
    if (ob.kind === "activation") await activateInTx(client, app, { reference: gp.reference, via: "offline" });
    else await payMonthInTx(client, app, ob.row, { reference: gp.reference, via: "offline" });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  detached(() => afterPaid(gp, app, { kind: ob.kind, dueDate: ob.dueDate, offline: true }).catch((e) => console.error("[investment] receipt failed:", e.message)));
  const { rows: inv } = await pool.query(`SELECT name FROM users WHERE id = $1`, [app.investor_id]);
  detached(() => notifyAttention("investment_offline_notice", { investor: inv[0]?.name || "", reference: app.reference, amount: Number(gp.net_amount), reason: text }, null));
  return { reference: gp.reference, kind: ob.kind };
}
