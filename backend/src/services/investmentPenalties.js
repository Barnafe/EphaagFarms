// Late monthly investment payments (monthly plans).
//  * Reminder 2 days before the due date, then a notice every day until it is paid (email + SMS).
//  * After the due date the system charges a penalty of 2% of the overdue share's capital, once for
//    each 30 days the month stays unpaid, until the investor pays.
//  * Penalties are never collected separately: they are deducted from the investor's ROI payout
//    when Finance approves it (oldest first; anything the payout cannot cover carries forward).
import { pool } from "../db/pool.js";
import { getSetting } from "../utils/settings.js";
import { notifyUser } from "./messaging.js";
import "./paymentTemplates.js";

export const PENALTY_PERIOD_DAYS = 30;
const money = (n) => Math.round(Number(n) * 100) / 100;

export async function penaltyPercent(runner = pool) {
  const v = Number(await getSetting("investment_late_penalty_percent", 2, runner));
  return Number.isFinite(v) && v >= 0 && v <= 20 ? v : 2;
}

/** Outstanding (charged but not yet deducted) penalties of one application. */
export async function outstandingPenalty(runner, applicationId) {
  const { rows } = await runner.query(
    `SELECT COALESCE(SUM(amount - deducted_amount), 0) AS n FROM investment_late_penalties WHERE application_id = $1`, [applicationId]);
  return money(rows[0].n);
}

/** Charge any penalty period that has newly started. Safe to run any number of times a day. */
export async function runInvestmentLatePenalties() {
  const pct = await penaltyPercent();
  const { rows } = await pool.query(
    `SELECT ip.id AS payment_id, ip.application_id, (CURRENT_DATE - ip.due_date) AS days_late, a.amount AS capital
       FROM investment_payments ip JOIN investment_applications a ON a.id = ip.application_id
      WHERE ip.status = 'due' AND ip.due_date < CURRENT_DATE AND a.status = 'active' AND a.plan_type = 'monthly'`);
  let charged = 0;
  for (const r of rows) {
    const periods = Math.floor((Number(r.days_late) - 1) / PENALTY_PERIOD_DAYS) + 1;
    for (let n = 1; n <= periods; n++) {
      const amount = money((Number(r.capital) * pct) / 100);
      const ins = await pool.query(
        `INSERT INTO investment_late_penalties (application_id, payment_id, period_no, base_amount, percent, amount, charged_on)
         VALUES ($1,$2,$3,$4,$5,$6, CURRENT_DATE) ON CONFLICT (payment_id, period_no) DO NOTHING`,
        [r.application_id, r.payment_id, n, r.capital, pct, amount]);
      charged += ins.rowCount;
    }
  }
  return { checked: rows.length, charged };
}

/** Reminders 2 days ahead and a daily notice after the due date, by email and SMS. */
export async function runInvestmentPaymentNotices() {
  const pct = await penaltyPercent();
  const out = { checked: 0, sent: 0, overdueSent: 0 };

  const ahead = await pool.query(
    `SELECT ip.id, ip.amount, to_char(ip.due_date,'YYYY-MM-DD') AS due_text, a.reference, a.investor_id, a.amount AS capital, a.payment_mode, a.card_last4
       FROM investment_payments ip JOIN investment_applications a ON a.id = ip.application_id
      WHERE ip.status = 'due' AND ip.reminder2_sent_at IS NULL AND a.status = 'active' AND ip.due_date <= CURRENT_DATE + 2 AND ip.due_date >= CURRENT_DATE`);
  out.checked += ahead.rows.length;
  for (const r of ahead.rows) {
    await notifyUser(r.investor_id, "investment_due_reminder", {
      reference: r.reference, amount: Number(r.amount), dueDate: r.due_text, percent: pct, penalty: money((Number(r.capital) * pct) / 100),
      auto: r.payment_mode === "auto" && !!r.card_last4, last4: r.card_last4 || "",
    }, { allChannels: true });
    await pool.query(`UPDATE investment_payments SET reminder2_sent_at = now(), reminder_sent = TRUE WHERE id = $1`, [r.id]);
    out.sent++;
  }

  const late = await pool.query(
    `SELECT ip.id, ip.amount, to_char(ip.due_date,'YYYY-MM-DD') AS due_text, (CURRENT_DATE - ip.due_date) AS days_late, a.id AS app_id, a.reference, a.investor_id, a.amount AS capital,
            COALESCE((SELECT SUM(p.amount) FROM investment_late_penalties p WHERE p.payment_id = ip.id), 0) AS charged
       FROM investment_payments ip JOIN investment_applications a ON a.id = ip.application_id
      WHERE ip.status = 'due' AND ip.due_date < CURRENT_DATE AND a.status = 'active'
        AND ip.last_overdue_notice_on IS DISTINCT FROM CURRENT_DATE`);
  out.checked += late.rows.length;
  for (const r of late.rows) {
    await notifyUser(r.investor_id, "investment_overdue_notice", {
      reference: r.reference, amount: Number(r.amount), dueDate: r.due_text, daysLate: Number(r.days_late), percent: pct,
      penalty: money((Number(r.capital) * pct) / 100), charged: money(r.charged),
    }, { allChannels: true });
    await pool.query(`UPDATE investment_payments SET last_overdue_notice_on = CURRENT_DATE WHERE id = $1`, [r.id]);
    out.overdueSent++;
  }
  return out;
}

/**
 * Deduct outstanding penalties from an ROI record that Finance is approving. Runs in the caller's
 * transaction. Returns { deducted, remaining }.
 */
export async function deductPenaltiesFromRoi(client, roi) {
  const { rows } = await client.query(
    `SELECT id, amount, deducted_amount FROM investment_late_penalties WHERE application_id = $1 AND deducted_amount < amount ORDER BY charged_on ASC, period_no ASC FOR UPDATE`,
    [roi.application_id]);
  let room = Number(roi.roi_amount); let deducted = 0;
  for (const p of rows) {
    if (room <= 0) break;
    const take = money(Math.min(room, Number(p.amount) - Number(p.deducted_amount)));
    await client.query(`UPDATE investment_late_penalties SET deducted_amount = deducted_amount + $2 WHERE id = $1`, [p.id, take]);
    room = money(room - take); deducted = money(deducted + take);
  }
  const remaining = money(rows.reduce((s, p) => s + Number(p.amount) - Number(p.deducted_amount), 0) - deducted);
  return { deducted, remaining };
}
