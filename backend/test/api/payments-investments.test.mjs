// Phase 4: investor payments through Paystack (activation, Pay now, saved-card auto-charge, offline exception)
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pay, db, newUser, loginAdmin, paystack, waitForMessage } from "../helpers/api.mjs";
import { calculateFee } from "../../src/services/paystack.js";
import { pool } from "../../src/db/pool.js";

process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET;
process.env.PAYSTACK_BASE_URL = process.env.PAYSTACK_URL;
after(async () => { await db.end(); await pool.end(); });

let admin;
const appRow = async (id) => (await db.query("SELECT * FROM investment_applications WHERE id=$1", [id])).rows[0];
const gp = async (ref) => (await db.query("SELECT * FROM gateway_payments WHERE reference=$1", [ref])).rows[0];
const rows = async (id) => (await db.query("SELECT *, to_char(due_date,'YYYY-MM-DD') AS d FROM investment_payments WHERE application_id=$1 ORDER BY due_date", [id])).rows;
const me = (u) => pay("/investments/me", { token: u.token });
const payNow = (u) => pay("/investments/me/pay", { method: "POST", token: u.token, body: {} });
const decide = (id, decision) => pay(`/investments/applications/${id}/decide`, { method: "POST", token: admin, body: { decision } });
const attention = async () => (await pay("/refunds/attention", { token: admin })).data.items;
const settle = async (ref, extra = "") => { await paystack.success(ref, extra); await paystack.webhook(ref); };

/** An investor whose application has been through Finance's review and the agreement, and now waits for payment. */
async function awaiting({ planType = "monthly", amount = 10000, years = 1, mode = "auto" } = {}) {
  const u = await newUser();
  const a = await pay("/investments/apply", { method: "POST", token: u.token, body: { planType, amount, durationYears: years, paymentMode: mode } });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const id = a.data.application.id;
  assert.equal((await decide(id, "approve")).data.application.status, "agreement_pending");
  await db.query("UPDATE investment_applications SET status='agreement_review', agreement_file_url='/uploads/agreements/x.pdf' WHERE id=$1", [id]);
  const fin = await decide(id, "approve");
  assert.equal(fin.status, 200);
  assert.equal(fin.data.application.status, "awaiting_payment", "Finance's final approval no longer activates it: the payment does");
  return { u, id };
}
/** Pays the activation payment by card and returns the gateway reference. */
async function activate(ctx) {
  const r = await payNow(ctx.u);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await settle(r.data.payment.reference);
  assert.equal((await appRow(ctx.id)).status, "active");
  return r.data.payment.reference;
}

test("setup", async () => { admin = await loginAdmin(); });

test("bulk plan: approval alone does not activate; the investor sees the amount plus Paystack's fee, pays online, and only the verified payment activates it", async () => {
  const c = await awaiting({ planType: "bulk", amount: 100000, years: 2, mode: "auto" });
  const m = await me(c.u);
  const exp = calculateFee(100000);
  assert.equal(m.data.application.status, "awaiting_payment");
  assert.equal(m.data.application.obligation.kind, "activation");
  assert.equal(m.data.application.obligation.amount, 100000);
  assert.equal(m.data.application.obligation.fee, exp.fee);
  assert.equal(m.data.application.obligation.total, exp.gross);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM roi_records WHERE application_id=$1", [c.id])).rows[0].n, 0, "no ROI schedule before payment");
  assert.ok(await waitForMessage("to_user_id=$1 AND template='investment_payment_requested'", [c.u.id]), "the investor is told to pay");

  const r = await payNow(c.u);
  assert.equal(r.status, 200);
  assert.ok(r.data.payment.authorizationUrl); assert.equal(r.data.payment.total, exp.gross);
  const again = await payNow(c.u);
  assert.equal(again.data.payment.reference, r.data.payment.reference, "no second payment page while one is open");
  assert.equal((await appRow(c.id)).status, "awaiting_payment");

  await settle(r.data.payment.reference);
  const app = await appRow(c.id);
  assert.equal(app.status, "active"); assert.equal(app.activation_reference, r.data.payment.reference);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM roi_records WHERE application_id=$1", [c.id])).rows[0].n, 2);
  assert.equal((await rows(c.id)).length, 0, "a bulk plan has no monthly schedule");
  assert.ok(await waitForMessage("to_user_id=$1 AND template='investment_receipt'", [c.u.id]));
  assert.ok(await waitForMessage("template='payment_finance_notice' AND body_text ILIKE $1", [`%${r.data.payment.reference}%`]), "Finance is told");
  assert.equal((await gp(r.data.payment.reference)).type, "investment");
  // nothing left to pay
  const done = await payNow(c.u);
  assert.equal(done.status, 409); assert.match(done.data.error, /already paid/i);
  // the old typed-in log is gone
  assert.equal((await pay("/investments/me/payments", { method: "POST", token: c.u.token, body: { amount: 5000 } })).status, 410);
});

test("a wrong-amount payment is never applied: the investment stays awaiting payment and the money waits in the Refund room", async () => {
  const c = await awaiting({ planType: "bulk", amount: 100000 });
  const r = await payNow(c.u);
  await settle(r.data.payment.reference, "amountKobo=100");
  assert.equal((await appRow(c.id)).status, "awaiting_payment");
  assert.equal((await gp(r.data.payment.reference)).refusal_reason, "amount_mismatch");
  assert.ok((await attention()).some((x) => x.reference === r.data.payment.reference));
});

test("monthly plan: the first month activates it and saves the card; the next month is scheduled one month later", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "auto" });
  const ref = await activate(c);
  const r = await rows(c.id);
  assert.equal(r.length, 2);
  assert.equal(r[0].status, "on_time"); assert.equal(r[0].gateway_reference, ref); assert.equal(Number(r[0].amount), 10000);
  assert.equal(r[1].status, "due");
  const app = await appRow(c.id);
  assert.ok(app.card_auth_code); assert.equal(app.card_last4, "4081");
  const m = (await me(c.u)).data.application;
  assert.deepEqual(m.savedCard, { last4: "4081", brand: "visa" });
  assert.equal(m.obligation.kind, "monthly"); assert.equal(m.obligation.amount, 10000);
  const pays = (await pay("/investments/me/payments", { token: c.u.token })).data.payments;
  assert.equal(pays.length, 2); assert.equal(pays[0].paidVia, "paystack");
});

test("a manual-mode plan never saves a card; Pay now pays the month due and rolls the schedule forward", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "manual" });
  await activate(c);
  assert.equal((await appRow(c.id)).card_auth_code, null, "no card saved without choosing automatic payment");
  const due = (await rows(c.id)).find((x) => x.status === "due");
  const r = await payNow(c.u);
  assert.equal(r.status, 200);
  assert.equal((await gp(r.data.payment.reference)).subject_id, due.id);
  await settle(r.data.payment.reference);
  const after = await rows(c.id);
  assert.equal(after.filter((x) => x.status === "due").length, 1, "one new month is now due");
  assert.equal(after.find((x) => x.id === due.id).status, "on_time");
  assert.equal(after.find((x) => x.id === due.id).paid_via, "paystack");
});

test("saved-card auto-charge: charged on the due date, receipt sent, schedule rolls forward, never charged twice", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "auto" });
  await activate(c);
  const due = (await rows(c.id)).find((x) => x.status === "due");
  assert.equal((await pay("/investments/admin/run-auto-charge", { method: "POST", token: admin, body: {} })).data.charged >= 0, true);
  assert.equal((await rows(c.id)).find((x) => x.id === due.id).status, "due", "not due yet: nothing charged");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE WHERE id=$1", [due.id]);
  const run = await pay("/investments/admin/run-auto-charge", { method: "POST", token: admin, body: {} });
  assert.equal(run.status, 200); assert.ok(run.data.charged >= 1);
  const row = (await rows(c.id)).find((x) => x.id === due.id);
  assert.equal(row.status, "on_time"); assert.equal(row.paid_via, "auto_charge");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM gateway_payments WHERE subject_id=$1", [due.id])).rows[0].n, 1);
  const g = await gp(row.gateway_reference);
  assert.equal(Number(g.net_amount), 10000); assert.equal(Number(g.gross_amount), calculateFee(10000).gross, "the processing fee is added, as for every payment");
  assert.ok(await waitForMessage("to_user_id=$1 AND template='investment_receipt' AND body_text ILIKE '%automatically%'", [c.u.id]));
  assert.equal((await rows(c.id)).filter((x) => x.status === "due").length, 1);
  await pay("/investments/admin/run-auto-charge", { method: "POST", token: admin, body: {} });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM gateway_payments WHERE subject_id=$1", [due.id])).rows[0].n, 1, "no second charge for the same month");
});

test("a declined auto-charge tells the investor and Finance straight away, is NOT retried, and Pay now still works", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "auto" });
  await activate(c);
  await db.query("UPDATE users SET phone=$2 WHERE id=$1", [c.u.id, `0803${String(Math.floor(1000000 + Math.random() * 8999999))}`]);
  const due = (await rows(c.id)).find((x) => x.status === "due");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE WHERE id=$1", [due.id]);
  await paystack.chargeFail(true);
  const run = await pay("/investments/admin/run-auto-charge", { method: "POST", token: admin, body: {} });
  await paystack.chargeFail(false);
  assert.ok(run.data.failed >= 1);
  const row = (await rows(c.id)).find((x) => x.id === due.id);
  assert.equal(row.status, "due"); assert.match(row.auto_charge_error, /funds/i);
  const chans = (await db.query("SELECT channel FROM messages WHERE to_user_id=$1 AND template='investment_auto_charge_failed'", [c.u.id])).rows.map((r) => r.channel).sort();
  assert.deepEqual(chans, ["email", "sms"]);
  assert.ok(await waitForMessage("template='investment_auto_charge_failed_finance' AND body_text ILIKE $1", [`%${(await appRow(c.id)).reference}%`]), "Finance is told");
  const m = (await me(c.u)).data.application;
  assert.match(m.autoChargeFailed.error, /funds/i, "the investor's screen shows the failure");
  const before = (await db.query("SELECT count(*)::int AS n FROM gateway_payments WHERE subject_id=$1", [due.id])).rows[0].n;
  await pay("/investments/admin/run-auto-charge", { method: "POST", token: admin, body: {} });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM gateway_payments WHERE subject_id=$1", [due.id])).rows[0].n, before, "no automatic retry");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE - 2 WHERE id=$1", [due.id]);
  const r = await payNow(c.u);
  assert.equal(r.status, 200); await settle(r.data.payment.reference);
  assert.equal((await rows(c.id)).find((x) => x.id === due.id).status, "late", "paid after the due date");
});

test("automatic mode without a saved card fails clearly (and can be switched); the saved card can be removed", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "manual" });
  await activate(c);
  const sw = await pay("/investments/me/payment-mode", { method: "PATCH", token: c.u.token, body: { paymentMode: "auto" } });
  assert.equal(sw.status, 200); assert.equal(sw.data.needsCard, true);
  assert.equal((await pay("/investments/me/payment-mode", { method: "PATCH", token: c.u.token, body: { paymentMode: "weekly" } })).status, 400);
  const due = (await rows(c.id)).find((x) => x.status === "due");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE WHERE id=$1", [due.id]);
  await pay("/investments/admin/run-auto-charge", { method: "POST", token: admin, body: {} });
  assert.match((await rows(c.id)).find((x) => x.id === due.id).auto_charge_error, /no saved card/i);
  // pay once by card while in automatic mode: the card is saved; then it can be removed
  const r = await payNow(c.u); await settle(r.data.payment.reference);
  assert.ok((await appRow(c.id)).card_auth_code);
  const rm = await pay("/investments/me/card", { method: "DELETE", token: c.u.token });
  assert.equal(rm.status, 200);
  const a = await appRow(c.id);
  assert.equal(a.card_auth_code, null); assert.equal(a.payment_mode, "manual");
});

test("a month cannot be paid twice: the second payment is refused as a duplicate and waits in the Refund room", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "manual" });
  await activate(c);
  const first = await payNow(c.u);
  await db.query("UPDATE gateway_payments SET created_at = now() - interval '3 hours' WHERE reference=$1", [first.data.payment.reference]);
  const second = await payNow(c.u);
  assert.notEqual(second.data.payment.reference, first.data.payment.reference);
  await settle(second.data.payment.reference);
  await settle(first.data.payment.reference);
  assert.equal((await gp(first.data.payment.reference)).refusal_reason, "duplicate_payment");
  assert.ok((await attention()).some((x) => x.reference === first.data.payment.reference));
  assert.equal((await rows(c.id)).filter((x) => x.status === "on_time").length, 2, "only one extra month was paid");
});

test("rejecting an application waiting for payment closes its payment page; money that still arrives is not applied", async () => {
  const c = await awaiting({ planType: "bulk", amount: 100000 });
  const r = await payNow(c.u);
  assert.equal((await decide(c.id, "reject")).data.application.status, "rejected");
  assert.equal((await gp(r.data.payment.reference)).status, "abandoned");
  await settle(r.data.payment.reference);
  assert.equal((await appRow(c.id)).status, "rejected");
  assert.equal((await gp(r.data.payment.reference)).refusal_reason, "investment_closed");
  assert.ok((await attention()).some((x) => x.reference === r.data.payment.reference));
  assert.equal((await payNow(c.u)).status, 409);
});

test("offline record (exception): reason required, admins only, flagged, every admin told, blocked while acting as a department", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "manual" });
  const url = `/investments/applications/${c.id}/record-offline`;
  assert.equal((await pay(url, { method: "POST", token: admin, body: {} })).status, 400);
  assert.equal((await pay(url, { method: "POST", token: admin, body: { reason: "abc" } })).status, 400);
  assert.equal((await pay(url, { method: "POST", token: c.u.token, body: { reason: "Bank transfer TRF-1" } })).status, 403);
  assert.equal((await pay(url, { method: "POST", token: admin, headers: { "X-Acting-As": "Finance" }, body: { reason: "Bank transfer TRF-1" } })).status, 403);
  assert.equal((await pay("/investments/applications/not-a-uuid/record-offline", { method: "POST", token: admin, body: { reason: "Bank transfer TRF-1" } })).status, 404);
  const ok = await pay(url, { method: "POST", token: admin, body: { reason: "Bank transfer TRF-1 from Aliyu" } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal((await appRow(c.id)).status, "active");
  const g = await gp(ok.data.recorded.reference);
  assert.equal(g.provider, "offline"); assert.equal(Number(g.gross_amount), 10000);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM payment_flags WHERE payment_id=$1 AND reason='offline_record'", [g.id])).rows[0].n, 1);
  assert.ok(await waitForMessage("template='investment_offline_notice' AND body_text ILIKE $1", [`%${(await appRow(c.id)).reference}%`]));
  assert.equal((await rows(c.id))[0].paid_via, "offline");
  // a later month can also be recorded; a plan with nothing due is refused
  const second = await pay(url, { method: "POST", token: admin, body: { reason: "Cash paid at the office, receipt 22" } });
  assert.equal(second.status, 201);
  const bulk = await awaiting({ planType: "bulk", amount: 100000 });
  assert.equal((await pay(`/investments/applications/${bulk.id}/record-offline`, { method: "POST", token: admin, body: { reason: "Bank transfer TRF-9" } })).status, 201);
  assert.equal((await pay(`/investments/applications/${bulk.id}/record-offline`, { method: "POST", token: admin, body: { reason: "Bank transfer TRF-9" } })).status, 409);
});

test("validation and access: only investors pay; nothing to pay is a clear 409; no application is a 404", async () => {
  const u = await newUser();
  assert.equal((await payNow(u)).status, 404);
  assert.equal((await pay("/investments/me/pay", { method: "POST", token: admin, body: {} })).status, 403);
  assert.equal((await pay("/investments/me/pay", { method: "POST", body: {} })).status, 401);
  const a = await pay("/investments/apply", { method: "POST", token: u.token, body: { planType: "bulk", amount: 100000, durationYears: 1 } });
  assert.equal((await payNow(u)).status, 409, "not approved yet");
  assert.equal((await pay("/investments/me/payment-mode", { method: "PATCH", token: u.token, body: { paymentMode: "auto" } })).status, 404);
  assert.ok(a.data.application.id);
});

// ---------------------------------------------------------------------------------------------
// Late monthly payments: reminders, daily notices, 2% penalty per month unpaid, deducted from ROI
// ---------------------------------------------------------------------------------------------
const withPhone = (u) => db.query("UPDATE users SET phone=$2 WHERE id=$1", [u.id, `0803${String(Math.floor(1000000 + Math.random() * 8999999))}`]);
const chans = async (u, template) => (await db.query("SELECT channel FROM messages WHERE to_user_id=$1 AND template=$2", [u.id, template])).rows.map((r) => r.channel).sort();
const runDaily = () => pay("/investments/admin/run-reminder-check", { method: "POST", token: admin, body: {} });
const penalties = async (id) => (await db.query("SELECT period_no, amount, base_amount, percent, deducted_amount FROM investment_late_penalties WHERE application_id=$1 ORDER BY period_no", [id])).rows;
const dueRow = async (id) => (await rows(id)).find((x) => x.status === "due");

test("reminder goes out 2 days before the due date by email and SMS, once, with the 2% warning", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "manual" });
  await activate(c); await withPhone(c.u);
  await runDaily();
  assert.deepEqual(await chans(c.u, "investment_due_reminder"), [], "the next month is ~30 days away: no reminder yet");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE + 3 WHERE id=$1", [(await dueRow(c.id)).id]);
  await runDaily();
  assert.deepEqual(await chans(c.u, "investment_due_reminder"), [], "3 days before is too early");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE + 2 WHERE id=$1", [(await dueRow(c.id)).id]);
  const run = await runDaily();
  assert.ok(run.data.sent >= 1);
  assert.deepEqual(await chans(c.u, "investment_due_reminder"), ["email", "sms"]);
  const m = await db.query("SELECT body_text FROM messages WHERE to_user_id=$1 AND template='investment_due_reminder' AND channel='sms'", [c.u.id]);
  assert.match(m.rows[0].body_text, /2%/); assert.match(m.rows[0].body_text, /₦200/);
  await runDaily();
  assert.equal((await chans(c.u, "investment_due_reminder")).length, 2, "not sent twice");
  assert.equal((await penalties(c.id)).length, 0, "no penalty before the due date");
});

test("after the due date: a notice every day (email + SMS) and a 2% penalty on the overdue share's capital for each month unpaid", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 1, mode: "manual" });
  await activate(c); await withPhone(c.u);
  const id = (await dueRow(c.id)).id;
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE WHERE id=$1", [id]);
  await runDaily();
  assert.equal((await penalties(c.id)).length, 0, "due today is not late yet");
  assert.deepEqual(await chans(c.u, "investment_overdue_notice"), []);

  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE - 1 WHERE id=$1", [id]);
  await runDaily();
  let p = await penalties(c.id);
  assert.equal(p.length, 1); assert.equal(Number(p[0].amount), 200, "2% of the 10,000 capital"); assert.equal(Number(p[0].base_amount), 10000); assert.equal(Number(p[0].percent), 2);
  assert.deepEqual(await chans(c.u, "investment_overdue_notice"), ["email", "sms"]);
  const m = (await me(c.u)).data.application;
  assert.equal(m.overdue.daysLate, 1); assert.equal(m.latePenaltyOutstanding, 200);
  await runDaily();
  assert.equal((await chans(c.u, "investment_overdue_notice")).length, 2, "one notice per day");
  assert.equal((await penalties(c.id)).length, 1, "the same month is never charged twice");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE - 2, last_overdue_notice_on = CURRENT_DATE - 1 WHERE id=$1", [id]);
  await runDaily();
  assert.equal((await chans(c.u, "investment_overdue_notice")).length, 4, "the next day's notice goes out");
  const body = await db.query("SELECT body_text FROM messages WHERE to_user_id=$1 AND template='investment_overdue_notice' AND channel='sms' ORDER BY created_at DESC LIMIT 1", [c.u.id]);
  assert.match(body.rows[0].body_text, /2 day/);

  // a second month unpaid: charged once more; still unpaid at 61+ days: a third
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE - 31 WHERE id=$1", [id]);
  await runDaily();
  p = await penalties(c.id);
  assert.deepEqual(p.map((x) => x.period_no), [1, 2]);
  assert.equal((await me(c.u)).data.application.latePenaltyOutstanding, 400);

  // paying stops it
  const r = await payNow(c.u); await settle(r.data.payment.reference);
  assert.equal((await rows(c.id)).find((x) => x.id === id).status, "late");
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE - 100 WHERE id=$1", [id]);
  await runDaily();
  assert.equal((await db.query("SELECT count(*)::int AS n FROM investment_late_penalties WHERE payment_id=$1", [id])).rows[0].n, 2, "no more penalties on the month he has paid");
  const next = await dueRow(c.id);
  assert.ok(next, "the following month carries on as normal");
  assert.ok((await me(c.u)).data.application.latePenaltyOutstanding >= 400, "what was charged stays owed against the ROI");
});

test("penalties are deducted from the ROI payout when Finance approves it; what a payout cannot cover carries to the next payout", async () => {
  const c = await awaiting({ planType: "monthly", amount: 10000, years: 2, mode: "manual" });
  await activate(c);
  const first = (await dueRow(c.id)).id;
  await db.query("UPDATE investment_payments SET due_date = CURRENT_DATE - 31 WHERE id=$1", [first]);
  await runDaily();
  assert.equal((await penalties(c.id)).length, 2);
  const recs = (await db.query("SELECT id, year_number, roi_amount FROM roi_records WHERE application_id=$1 ORDER BY year_number", [c.id])).rows;
  assert.equal(Number(recs[0].roi_amount), 1000); assert.equal(Number(recs[1].roi_amount), 2000);

  const list = (await pay("/investments/roi-payouts", { token: admin })).data.payouts.find((x) => x.id === recs[0].id);
  assert.equal(list.latePenalty, 400); assert.equal(list.netPayout, 600, "Finance sees the deduction before approving");
  const ok = await pay(`/investments/roi-payouts/${recs[0].id}/approve`, { method: "POST", token: admin, body: {} });
  assert.equal(ok.status, 200);
  const r1 = (await db.query("SELECT * FROM roi_records WHERE id=$1", [recs[0].id])).rows[0];
  assert.equal(Number(r1.penalty_amount), 400); assert.equal(Number(r1.net_payout), 600); assert.equal(Number(r1.penalty_percent), 40);
  assert.deepEqual((await penalties(c.id)).map((x) => Number(x.deducted_amount)), [200, 200]);
  const roiPayout = (await db.query("SELECT * FROM payouts WHERE kind='roi_payout' AND subject_id=$1", [recs[0].id])).rows[0];
  assert.equal(Number(roiPayout.amount), 600, "the investor is paid the ROI after the penalty deduction, by Paystack transfer"); assert.equal(roiPayout.user_id, c.u.id);
  const mine = (await pay("/investments/me/roi", { token: c.u.token })).data;
  assert.equal(mine.records[0].penaltyAmount, 400); assert.equal(mine.records[0].netPayout, 600); assert.equal(mine.latePenaltyOutstanding, 0);
  assert.equal((await pay(`/investments/roi-payouts/${recs[0].id}/approve`, { method: "POST", token: admin, body: {} })).status, 400, "approved once");
  assert.equal((await pay("/investments/roi-payouts/not-a-uuid/approve", { method: "POST", token: admin, body: {} })).status, 400);
  assert.equal((await pay(`/investments/roi-payouts/${recs[1].id}/approve`, { method: "POST", token: c.u.token, body: {} })).status, 403);

  // a big penalty that the first payout cannot cover
  await db.query("INSERT INTO investment_late_penalties (application_id, payment_id, period_no, base_amount, percent, amount) VALUES ($1,$2,9,10000,2,2500)", [c.id, first]);
  const ok2 = await pay(`/investments/roi-payouts/${recs[1].id}/approve`, { method: "POST", token: admin, body: {} });
  assert.equal(ok2.status, 200);
  const r2 = (await db.query("SELECT * FROM roi_records WHERE id=$1", [recs[1].id])).rows[0];
  assert.equal(Number(r2.penalty_amount), 2000); assert.equal(Number(r2.net_payout), 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM payouts WHERE kind='roi_payout' AND subject_id=$1", [recs[1].id])).rows[0].n, 0, "nothing to send when the penalties take the whole payout");
  assert.equal((await pay("/investments/me/roi", { token: c.u.token })).data.latePenaltyOutstanding, 500, "the rest stays owed");
});

test("bulk plans have no monthly penalties", async () => {
  const c = await awaiting({ planType: "bulk", amount: 100000, years: 1 });
  await activate(c);
  await runDaily();
  assert.equal((await penalties(c.id)).length, 0);
});
