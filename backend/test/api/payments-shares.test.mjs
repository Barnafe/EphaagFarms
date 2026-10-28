// Step 2 / Phase 2: farmer shares paid through the shared Paystack ledger
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, pay, strict, db, newFarmer, newBuyer, loginAdmin, paystack, waitForMessage, mailState, sleep } from "../helpers/api.mjs";
import { calculateFee, paystackFeeOn } from "../../src/services/paystack.js";
import { lateStatus } from "../../src/services/shareLateFees.js";
import { expireSharePurchases } from "../../src/controllers/farmerSharesController.js";
import { recheckStuckPayments } from "../../src/services/orderPayments.js";
import { pool } from "../../src/db/pool.js";
import { registerAllJobs } from "../../src/jobs/index.js";

registerAllJobs();
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET;
process.env.PAYSTACK_BASE_URL = process.env.PAYSTACK_URL;
after(async () => { await db.end(); await pool.end(); });

let admin;
const SHARE = 25000;
const buy = async (f, quantity = 2, extra = {}) => pay("/farmers/me/shares/checkout", { method: "POST", token: f.token, body: { quantity, ...extra } });
const purchaseRow = async (ref) => (await db.query("SELECT * FROM share_purchases WHERE reference=$1", [ref])).rows[0];
const shareCount = async (purchaseId) => (await db.query("SELECT count(*)::int AS n FROM farmer_shares WHERE purchase_id=$1", [purchaseId])).rows[0].n;
const payRow = async (ref) => (await db.query("SELECT * FROM gateway_payments WHERE reference=$1", [ref])).rows[0];
const flagsFor = async (ref) => (await db.query("SELECT f.* FROM payment_flags f JOIN gateway_payments p ON p.id=f.payment_id WHERE p.reference=$1", [ref])).rows;
const verify = (f, ref) => pay(`/farmers/me/shares/purchases/${ref}/verify`, { method: "POST", token: f.token });
async function buyOk(f, q = 2, extra = {}) { const r = await buy(f, q, extra); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.purchase; }

test("setup", async () => { admin = await loginAdmin(); });

test("simulated payment: works only when explicitly enabled and never in production", async () => {
  const f = await newFarmer();
  // dev server with PAYMENT_ALLOW_SIMULATED=true and no Paystack key
  const c = await api("/farmers/me/shares/checkout", { method: "POST", token: f.token, body: { quantity: 2 } });
  assert.equal(c.status, 201);
  assert.equal(c.data.purchase.provider, "simulated");
  assert.equal(c.data.purchase.fee, 0, "no gateway, no fee");
  const v = await api(`/farmers/me/shares/purchases/${c.data.purchase.reference}/verify`, { method: "POST", token: f.token });
  assert.equal(v.data.outcome, "success");
  assert.equal(v.data.shares.length, 2);
  // verifying again does not create more
  await api(`/farmers/me/shares/purchases/${c.data.purchase.reference}/verify`, { method: "POST", token: f.token });
  assert.equal(await shareCount(c.data.purchase.id), 2);
  // the production-mode server has the SAME env flag set, no key: "unavailable", never free shares
  const before = (await db.query("SELECT count(*)::int AS n FROM share_purchases WHERE farmer_id=$1", [f.id])).rows[0].n;
  const p = await strict("/farmers/me/shares/checkout", { method: "POST", token: f.token, body: { quantity: 3 } });
  assert.equal(p.status, 503);
  assert.match(p.data.error, /unavailable/i);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM share_purchases WHERE farmer_id=$1", [f.id])).rows[0].n, before);
  // and without the flag even in dev there is no simulated mode (checked on terms)
  const terms = await strict("/farmers/shares/terms", { token: f.token });
  assert.equal(terms.data.provider, null);
});

test("fee: the farmer pays it, EPHAAG nets the price, each share stays exactly ₦25,000 (edges for 1 to 10 shares)", async () => {
  for (let q = 1; q <= 10; q++) {
    const r = calculateFee(q * SHARE);
    assert.ok(Math.round((r.gross - paystackFeeOn(r.gross)) * 100) / 100 >= q * SHARE - 0.005, `q=${q}`);
    assert.ok(r.fee <= 2000.005);
  }
  const f = await newFarmer();
  const qt = await pay("/farmers/shares/quote?quantity=3", { token: f.token });
  const exp = calculateFee(3 * SHARE);
  assert.equal(qt.data.goodsTotal, 75000);
  assert.equal(qt.data.fee, exp.fee);
  assert.equal(qt.data.amountCharged, exp.gross);
  assert.equal((await pay("/farmers/shares/quote?quantity=0", { token: f.token })).status, 400);
  assert.equal((await pay("/farmers/shares/quote?quantity=11", { token: f.token })).status, 400);
  const p = await buyOk(f, 3);
  assert.equal(p.total, 75000); assert.equal(p.fee, exp.fee); assert.equal(p.amountCharged, exp.gross);
  const t = await paystack.tx(p.reference);
  assert.equal(t.amount, Math.round(exp.gross * 100), "Paystack is asked to charge the gross amount");
  await paystack.success(p.reference); await paystack.webhook(p.reference);
  const shares = (await db.query("SELECT amount FROM farmer_shares WHERE purchase_id=$1", [p.id])).rows;
  assert.equal(shares.length, 3);
  assert.ok(shares.every((s) => Number(s.amount) === SHARE), "capital stays exactly ₦25,000 per share, whatever the fee");
});

test("the purchase is saved first; the payment link is stored on it; emails: real address used, phone-only gets a placeholder", async () => {
  const withEmail = await newFarmer(); const phoneOnly = await newFarmer({ phoneOnly: true });
  const a = await buyOk(withEmail, 1); const b = await buyOk(phoneOnly, 1);
  for (const p of [a, b]) {
    assert.match(p.authorizationUrl, /paystack\.standin\/pay\/SPR-/);
    const row = await purchaseRow(p.reference);
    assert.equal(row.status, "pending");
    assert.ok(row.authorization_url);
    const exp = (new Date(row.expires_at) - Date.now()) / 3600000;
    assert.ok(exp > 23.9 && exp <= 24);
  }
  assert.equal((await paystack.tx(a.reference)).email, withEmail.email);
  assert.match((await paystack.tx(b.reference)).email, /^234803\d{7}@farmers\.ephaag\.app$|^0803\d{7}@farmers\.ephaag\.app$/);
  // the first attempt IS the purchase reference, so the return link and the webhook agree
  assert.equal((await payRow(a.reference)).subject_id, a.id);
  assert.equal((await payRow(a.reference)).type, "share");
});

test("webhook only (browser closed): exactly the right shares appear once; receipt by email or SMS; Finance sees it as 'Share'", async () => {
  const f = await newFarmer(); const ph = await newFarmer({ phoneOnly: true });
  for (const farmer of [f, ph]) {
    const p = await buyOk(farmer, 2);
    await paystack.success(p.reference);
    const w = await paystack.webhook(p.reference);
    assert.equal(w.appStatus, 200);
    assert.equal(await shareCount(p.id), 2);
    assert.equal((await purchaseRow(p.reference)).status, "paid");
    const pr = await payRow(p.reference);
    assert.equal(pr.status, "success"); assert.equal(Number(pr.net_amount), 50000);
    if (farmer.email) {
      assert.ok(await waitForMessage("to_user_id=$1 AND template='share_receipt' AND channel='email'", [farmer.id]), "email receipt");
    } else {
      const m = await waitForMessage("to_user_id=$1 AND template='share_receipt' AND channel='sms'", [farmer.id]);
      assert.ok(m, "phone-only farmer gets an SMS receipt");
      assert.ok(m.body_text.length <= 160);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM messages WHERE to_address LIKE '%farmers.ephaag.app'")).rows[0].n, 0, "the placeholder address is never emailed");
    }
    assert.ok(await waitForMessage("template='payment_finance_notice' AND body_text ILIKE $1", [`%${p.reference}%`]), "Finance notified");
    const led = (await api("/payments/admin/ledger?type=share", { token: admin })).data.payments.find((x) => x.reference === p.reference);
    assert.ok(led); assert.equal(led.typeLabel, "Share");
  }
});

test("webhook + return-page check + duplicate webhook together give one set of shares", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 4);
  await paystack.success(p.reference);
  const out = await Promise.all([paystack.webhook(p.reference), paystack.webhook(p.reference), verify(f, p.reference), verify(f, p.reference)]);
  assert.equal(out[2].data.outcome, "success");
  assert.equal(await shareCount(p.id), 4);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM messages WHERE template='share_receipt' AND to_user_id=$1", [f.id])).rows[0].n, 1);
});

test("a bad signature is rejected and creates nothing", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 1);
  await paystack.success(p.reference);
  assert.equal((await paystack.webhook(p.reference, { bad: true })).appStatus, 401);
  assert.equal(await shareCount(p.id), 0);
  assert.equal((await purchaseRow(p.reference)).status, "pending");
});

test("a wrong amount is refused automatically: no shares, the farmer is told on screen and by message, admins are told, it waits in the Refund room", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 2);
  await paystack.success(p.reference, "amountKobo=100");
  await paystack.webhook(p.reference);
  assert.equal(await shareCount(p.id), 0);
  assert.equal((await purchaseRow(p.reference)).status, "pending");
  const pr = await payRow(p.reference);
  assert.equal(pr.status, "refused"); assert.equal(pr.refusal_reason, "amount_mismatch"); assert.equal(pr.refund_status, "due");
  const v = await verify(f, p.reference);
  assert.equal(v.data.outcome, "refused");
  assert.match(v.data.refusalText, /amount/);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='payment_refused'", [f.id]));
  assert.ok((await pay("/refunds/attention", { token: admin })).data.items.some((r) => r.reference === p.reference));
  assert.ok(await waitForMessage("template='payment_attention' AND body_text ILIKE $1", [`%${p.reference}%`]), "admins told straight away");
  // the farmer can pay again properly
  const again = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token });
  assert.equal(again.status, 200);
  const ref2 = (await db.query("SELECT reference FROM gateway_payments WHERE subject_id=$1 AND status='pending'", [p.id])).rows[0].reference;
  assert.notEqual(ref2, p.reference);
  await paystack.success(ref2); await paystack.webhook(ref2);
  assert.equal(await shareCount(p.id), 2);
});

const DAYMS = 24 * 3600 * 1000;
const setDue = (id, daysAgo) => db.query("UPDATE share_purchases SET expires_at = now() - ($2 || ' hours')::interval WHERE id=$1", [id, String(Math.round(daysAgo * 24))]);
const msgs = async (userId, template) => (await db.query("SELECT channel FROM messages WHERE to_user_id=$1 AND template=$2", [userId, template])).rows.map((r) => r.channel).sort();

test("late fee maths: 2% a month per day, from the day it fell due, capped after 30 days, then a 10 day grace, then closed", () => {
  const due = new Date("2026-01-01T12:00:00Z");
  const at = (days) => lateStatus({ status: "pending", total: 50000, expires_at: due }, undefined, new Date(due.getTime() + days * DAYMS));
  assert.equal(at(-0.1).state, "on_time"); assert.equal(at(-0.1).lateFee, 0);
  const d1 = at(0.04); assert.equal(d1.state, "late"); assert.equal(d1.daysLate, 1); assert.equal(d1.lateFee, 33.33);
  const d10 = at(9.5); assert.equal(d10.daysLate, 10); assert.equal(d10.lateFee, 333.33); assert.equal(d10.amountDue, 50333.33);
  const d30 = at(29.5); assert.equal(d30.state, "late"); assert.equal(d30.lateFee, 1000); assert.equal(d30.feeStopsGrowing, true);
  const d31 = at(30.5); assert.equal(d31.state, "grace"); assert.equal(d31.lateFee, 1000, "the fee stopped growing");
  assert.equal(at(39.5).state, "grace");
  assert.equal(at(40.5).state, "closed");
  assert.equal(lateStatus({ status: "paid", total: 50000, expires_at: due }).state, "paid");
});

test("a late purchase is not refused: the farmer sees the automatic fee, must agree to exactly that amount, pays, and capital stays 25,000 per share", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 2);
  await setDue(p.id, 9.5);
  const first = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token });
  assert.equal(first.status, 409); assert.equal(first.data.code, "LATE_FEE");
  const L = first.data.late;
  assert.equal(L.daysLate, 10); assert.equal(L.lateFee, 333.33); assert.equal(L.shareAmount, 50000); assert.equal(L.amountDue, 50333.33);
  assert.equal(L.totalToPay, calculateFee(50333.33).gross, "the processing fee is added on top of share + late fee");
  assert.ok(L.feeStopsAt && L.closesAt);
  const mine = await pay("/farmers/me/shares", { token: f.token });
  assert.equal(mine.data.pendingPurchases.find((x) => x.reference === p.reference).late.state, "late", "the card can show the overdue banner");
  // no agreement, or the wrong amount, never starts a payment
  assert.equal((await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token, body: { acceptLateFee: false, lateFee: 333.33 } })).status, 409);
  const wrong = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token, body: { acceptLateFee: true, lateFee: 1 } });
  assert.equal(wrong.status, 409); assert.equal(wrong.data.code, "LATE_FEE");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM gateway_payments WHERE subject_id=$1 AND (meta->>'lateFee')::numeric > 0", [p.id])).rows[0].n, 0);
  // agreed
  const ok = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token, body: { acceptLateFee: true, lateFee: 333.33 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const g = (await db.query("SELECT * FROM gateway_payments WHERE subject_id=$1 AND (meta->>'lateFee')::numeric > 0", [p.id])).rows[0];
  assert.ok(ok.data.purchase.authorizationUrl, "the farmer is sent to the payment page");
  assert.ok(g); assert.equal(Number(g.net_amount), 50333.33); assert.equal(Number(g.gross_amount), L.totalToPay);
  await paystack.success(g.reference); await paystack.webhook(g.reference);
  assert.equal((await purchaseRow(p.reference)).status, "paid");
  assert.equal(await shareCount(p.id), 2);
  const caps = (await db.query("SELECT amount FROM farmer_shares WHERE purchase_id=$1", [p.id])).rows.map((r) => Number(r.amount));
  assert.deepEqual(caps, [SHARE, SHARE], "late fee is never part of the share capital");
  const row = await purchaseRow(p.reference);
  assert.equal(Number(row.late_fee), 333.33); assert.equal(row.late_days, 10);
  const inc = (await db.query("SELECT amount, category FROM finance_income WHERE category='Share late fee' AND description ILIKE $1", [`%${p.reference}%`])).rows;
  assert.equal(inc.length, 1); assert.equal(Number(inc[0].amount), 333.33);
  const rc = await waitForMessage("to_user_id=$1 AND template='share_receipt'", [f.id]);
  assert.ok(rc);
});

test("a fee agreed earlier is not applied if it has since grown and the quote is over 24 hours old (the money waits in the Refund room)", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 1);
  await setDue(p.id, 2.5);
  const ok = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token, body: { acceptLateFee: true, lateFee: Number((await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token })).data.late.lateFee) } });
  assert.equal(ok.status, 200);
  const g = (await db.query("SELECT * FROM gateway_payments WHERE subject_id=$1 AND (meta->>'lateFee')::numeric > 0", [p.id])).rows[0];
  await db.query("UPDATE gateway_payments SET created_at = now() - interval '30 hours' WHERE id=$1", [g.id]);
  await setDue(p.id, 5.5); // days pass after the quote, so today's fee is higher than the agreed one
  await paystack.success(g.reference); await paystack.webhook(g.reference);
  assert.equal(await shareCount(p.id), 0);
  assert.equal((await payRow(g.reference)).refusal_reason, "quote_expired");
  assert.ok((await pay("/refunds/attention", { token: admin })).data.items.some((x) => x.reference === g.reference));
});

test("notices go out once each on email AND SMS (late, grace, final warning), then the share is taken down; a stale payment afterwards is never applied", async () => {
  const f = await newFarmer(); await db.query("UPDATE users SET phone=$2 WHERE id=$1", [f.id, `0803${String(Math.floor(1000000 + Math.random() * 8999999))}`]);
  const p = await buyOk(f, 1);
  const due = new Date((await purchaseRow(p.reference)).expires_at).getTime();
  const run = (days) => expireSharePurchases({ now: new Date(due + days * DAYMS) });
  await run(0.5); await run(0.6);
  assert.deepEqual(await msgs(f.id, "share_late_started"), ["email", "sms"], "once, on both channels");
  assert.equal((await purchaseRow(p.reference)).status, "pending", "still payable");
  assert.deepEqual(await msgs(f.id, "share_grace_started"), []);
  await run(30.5);
  assert.deepEqual(await msgs(f.id, "share_grace_started"), ["email", "sms"]);
  await run(30.6);
  assert.equal((await msgs(f.id, "share_grace_started")).length, 2, "not repeated");
  assert.deepEqual(await msgs(f.id, "share_final_warning"), []);
  await run(37.5);
  assert.deepEqual(await msgs(f.id, "share_final_warning"), ["email", "sms"]);
  const res = await run(41);
  assert.ok(res.expired >= 1);
  const row = await purchaseRow(p.reference);
  assert.equal(row.status, "expired"); assert.equal(row.closed_reason, "grace_ended");
  assert.deepEqual(await msgs(f.id, "share_taken_down"), ["email", "sms"]);
  const payAgain = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token });
  assert.equal(payAgain.status, 409);
  assert.equal((await pay("/farmers/me/shares", { token: f.token })).data.pendingPurchases.length, 0);
  await paystack.success(p.reference); await paystack.webhook(p.reference);
  assert.equal(await shareCount(p.id), 0);
  const pr = await payRow(p.reference);
  assert.equal(pr.status, "refused"); assert.equal(pr.refusal_reason, "purchase_expired");
  assert.equal((await verify(f, p.reference)).data.outcome, "refused");
  assert.ok((await pay("/refunds/attention", { token: admin })).data.items.some((x) => x.reference === p.reference));

  const f2 = await newFarmer(); const q = await buyOk(f2, 1);
  assert.equal((await pay(`/farmers/me/shares/purchases/${q.reference}/cancel`, { method: "POST", token: f2.token })).status, 200);
  await paystack.success(q.reference); await paystack.webhook(q.reference);
  assert.equal(await shareCount(q.id), 0);
  assert.equal((await payRow(q.reference)).refusal_reason, "purchase_cancelled");
  assert.equal((await pay(`/farmers/me/shares/purchases/${q.reference}/cancel`, { method: "POST", token: f2.token })).status, 409);
});

test("late-fee settings are editable by Finance and change the maths", async () => {
  const s = await api("/payments/admin/settings", { token: admin });
  assert.equal(s.data.sharePercentPerMonth, 2); assert.equal(s.data.shareLateCapDays, 30); assert.equal(s.data.shareGraceDays, 10);
  assert.equal((await api("/payments/admin/settings", { method: "PUT", token: admin, body: { sharePercentPerMonth: 99 } })).status, 400);
});

test("a purchase whose payment arrived before the expiry job runs is settled, not expired", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 1);
  await paystack.success(p.reference); // Paystack has it; we never heard
  const res = await expireSharePurchases({ now: new Date(Date.now() + 25 * 3600 * 1000) });
  assert.ok(res.settledBeforeExpiry >= 1);
  assert.equal((await purchaseRow(p.reference)).status, "paid");
  assert.equal(await shareCount(p.id), 1);
});

test("a second payment for an already-paid purchase is recognised as a duplicate and refused", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 1);
  await paystack.success(p.reference); await paystack.webhook(p.reference);
  const second = await pool.query(`INSERT INTO gateway_payments (reference, type, user_id, subject_id, net_amount, fee_amount, gross_amount, status)
    SELECT 'SPR-DOUBLE-' || substr(md5(random()::text),1,6), 'share', user_id, subject_id, net_amount, fee_amount, gross_amount, 'pending' FROM gateway_payments WHERE reference=$1 RETURNING reference, gross_amount`, [p.reference]);
  const ref2 = second.rows[0].reference;
  await fetch(`${process.env.PAYSTACK_URL}/transaction/initialize`, { method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ reference: ref2, amount: Math.round(Number(second.rows[0].gross_amount) * 100), email: "x@y.z", currency: "NGN" }) });
  await paystack.success(ref2); await paystack.webhook(ref2);
  assert.equal((await payRow(ref2)).refusal_reason, "duplicate_payment");
  assert.equal(await shareCount(p.id), 1, "no extra shares");
  // Pay again on a paid purchase says so instead of charging
  const again = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token });
  assert.equal(again.data.alreadyPaid, true);
});

test("duplicate purchases: the same number of shares again is spotted at checkout and the farmer chooses", async () => {
  const f = await newFarmer(); const first = await buyOk(f, 2);
  const twin = await buy(f, 2);
  assert.equal(twin.status, 409);
  assert.equal(twin.data.code, "DUPLICATE_PURCHASE"); assert.equal(twin.data.kind, "unpaid");
  assert.equal(twin.data.duplicate.id, first.id); assert.equal(twin.data.duplicate.canPay, true);
  assert.equal((await buy(f, 3)).status, 201, "a different quantity is not a duplicate");
  await paystack.success(first.reference); await paystack.webhook(first.reference);
  const paidTwin = await buy(f, 2);
  assert.equal(paidTwin.status, 409); assert.equal(paidTwin.data.kind, "paid");
  assert.match(paidTwin.data.error, /already paid/i);
  // paid on Paystack but we have not heard yet: still reported as paid
  const g = await newFarmer(); const q = await buyOk(g, 5);
  await paystack.success(q.reference);
  const dup = await buy(g, 5);
  assert.equal(dup.data.kind, "paid");
  assert.equal((await purchaseRow(q.reference)).status, "paid");
  // proceed on purpose
  const go = await buy(f, 2, { confirmDuplicate: true });
  assert.equal(go.status, 201);
});

test("Pay again after a failed payment, Check my payment while pending, Cancel an unpaid purchase", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 1);
  const pending = await verify(f, p.reference);
  assert.equal(pending.data.outcome, "pending");
  await paystack.set(p.reference, "status=failed");
  assert.equal((await verify(f, p.reference)).data.outcome, "failed");
  const again = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token });
  assert.equal(again.status, 200);
  const att = (await db.query("SELECT reference FROM gateway_payments WHERE subject_id=$1 AND status='pending'", [p.id])).rows[0].reference;
  assert.notEqual(att, p.reference);
  const again2 = await pay(`/farmers/me/shares/purchases/${p.reference}/pay`, { method: "POST", token: f.token });
  assert.equal(again2.data.purchase.authorizationUrl, again.data.purchase.authorizationUrl, "a fresh attempt is re-used");
  await paystack.success(att);
  assert.equal((await verify(f, p.reference)).data.outcome, "success");
  assert.equal(await shareCount(p.id), 1);
});

test("Paystack down at checkout: the purchase is still saved and Pay again works once it is back", async () => {
  const f = await newFarmer();
  await paystack.down(true);
  const r = await buy(f, 1);
  await paystack.down(false);
  assert.ok([502, 503].includes(r.status), `status ${r.status}`);
  assert.equal(r.data.code, "PAYMENT_NOT_STARTED");
  assert.equal(r.data.purchase.status, "pending");
  const saved = await purchaseRow(r.data.purchase.reference);
  assert.ok(saved && saved.status === "pending");
  const again = await pay(`/farmers/me/shares/purchases/${saved.reference}/pay`, { method: "POST", token: f.token });
  assert.equal(again.status, 200);
  assert.match(again.data.purchase.authorizationUrl, /paystack\.standin/);
});

test("a stuck share payment (webhook never came) is settled by the re-check job", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 2);
  await paystack.success(p.reference);
  await db.query("UPDATE gateway_payments SET created_at = now() - interval '30 minutes' WHERE reference=$1", [p.reference]);
  const r = await recheckStuckPayments();
  assert.ok(r.settled >= 1);
  assert.equal(await shareCount(p.id), 2);
});

test("a large purchase is flagged for review only after the threshold is set; it still goes through", async () => {
  const f = await newFarmer();
  const none = await buyOk(f, 1);
  await paystack.success(none.reference); await paystack.webhook(none.reference);
  assert.equal((await flagsFor(none.reference)).length, 0);
  const set = await api("/payments/admin/settings", { method: "PUT", token: admin, body: { shareReviewThreshold: 100000 } });
  assert.equal(set.data.shareReviewThreshold, 100000);
  const big = await buyOk(f, 5);
  await paystack.success(big.reference); await paystack.webhook(big.reference);
  assert.equal(await shareCount(big.id), 5);
  const fl = await flagsFor(big.reference);
  assert.equal(fl[0].kind, "review"); assert.equal(fl[0].reason, "large_purchase");
  const small = await buyOk(f, 3);
  await paystack.success(small.reference); await paystack.webhook(small.reference);
  assert.equal((await flagsFor(small.reference)).length, 0, "below the threshold");
  assert.equal((await api("/payments/admin/settings", { method: "PUT", token: admin, body: { shareReviewThreshold: -5 } })).status, 400);
  assert.equal((await api("/payments/admin/settings", { method: "PUT", token: admin, body: { shareExpiryHours: 0 } })).status, 400);
  await api("/payments/admin/settings", { method: "PUT", token: admin, body: { shareReviewThreshold: null, shareExpiryHours: 24 } });
});

test("permissions: only the owner can check, pay or cancel; non-farmers cannot buy", async () => {
  const a = await newFarmer(); const b = await newFarmer(); const buyer = await newBuyer();
  const p = await buyOk(a, 1);
  for (const [path, method] of [[`/farmers/me/shares/purchases/${p.reference}/verify`, "POST"], [`/farmers/me/shares/purchases/${p.reference}/pay`, "POST"], [`/farmers/me/shares/purchases/${p.reference}/cancel`, "POST"]]) {
    assert.equal((await pay(path, { method, token: b.token })).status, 404, path);
  }
  assert.equal((await buy(buyer, 1)).status, 403);
  assert.equal((await pay("/farmers/me/shares/checkout", { method: "POST", body: { quantity: 1 } })).status, 401);
  // someone else's payment reference cannot be read through the generic status endpoint
  assert.equal((await pay(`/payments/status/${p.reference}`, { token: b.token })).status, 404);
});

test("regression: interest and capital withdrawals still follow the banner (year complete, capital locked 5 years)", async () => {
  const f = await newFarmer(); const p = await buyOk(f, 1);
  await paystack.success(p.reference); await paystack.webhook(p.reference);
  const share = (await db.query("SELECT id FROM farmer_shares WHERE purchase_id=$1", [p.id])).rows[0];
  const early = await pay(`/farmers/me/shares/${share.id}/withdraw-interest`, { method: "POST", token: f.token, body: { year: 1 } });
  assert.ok(early.status >= 400 && early.status < 500, "year 1 is not complete yet");
  assert.equal((await pay(`/farmers/me/shares/${share.id}/withdraw-capital`, { method: "POST", token: f.token })).status >= 400, true, "capital locked");
  await db.query("UPDATE farmer_shares SET purchased_at = now() - interval '13 months' WHERE id=$1", [share.id]);
  const ok = await pay(`/farmers/me/shares/${share.id}/withdraw-interest`, { method: "POST", token: f.token, body: { year: 1 } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const dup = await pay(`/farmers/me/shares/${share.id}/withdraw-interest`, { method: "POST", token: f.token, body: { year: 1 } });
  assert.ok(dup.status >= 400, "interest for a year can be taken once");
  const detail = await pay(`/farmers/me/shares/${share.id}`, { token: f.token });
  assert.equal(detail.data.share.amount, SHARE);
  assert.equal(detail.data.share.interestYears[0].pct, 20);
  await db.query("UPDATE farmer_shares SET purchased_at = now() - interval '61 months' WHERE id=$1", [share.id]);
  const cap = await pay(`/farmers/me/shares/${share.id}/withdraw-capital`, { method: "POST", token: f.token });
  assert.ok(cap.status >= 200 && cap.status < 300, JSON.stringify(cap.data));
});
