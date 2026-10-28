// Step 2 / Phase 3: corps access fee on the shared Paystack ledger
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, pay, strict, db, newCorper, newFarmer, loginAdmin, paystack, waitForMessage, sleep, PAY } from "../helpers/api.mjs";
import { calculateFee } from "../../src/services/paystack.js";
import { recheckStuckPayments } from "../../src/services/orderPayments.js";
import { pool } from "../../src/db/pool.js";
import { registerAllJobs } from "../../src/jobs/index.js";

registerAllJobs();
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET;
process.env.PAYSTACK_BASE_URL = process.env.PAYSTACK_URL;
after(async () => { await db.end(); await pool.end(); });

let admin;
const FEE = 5000;
const start = (m, accept = true) => pay("/corpers/payments/initiate", { method: "POST", token: m.token, body: accept ? { acceptNonRefundable: true } : {} });
const verify = (m, ref) => pay(`/corpers/payments/${ref}/verify`, { method: "POST", token: m.token, body: {} });
const cp = async (ref) => (await db.query("SELECT * FROM corper_payments WHERE reference=$1", [ref])).rows[0];
const gp = async (ref) => (await db.query("SELECT * FROM gateway_payments WHERE reference=$1", [ref])).rows[0];
const income = async (ref) => (await db.query("SELECT amount FROM finance_income WHERE description = $1", [`Corps access fee ${ref}`])).rows;
const flags = async (ref) => (await db.query("SELECT f.* FROM payment_flags f JOIN gateway_payments p ON p.id=f.payment_id WHERE p.reference=$1", [ref])).rows;
async function begin(m = null) { m = m || await newCorper(); const r = await start(m); assert.equal(r.status, 201, JSON.stringify(r.data)); return { m, p: r.data.payment }; }
const OLD_WEBHOOK = `${PAY}/api/corpers/paystack-webhook`;

test("setup", async () => {
  admin = await loginAdmin();
  assert.equal((await pay("/rtc/admin/corps/fee", { method: "PUT", token: admin, body: { amount: FEE } })).status, 200);
});

test("the member sees the access fee, Paystack's processing fee as its own line, and the non-refundable notice", async () => {
  const m = await newCorper();
  const r = await pay("/corpers/payments", { token: m.token });
  const exp = calculateFee(FEE);
  assert.equal(r.data.quote.accessFee, FEE);
  assert.equal(r.data.quote.processingFee, exp.fee);
  assert.equal(r.data.quote.totalToPay, exp.gross);
  assert.match(r.data.nonRefundableNotice, /non-refundable once paid/i);
});

test("the member must tick 'non-refundable once paid'; the time of the tick is stored; the fee is worked out on the server", async () => {
  const m = await newCorper();
  const no = await start(m, false);
  assert.equal(no.status, 400);
  assert.match(no.data.error, /non-refundable/i);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM corper_payments WHERE user_id=$1", [m.id])).rows[0].n, 0, "nothing created without the tick");
  const r = await pay("/corpers/payments/initiate", { method: "POST", token: m.token, body: { acceptNonRefundable: true, amount: 1 } }); // browser-sent amount is ignored
  assert.equal(r.status, 201);
  const p = r.data.payment; const exp = calculateFee(FEE);
  assert.equal(p.accessFee, FEE); assert.equal(p.processingFee, exp.fee); assert.equal(p.totalCharged, exp.gross);
  assert.ok(p.nonRefundableAcceptedAt);
  const row = await cp(p.reference);
  assert.equal(Number(row.amount), FEE); assert.equal(Number(row.processing_fee), exp.fee); assert.equal(Number(row.total_charged), exp.gross);
  assert.ok(row.non_refundable_accepted_at);
  const g = await gp(p.reference);
  assert.equal(g.type, "corps_fee"); assert.equal(Number(g.net_amount), FEE); assert.equal(Number(g.gross_amount), exp.gross);
  assert.equal((await paystack.tx(p.reference)).amount, Math.round(exp.gross * 100), "Paystack is asked for the gross amount");
  // starting again returns the same waiting payment
  assert.equal((await start(m)).data.payment.reference, p.reference);
});

test("a verified payment (shared webhook) unlocks access; Finance income is the ACCESS FEE only; receipt, Finance notice and ledger line", async () => {
  const { m, p } = await begin();
  await paystack.success(p.reference);
  assert.equal((await paystack.webhook(p.reference)).appStatus, 200);
  const row = await cp(p.reference);
  assert.equal(row.status, "paid");
  const inc = await income(p.reference);
  assert.equal(inc.length, 1);
  assert.equal(Number(inc[0].amount), FEE, "income is the access fee, not the amount charged");
  const g = await gp(p.reference);
  assert.equal(g.status, "success"); assert.equal(Number(g.fee_amount), calculateFee(FEE).fee);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='corps_receipt'", [m.id]), "member receipt");
  assert.ok(await waitForMessage("template='payment_finance_notice' AND body_text ILIKE $1", [`%${p.reference}%`]), "Finance notice");
  const led = (await api("/payments/admin/ledger?type=corps_fee", { token: admin })).data.payments.find((x) => x.reference === p.reference);
  assert.ok(led); assert.equal(led.typeLabel, "Corps fee");
  const v = await verify(m, p.reference);
  assert.equal(v.data.outcome, "success"); assert.equal(v.data.access.paid, true);
  assert.equal((await pay("/corpers/payments/initiate", { method: "POST", token: m.token, body: { acceptNonRefundable: true } })).status, 409, "already paid");
  // the admin list shows the breakdown
  const list = (await pay(`/rtc/admin/corps/payments?q=${p.reference}`, { token: admin })).data.payments[0];
  assert.equal(list.accessFee, FEE); assert.equal(list.processingFee, calculateFee(FEE).fee);
});

test("the OLD corps webhook address keeps working and behaves the same", async () => {
  const { p } = await begin();
  await paystack.success(p.reference);
  assert.equal((await paystack.webhook(p.reference, { target: OLD_WEBHOOK })).appStatus, 200);
  assert.equal((await cp(p.reference)).status, "paid");
  assert.equal((await income(p.reference)).length, 1);
});

test("webhook + return-page check + duplicate webhook together credit the member exactly once", async () => {
  const { m, p } = await begin();
  await paystack.success(p.reference);
  await Promise.all([paystack.webhook(p.reference), paystack.webhook(p.reference, { target: OLD_WEBHOOK }), verify(m, p.reference), verify(m, p.reference)]);
  assert.equal((await income(p.reference)).length, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM messages WHERE template='corps_receipt' AND to_user_id=$1", [m.id])).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM finance_transactions WHERE related_id=$1", [(await cp(p.reference)).id])).rows[0].n, 1);
});

test("a bad signature is rejected on both addresses and changes nothing", async () => {
  const { p } = await begin();
  await paystack.success(p.reference);
  assert.equal((await paystack.webhook(p.reference, { bad: true })).appStatus, 401);
  assert.equal((await paystack.webhook(p.reference, { bad: true, target: OLD_WEBHOOK })).appStatus, 401);
  assert.equal((await cp(p.reference)).status, "pending");
});

test("a wrong amount is refused automatically; the member is told; they can start again", async () => {
  const { m, p } = await begin();
  await paystack.success(p.reference, "amountKobo=100");
  await paystack.webhook(p.reference);
  assert.equal((await cp(p.reference)).status, "pending", "no access granted");
  const g = await gp(p.reference);
  assert.equal(g.status, "refused"); assert.equal(g.refusal_reason, "amount_mismatch"); assert.equal(g.refund_status, "due");
  assert.equal((await income(p.reference)).length, 0);
  const v = await verify(m, p.reference);
  assert.equal(v.data.outcome, "refused"); assert.match(v.data.refusalText, /amount/);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='payment_refused'", [m.id]));
  assert.ok((await pay("/refunds/attention", { token: admin })).data.items.some((r) => r.reference === p.reference));
  // starting again closes the spent attempt and creates a fresh one
  const again = await start(m);
  assert.equal(again.status, 201);
  assert.notEqual(again.data.payment.reference, p.reference);
  await paystack.success(again.data.payment.reference); await paystack.webhook(again.data.payment.reference);
  assert.equal((await cp(again.data.payment.reference)).status, "paid");
});

test("a failed payment is reported plainly and can be retried", async () => {
  const { m, p } = await begin();
  await paystack.set(p.reference, "status=failed");
  assert.equal((await verify(m, p.reference)).data.outcome, "failed");
  const again = await start(m);
  assert.equal(again.status, 201);
  assert.notEqual(again.data.payment.reference, p.reference);
});

test("a payment from a stale page after the member already paid is refused as a duplicate, and the member stays paid", async () => {
  const m = await newCorper();
  const a = (await start(m)).data.payment;
  assert.equal((await pay(`/corpers/payments/${a.id}/cancel`, { method: "POST", token: m.token, body: {} })).status, 200);
  const b = (await start(m)).data.payment;
  await paystack.success(b.reference); await paystack.webhook(b.reference);
  assert.equal((await cp(b.reference)).status, "paid");
  await paystack.success(a.reference); await paystack.webhook(a.reference);
  assert.equal((await gp(a.reference)).refusal_reason, "duplicate_payment");
  assert.equal((await cp(a.reference)).status, "cancelled");
  assert.equal((await income(a.reference)).length, 0, "no second income");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM corper_payments WHERE user_id=$1 AND status='paid'", [m.id])).rows[0].n, 1);
});

test("a payment the member cancelled and then paid from a stale page is refused (cancelled)", async () => {
  const m = await newCorper();
  const a = (await start(m)).data.payment;
  await pay(`/corpers/payments/${a.id}/cancel`, { method: "POST", token: m.token, body: {} });
  await paystack.success(a.reference); await paystack.webhook(a.reference);
  assert.equal((await gp(a.reference)).refusal_reason, "payment_cancelled");
  assert.equal((await cp(a.reference)).status, "cancelled");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM corper_payments WHERE user_id=$1 AND status='paid'", [m.id])).rows[0].n, 0, "no access from a cancelled payment");
  assert.equal((await gp(a.reference)).refund_status, "due");
});

test("NO refunds: the admin refund action is gone; payments refunded earlier stay visible as history", async () => {
  const { m, p } = await begin();
  await paystack.success(p.reference); await paystack.webhook(p.reference);
  const row = await cp(p.reference);
  const r = await pay(`/rtc/admin/corps/payments/${row.id}/refund`, { method: "POST", token: admin, body: { reason: "please" } });
  assert.equal(r.status, 404);
  assert.equal((await cp(p.reference)).status, "paid", "still paid, access unchanged");
  // legacy: a row refunded before this change is listed, with its reason
  await db.query("UPDATE corper_payments SET status='refunded', refund_reason='old refund', refunded_at=now() WHERE id=$1", [row.id]);
  const list = (await pay("/rtc/admin/corps/payments?status=refunded", { token: admin })).data.payments;
  assert.ok(list.some((x) => x.id === row.id && x.refundReason === "old refund"));
});

test("manual confirmation is safe: Paystack is asked first; unpaid cannot be confirmed; paid is confirmed through the verified path", async () => {
  const { p } = await begin();
  const row = await cp(p.reference);
  const unpaid = await pay(`/rtc/admin/corps/payments/${row.id}/confirm`, { method: "POST", token: admin, body: {} });
  assert.equal(unpaid.status, 409);
  assert.match(unpaid.data.error, /not been received/i);
  assert.equal((await cp(p.reference)).status, "pending");
  // Paystack has the money; the webhook never reached us
  await paystack.success(p.reference);
  const ok = await pay(`/rtc/admin/corps/payments/${row.id}/confirm`, { method: "POST", token: admin, body: {} });
  assert.equal(ok.status, 200);
  assert.equal((await cp(p.reference)).status, "paid");
  assert.equal((await income(p.reference)).length, 1);
  assert.equal((await flags(p.reference)).length, 0, "verified by Paystack: nothing to review");
  assert.equal((await cp(p.reference)).confirmed_unverified, false);
});

test("Paystack unreachable: an admin may confirm by hand, but only with a reason; it is logged, flagged, and a later Paystack report is not credited twice", async () => {
  const { m, p } = await begin();
  const row = await cp(p.reference);
  await paystack.down(true);
  const noReason = await pay(`/rtc/admin/corps/payments/${row.id}/confirm`, { method: "POST", token: admin, body: {} });
  assert.equal(noReason.status, 400);
  assert.match(noReason.data.error, /reason|reference/i);
  assert.equal((await cp(p.reference)).status, "pending");
  const ok = await pay(`/rtc/admin/corps/payments/${row.id}/confirm`, { method: "POST", token: admin, body: { reason: "Bank transfer ref TRF-8841 seen on the statement" } });
  await paystack.down(false);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.payment.confirmedUnverified, true);
  assert.ok(await waitForMessage("template='manual_confirmation_notice' AND body_text ILIKE $1", [`%${p.reference}%`]), "every admin is told a payment was confirmed without Paystack");
  assert.match(ok.data.payment.manualReason, /TRF-8841/);
  assert.equal((await cp(p.reference)).status, "paid");
  assert.equal((await income(p.reference)).length, 1);
  const fl = await flags(p.reference);
  assert.equal(fl.length, 1); assert.equal(fl[0].kind, "review"); assert.equal(fl[0].reason, "manual_confirmation");
  assert.equal((await gp(p.reference)).status, "success");
  assert.ok((await db.query("SELECT 1 FROM finance_audit_log WHERE action='corps_payment_confirmed_without_paystack' AND details->>'payment'=$1", [p.reference])).rowCount >= 1);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='corps_receipt'", [m.id]));
  // the money really did arrive at Paystack afterwards: not credited a second time
  await paystack.success(p.reference);
  await paystack.webhook(p.reference);
  await verify(m, p.reference);
  assert.equal((await income(p.reference)).length, 1, "credited once");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM finance_transactions WHERE related_id=$1", [row.id])).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM corper_payments WHERE user_id=$1 AND status='paid'", [m.id])).rows[0].n, 1);
  // the flag shows in the Finance list
  const led = (await api("/payments/admin/ledger?type=corps_fee", { token: admin })).data.payments.find((x) => x.reference === p.reference);
  assert.match(led.review_reasons, /manual_confirmation/);
});

test("an admin can re-check a stuck pending payment, and the scheduled re-check does it automatically", async () => {
  const { p } = await begin();
  const row = await cp(p.reference);
  await paystack.success(p.reference);
  const r = await pay(`/rtc/admin/corps/payments/${row.id}/recheck`, { method: "POST", token: admin });
  assert.equal(r.status, 200);
  assert.equal(r.data.payment.status, "paid");
  // scheduled
  const { p: q } = await begin();
  await paystack.success(q.reference);
  await db.query("UPDATE gateway_payments SET created_at = now() - interval '30 minutes' WHERE reference=$1", [q.reference]);
  const job = await recheckStuckPayments({ limit: 1000 });
  assert.ok(job.settled >= 1);
  assert.equal((await cp(q.reference)).status, "paid");
  // Paystack down: re-check says so and changes nothing
  const { p: z } = await begin();
  await paystack.down(true);
  const down = await pay(`/rtc/admin/corps/payments/${(await cp(z.reference)).id}/recheck`, { method: "POST", token: admin });
  await paystack.down(false);
  assert.equal(down.data.unreachable, true);
  assert.equal((await cp(z.reference)).status, "pending");
});

test("without a Paystack key the fee screen still works in manual mode; with a key but no tick nothing starts; permissions hold", async () => {
  const m = await newCorper(); const other = await newCorper(); const farmer = await newFarmer();
  // server A has no Paystack key: manual mode, no processing fee, still needs the tick
  const a = await api("/corpers/payments", { token: m.token });
  assert.equal(a.data.mode, "manual"); assert.equal(a.data.quote.processingFee, 0);
  assert.equal((await api("/corpers/payments/initiate", { method: "POST", token: m.token, body: {} })).status, 400);
  const man = await api("/corpers/payments/initiate", { method: "POST", token: m.token, body: { acceptNonRefundable: true } });
  assert.equal(man.status, 201); assert.equal(man.data.payment.provider, "manual"); assert.equal(man.data.payment.totalCharged, FEE);
  // the admin confirms a manual payment directly (no Paystack to ask)
  const row = await db.query("SELECT id FROM corper_payments WHERE reference=$1", [man.data.payment.reference]);
  assert.equal((await api(`/rtc/admin/corps/payments/${row.rows[0].id}/confirm`, { method: "POST", token: admin, body: {} })).status, 200);
  // permissions
  const { p } = await begin();
  assert.equal((await verify(other, p.reference)).status, 404, "someone else's payment");
  assert.equal((await pay("/corpers/payments/initiate", { method: "POST", token: farmer.token, body: { acceptNonRefundable: true } })).status, 403);
  assert.equal((await pay(`/rtc/admin/corps/payments/${row.rows[0].id}/recheck`, { method: "POST", token: other.token })).status, 403);
  // the production-mode server has a key-less setup: unavailable, never a free unlock
  const prod = await strict("/corpers/payments/initiate", { method: "POST", token: other.token, body: { acceptNonRefundable: true } });
  assert.ok([201, 503].includes(prod.status));
});

test("the summary counts the access fee only", async () => {
  const s = (await pay("/rtc/admin/corps/payments/summary", { token: admin })).data;
  const sum = (await db.query("SELECT COALESCE(SUM(amount),0)::float8 AS t FROM corper_payments WHERE status='paid'")).rows[0].t;
  assert.equal(s.collected, sum);
});

test("no second payment: the system scans Paystack for an earlier payment first, and after payment there is nothing left to pay", async () => {
  const { m, p } = await begin();
  await paystack.success(p.reference); // Paystack has the money; the webhook never arrived and the tab was closed
  assert.equal((await cp(p.reference)).status, "pending");
  const again = await start(m);
  assert.equal(again.status, 409);
  assert.match(again.data.error, /earlier payment|already paid/i);
  assert.equal((await cp(p.reference)).status, "paid", "the earlier payment was found and applied");
  assert.equal((await income(p.reference)).length, 1, "counted once");
  // the dashboard is open; asking again never creates another payment
  assert.equal((await start(m)).status, 409);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM corper_payments WHERE user_id=$1", [m.id])).rows[0].n, 1);
  const acc = await pay("/corpers/payments", { token: m.token });
  assert.equal(acc.status, 200);
});
