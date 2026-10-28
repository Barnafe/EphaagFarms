// Step 2 / Phase 1: buyer checkout with Paystack (against a stand-in Paystack)
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, pay, db, newBuyer, loginAdmin, firstCrop, orderBody, paystack, waitForMessage, sleep, API, PAY } from "../helpers/api.mjs";
import { calculateFee, paystackFeeOn, DEFAULT_FEE_CONFIG } from "../../src/services/paystack.js";
import { expireUnpaidOrders, recheckStuckPayments } from "../../src/services/orderPayments.js";
import { pool } from "../../src/db/pool.js";
import { registerAllJobs } from "../../src/jobs/index.js";

registerAllJobs();
// The jobs under test run in this process, so point it at the stand-in Paystack too.
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET;
process.env.PAYSTACK_BASE_URL = process.env.PAYSTACK_URL;
after(async () => { await db.end(); await pool.end(); });

let crop, admin;
async function place(buyer, qty = 2) {
  const r = await pay("/orders", { method: "POST", token: buyer.token, body: orderBody(crop.crop, qty) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
const orderRow = async (id) => (await db.query("SELECT * FROM orders WHERE id=$1", [id])).rows[0];
const payRow = async (ref) => (await db.query("SELECT * FROM gateway_payments WHERE reference=$1", [ref])).rows[0];
const events = async (id) => (await db.query("SELECT event FROM order_events WHERE order_id=$1 ORDER BY id", [id])).rows.map((r) => r.event);
const flagsFor = async (ref) => (await db.query("SELECT f.* FROM payment_flags f JOIN gateway_payments p ON p.id=f.payment_id WHERE p.reference=$1 ORDER BY f.created_at", [ref])).rows;

test("setup", async () => { crop = await firstCrop(); admin = await loginAdmin(); assert.ok(crop); });

test("fee maths: the payer pays the fee and EPHAAG nets the listed price, including the 2,500 and 2,000 edges", () => {
  const bad = [];
  for (const net of [100, 999.99, 2000, 2400, 2450, 2499, 2500, 2501, 2540, 3000, 10000, 50000, 100000, 130000, 131000, 132000, 135000, 1000000, 25000, 2437.5]) {
    const r = calculateFee(net);
    const got = Math.round((r.gross - paystackFeeOn(r.gross)) * 100) / 100;
    if (got < net - 0.005 || Math.abs(r.gross - net - r.fee) > 0.005) bad.push({ net, r, got });
    assert.ok(r.fee <= DEFAULT_FEE_CONFIG.cap + 0.005, `fee capped for ${net}`);
  }
  assert.deepEqual(bad, []);
  assert.equal(calculateFee(2400).fee < 2400 * 0.0155, true, "no flat ₦100 under ₦2,500");
  assert.equal(calculateFee(1000000).fee, 2000, "capped at ₦2,000");
  assert.ok(calculateFee(2500).fee > 100, "flat ₦100 applies from ₦2,500");
  const custom = calculateFee(10000, { percent: 2, flat: 0, waiverUnder: 0, cap: 500 });
  assert.equal(custom.fee <= 500, true);
});

test("an upfront order is saved as awaiting payment (never 'paid'), with the fee worked out on the server", async () => {
  const b = await newBuyer();
  const out = await place(b);
  const o = out.order;
  assert.equal(o.status, "awaiting_payment");
  const goods = Number(crop.sell_price) * 2;
  assert.equal(Number(o.goods_total), goods);
  const expected = calculateFee(goods);
  assert.equal(out.payment.fee, expected.fee);
  assert.equal(out.payment.amountCharged, expected.gross);
  assert.equal(Number(o.amount_charged), expected.gross);
  assert.match(out.payment.authorizationUrl, /paystack\.standin\/pay\/OPR-/);
  const hours = (new Date(o.expires_at) - Date.now()) / 3600000;
  assert.ok(hours > 23.9 && hours <= 24, `expires in ~24h, got ${hours}`);
  assert.deepEqual(await events(o.id), ["placed_awaiting_payment"]);
  // what Paystack was asked to charge is the gross amount, in kobo
  const t = await paystack.tx(out.payment.reference);
  assert.equal(t.amount, Math.round(expected.gross * 100));
  assert.equal(t.email, "buyer@example.test");
  // the buyer cannot tamper with the price
  const tamper = await pay("/orders", { method: "POST", token: b.token, body: { ...orderBody(crop.crop, 1), total: 1, price: 1 } });
  assert.equal(Number(tamper.data.order.goods_total), Number(crop.sell_price));
});

test("without a Paystack key an order is refused ('unavailable'), never accepted for free", async () => {
  const b = await newBuyer();
  const before = (await db.query("SELECT count(*)::int AS n FROM orders WHERE buyer_id=$1", [b.id])).rows[0].n;
  const r = await api("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop) }); // server A has no key
  assert.equal(r.status, 503);
  assert.match(r.data.error, /unavailable/i);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM orders WHERE buyer_id=$1", [b.id])).rows[0].n, before);
  const c = await api("/orders/commitment", { method: "POST", token: b.token, body: { amount: 1000, years: 1 } });
  assert.equal(c.status, 503);
});

test("a verified payment (webhook) confirms the order, reaches Procurement, notifies Finance and sends a receipt", async () => {
  const b = await newBuyer();
  const out = await place(b);
  const ref = out.payment.reference;
  assert.equal((await orderRow(out.order.id)).status, "awaiting_payment");
  await paystack.success(ref);
  const w = await paystack.webhook(ref);
  assert.equal(w.appStatus, 200);
  const o = await orderRow(out.order.id);
  assert.equal(o.status, "payment_confirmed");
  assert.equal(o.payment_reference, ref);
  assert.ok(o.paid_at);
  const p = await payRow(ref);
  assert.equal(p.status, "success");
  assert.equal(Number(p.net_amount), Number(o.goods_total));
  assert.equal(Number(p.gross_amount), Number(o.amount_charged));
  assert.deepEqual(await events(o.id), ["placed_awaiting_payment", "payment_confirmed"]);
  // Procurement's queue sees it without anyone clicking confirm
  const queue = await api("/procurement/orders", { token: admin }).catch(() => null);
  const inQueue = (await db.query("SELECT 1 FROM orders WHERE id=$1 AND status='payment_confirmed'", [o.id])).rowCount;
  assert.equal(inQueue, 1);
  // receipt to the buyer, notice to Finance
  assert.ok(await waitForMessage("to_user_id=$1 AND template='order_receipt'", [b.id]), "buyer receipt");
  assert.ok(await waitForMessage("template='payment_finance_notice' AND body_text ILIKE $1", [`%${ref}%`]), "finance notice");
  // accounting list
  const led = await api("/payments/admin/ledger?type=order", { token: admin });
  const line = led.data.payments.find((x) => x.reference === ref);
  assert.ok(line);
  assert.equal(line.recorded, false);
  assert.equal(line.typeLabel, "Order");
  const tick = await api(`/payments/admin/ledger/${line.id}/recorded`, { method: "POST", token: admin, body: { recorded: true } });
  assert.equal(tick.data.payment.recorded, true);
  const csv = await fetch(`${API}/api/payments/admin/ledger.csv?type=order`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), new RegExp(ref));
});

test("webhook + return-page check + a duplicate webhook together confirm the order exactly once", async () => {
  const b = await newBuyer();
  const out = await place(b);
  const ref = out.payment.reference;
  await paystack.success(ref);
  const results = await Promise.all([
    paystack.webhook(ref), paystack.webhook(ref),
    pay(`/payments/status/${ref}`, { token: b.token }), pay(`/payments/status/${ref}`, { token: b.token }),
  ]);
  assert.equal(results[0].appStatus, 200);
  assert.equal(results[2].data.outcome, "success");
  assert.equal((await events(out.order.id)).filter((e) => e === "payment_confirmed").length, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM messages WHERE template='order_receipt' AND to_user_id=$1", [b.id])).rows[0].n, 1);
  assert.equal((await flagsFor(ref)).length, 0);
});

test("a webhook with a bad signature is rejected, logged and changes nothing", async () => {
  const b = await newBuyer();
  const out = await place(b);
  const ref = out.payment.reference;
  await paystack.success(ref);
  const w = await paystack.webhook(ref, { bad: true });
  assert.equal(w.appStatus, 401);
  assert.equal((await orderRow(out.order.id)).status, "awaiting_payment");
  assert.ok((await db.query("SELECT 1 FROM webhook_events WHERE source='paystack' AND status='bad_signature'")).rowCount >= 1);
  // the old corps webhook address still exists and is also signature-checked
  const old = await paystack.webhook(ref, { bad: true, target: `${PAY}/api/corpers/paystack-webhook` });
  assert.equal(old.appStatus, 401);
});

const refusedRow = async (ref) => (await db.query("SELECT status, refusal_reason, refund_status, paid_amount FROM gateway_payments WHERE reference=$1", [ref])).rows[0];

test("a wrong amount is REFUSED immediately and automatically: order untouched, buyer told on screen and by message, admins told, it waits in the Refund room", async () => {
  const b = await newBuyer();
  const out = await place(b);
  const ref = out.payment.reference;
  await paystack.success(ref, "amountKobo=100"); // paid ₦1 instead of the real amount
  await paystack.webhook(ref);
  assert.equal((await orderRow(out.order.id)).status, "awaiting_payment", "the order does not move");
  const p = await refusedRow(ref);
  assert.equal(p.status, "refused");
  assert.equal(p.refusal_reason, "amount_mismatch");
  assert.equal(p.refund_status, "due", "waits under Needs attention in the Refund room");
  assert.equal(Number(p.paid_amount), 1);
  assert.equal((await flagsFor(ref)).length, 0, "no Finance decision is needed, so nothing is flagged for one");
  assert.ok((await events(out.order.id)).includes("payment_refused"));
  // what the buyer sees
  const st = await pay(`/payments/status/${ref}`, { token: b.token });
  assert.equal(st.data.outcome, "refused");
  assert.equal(st.data.refusalReason, "amount_mismatch");
  assert.match(st.data.refusalText, /amount/);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='payment_refused'", [b.id]), "buyer notified");
  assert.ok(await waitForMessage("template='payment_attention' AND body_text ILIKE $1", [`%${ref}%`]), "admins told straight away");
  assert.match(st.data.refusalText, /amount/);
  const notice = await waitForMessage("to_user_id=$1 AND template='payment_refused'", [b.id]);
  assert.match(notice.body_text, /administrators|return/i, "the buyer is told the administrators will return the money");
  assert.doesNotMatch(notice.body_text, /automatically/i);
  // repeated webhooks and checks do not refuse twice or send twice
  await paystack.webhook(ref); await pay(`/payments/status/${ref}`, { token: b.token });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM messages WHERE template='payment_refused' AND to_user_id=$1", [b.id])).rows[0].n, 1);
  // it is NOT in the accounting list of confirmed payments, but IS under Needs attention in the Refund room
  const led = await api("/payments/admin/ledger?type=order", { token: admin });
  assert.ok(!led.data.payments.some((x) => x.reference === ref));
  const due = await pay("/refunds/attention", { token: admin });
  const line = due.data.items.find((x) => x.reference === ref);
  assert.ok(line); assert.match(line.reasonText, /amount/);
  // the buyer can simply pay again properly
  const retry = await pay(`/orders/${out.order.id}/pay`, { method: "POST", token: b.token });
  assert.equal(retry.status, 200);
  await paystack.success(retry.data.payment.reference); await paystack.webhook(retry.data.payment.reference);
  assert.equal((await orderRow(out.order.id)).status, "payment_confirmed");
});

test("a wrong currency is refused too", async () => {
  const b = await newBuyer(); const out = await place(b);
  await paystack.success(out.payment.reference, "currency=USD");
  await paystack.webhook(out.payment.reference);
  assert.equal((await orderRow(out.order.id)).status, "awaiting_payment");
  assert.equal((await refusedRow(out.payment.reference)).refusal_reason, "currency_mismatch");
});

test("Refund room: one place for refunds; full refunds only, a written reason is required, the payer is told, Paystack failures stay on the list", async () => {
  const mk = async (qs = "") => { const b = await newBuyer(); const o = await place(b); await paystack.success(o.payment.reference, qs); await paystack.webhook(o.payment.reference); return { b, o, ref: o.payment.reference }; };
  const idOf = async (ref) => (await db.query("SELECT id FROM gateway_payments WHERE reference=$1", [ref])).rows[0].id;

  // the old refund features are gone
  assert.equal((await pay("/payments/admin/refunds", { token: admin })).status, 404);
  assert.equal((await pay("/payments/admin/refunds/00000000-0000-0000-0000-000000000000/mark-refunded", { method: "POST", token: admin, body: { note: "x" } })).status, 404);
  const st = await pay("/payments/admin/settings", { token: admin });
  assert.equal(st.data.autoRefund, undefined, "no automatic refund setting any more");

  // money that arrived but could not be applied waits under "Needs attention"
  const a = await mk("amountKobo=100"); const aid = await idOf(a.ref);
  assert.ok((await pay("/refunds/attention", { token: admin })).data.items.some((x) => x.reference === a.ref));
  assert.equal((await pay("/refunds/attention", { token: a.b.token })).status, 403, "admins only");
  assert.equal((await pay("/refunds/attention")).status, 401);

  // a written reason is required
  assert.equal((await pay(`/refunds/${aid}`, { method: "POST", token: admin, body: {} })).status, 400);
  assert.equal((await pay(`/refunds/${aid}`, { method: "POST", token: admin, body: { reason: "  " } })).status, 400);
  assert.equal((await pay("/refunds/not-a-uuid", { method: "POST", token: admin, body: { reason: "valid reason" } })).status, 404);

  // Paystack cannot refund: the payment stays on the list with a clear message, then works on retry
  await paystack.refundFail(true);
  const bad = await pay(`/refunds/${aid}`, { method: "POST", token: admin, body: { reason: "Wrong amount paid by mistake" } });
  assert.equal(bad.status, 502);
  assert.equal((await refusedRow(a.ref)).refund_status, "failed");
  assert.ok((await pay("/refunds/attention", { token: admin })).data.items.some((x) => x.reference === a.ref), "still needs attention");
  await paystack.refundFail(false);
  const ok = await pay(`/refunds/${aid}`, { method: "POST", token: admin, body: { reason: "Wrong amount paid by mistake" } });
  assert.equal(ok.status, 200);
  assert.equal((await refusedRow(a.ref)).refund_status, "refunded");
  assert.equal((await paystack.tx(a.ref)).refunded, true);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='refund_sent'", [a.b.id]), "the payer is told on the notification channels");
  // it leaves Needs attention and appears in History with its reason; a second refund is refused
  assert.ok(!(await pay("/refunds/attention", { token: admin })).data.items.some((x) => x.reference === a.ref));
  const hist = (await pay("/refunds/history", { token: admin })).data.items.find((x) => x.reference === a.ref);
  assert.ok(hist); assert.equal(hist.reason, "Wrong amount paid by mistake");
  assert.equal((await pay(`/refunds/${aid}`, { method: "POST", token: admin, body: { reason: "again please" } })).status, 409);

  // a payment that WAS applied (goods delivered wrongly and returned): found by search, refunded in full, the order is marked refunded
  const c = await mk(); const cid = await idOf(c.ref);
  assert.equal((await orderRow(c.o.order.id)).status, "payment_confirmed");
  assert.equal((await pay("/refunds/search?q=ab", { token: admin })).data.items.length, 0, "search needs at least 3 characters");
  const found = (await pay(`/refunds/search?q=${encodeURIComponent(c.ref)}`, { token: admin })).data.items.find((x) => x.id === cid);
  assert.ok(found); assert.equal(found.refundable, true);
  const blocked = await pay(`/refunds/${cid}`, { method: "POST", token: admin, headers: { "X-Acting-As": "Finance" }, body: { reason: "valid reason" } });
  assert.equal(blocked.status, 403, "a money action: refused while acting as a department");
  assert.equal((await pay(`/refunds/${cid}`, { method: "POST", token: c.b.token, body: { reason: "valid reason" } })).status, 403, "buyers cannot refund");
  assert.equal((await pay(`/refunds/${cid}`, { method: "POST", token: admin, body: { reason: "Goods delivered wrongly and returned" } })).status, 200);
  assert.equal((await orderRow(c.o.order.id)).status, "refunded");
  assert.ok((await events(c.o.order.id)).includes("refunded"));
  assert.equal((await paystack.tx(c.ref)).refunded, true);
  assert.equal((await pay(`/refunds/search?q=${encodeURIComponent(c.ref)}`, { token: admin })).data.items.find((x) => x.id === cid).refundable, false);
});

test("once an order expires its payment channel is closed; a payment that still arrives is refused automatically", async () => {
  const b = await newBuyer(); const out = await place(b);
  const ref = out.payment.reference;
  // 25 hours pass (the job takes the clock as a parameter)
  const res = await expireUnpaidOrders({ now: new Date(Date.now() + 25 * 3600 * 1000) });
  assert.ok(res.expired >= 1);
  assert.equal((await orderRow(out.order.id)).status, "expired");
  assert.ok((await events(out.order.id)).includes("expired"));
  assert.ok(await waitForMessage("to_user_id=$1 AND template='order_expired'", [b.id]));
  // the channel is closed on our side: no new link, no re-opening the old one
  const payNow = await pay(`/orders/${out.order.id}/pay`, { method: "POST", token: b.token });
  assert.equal(payNow.status, 409);
  assert.match(payNow.data.error, /expired/i);
  assert.equal(payNow.data.payment, undefined);
  const mine = (await pay("/orders/me", { token: b.token })).data.orders.find((o) => o.id === out.order.id);
  assert.equal(mine.can_pay, false);
  assert.equal((await db.query("SELECT status FROM gateway_payments WHERE reference=$1", [ref])).rows[0].status, "abandoned");
  // a payment page left open in another tab still gets paid: it is refused on the spot
  await paystack.success(ref);
  await paystack.webhook(ref);
  assert.equal((await orderRow(out.order.id)).status, "expired", "the order stays expired");
  const p = await refusedRow(ref);
  assert.equal(p.status, "refused"); assert.equal(p.refusal_reason, "order_expired"); assert.equal(p.refund_status, "due");
  assert.equal((await flagsFor(ref)).length, 0);
  const st = await pay(`/payments/status/${ref}`, { token: b.token });
  assert.equal(st.data.outcome, "refused");
  assert.match(st.data.refusalText, /expired/);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='payment_refused'", [b.id]));

  // the same for an order the buyer cancelled
  const b2 = await newBuyer(); const o2 = await place(b2);
  await pay(`/orders/${o2.order.id}/cancel`, { method: "POST", token: b2.token });
  await paystack.success(o2.payment.reference); await paystack.webhook(o2.payment.reference);
  assert.equal((await orderRow(o2.order.id)).status, "cancelled");
  assert.equal((await refusedRow(o2.payment.reference)).refusal_reason, "order_cancelled");
});

test("an order whose payment arrived is settled (not expired) when the expiry job runs", async () => {
  const b = await newBuyer(); const out = await place(b);
  await paystack.success(out.payment.reference); // webhook never reached us
  const res = await expireUnpaidOrders({ now: new Date(Date.now() + 25 * 3600 * 1000) });
  assert.ok(res.settledBeforeExpiry >= 1);
  assert.equal((await orderRow(out.order.id)).status, "payment_confirmed");
});

test("a failed payment can be retried with a new attempt and an unpaid order can be cancelled", async () => {
  const b = await newBuyer(); const out = await place(b);
  const ref1 = out.payment.reference;
  await paystack.set(ref1, "status=failed");
  const st = await pay(`/payments/status/${ref1}`, { token: b.token });
  assert.equal(st.data.outcome, "failed");
  const retry = await pay(`/orders/${out.order.id}/pay`, { method: "POST", token: b.token });
  assert.equal(retry.status, 200);
  const ref2 = retry.data.payment.reference;
  assert.notEqual(ref2, ref1);
  // asking again straight away re-uses the fresh pending attempt
  const again = await pay(`/orders/${out.order.id}/pay`, { method: "POST", token: b.token });
  assert.equal(again.data.payment.reference, ref2);
  await paystack.success(ref2);
  await paystack.webhook(ref2);
  assert.equal((await orderRow(out.order.id)).status, "payment_confirmed");

  const b2 = await newBuyer(); const o2 = await place(b2);
  assert.equal((await pay(`/orders/${o2.order.id}/cancel`, { method: "POST", token: b2.token })).status, 200);
  assert.equal((await orderRow(o2.order.id)).status, "cancelled");
  assert.equal((await pay(`/orders/${o2.order.id}/cancel`, { method: "POST", token: b2.token })).status, 409);
  // someone else's order
  const o3 = await place(b2);
  assert.equal((await pay(`/orders/${o3.order.id}/cancel`, { method: "POST", token: b.token })).status, 404);
  // cannot cancel after paying in another tab
  await paystack.success(o3.payment.reference);
  const c = await pay(`/orders/${o3.order.id}/cancel`, { method: "POST", token: b2.token });
  assert.equal(c.status, 409);
  assert.equal((await orderRow(o3.order.id)).status, "payment_confirmed");
});

test("a bank transfer shows 'waiting for your transfer' until Paystack confirms", async () => {
  const b = await newBuyer(); const out = await place(b);
  const ref = out.payment.reference;
  await paystack.set(ref, "status=pending&channel=bank_transfer");
  const st = await pay(`/payments/status/${ref}`, { token: b.token });
  assert.equal(st.data.outcome, "pending");
  assert.equal((await orderRow(out.order.id)).status, "awaiting_payment");
  await paystack.success(ref);
  assert.equal((await pay(`/payments/status/${ref}`, { token: b.token })).data.outcome, "success");
});

test("a second payment for an already-paid order is recognised as a duplicate and refused; Pay now on a paid order says so", async () => {
  const b = await newBuyer(); const out = await place(b);
  await paystack.success(out.payment.reference);
  await paystack.webhook(out.payment.reference);
  // force a second attempt on the same order (e.g. two browser tabs)
  const second = await pool.query(`INSERT INTO gateway_payments (reference, type, user_id, subject_id, net_amount, fee_amount, gross_amount, status)
    SELECT 'OPR-DOUBLE-' || substr(md5(random()::text),1,6), 'order', user_id, subject_id, net_amount, fee_amount, gross_amount, 'pending' FROM gateway_payments WHERE reference=$1 RETURNING reference, gross_amount`, [out.payment.reference]);
  const ref2 = second.rows[0].reference;
  const init = await fetch(`${process.env.PAYSTACK_URL}/transaction/initialize`, { method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ reference: ref2, amount: Math.round(Number(second.rows[0].gross_amount) * 100), email: "x@y.z", currency: "NGN" }) });
  assert.equal(init.status, 200);
  await paystack.success(ref2);
  await paystack.webhook(ref2);
  assert.equal((await refusedRow(ref2)).refusal_reason, "duplicate_payment");
  assert.equal((await orderRow(out.order.id)).status, "payment_confirmed");
  assert.equal((await events(out.order.id)).filter((e) => e === "payment_confirmed").length, 1);
  const st = await pay(`/payments/status/${ref2}`, { token: b.token });
  assert.equal(st.data.outcome, "refused");
  assert.match(st.data.refusalText, /already been paid/);
  // opening Pay now on an order that is already paid tells the buyer instead of charging again
  const again = await pay(`/orders/${out.order.id}/pay`, { method: "POST", token: b.token });
  assert.equal(again.status, 200);
  assert.equal(again.data.alreadyPaid, true);
  assert.match(again.data.message, /already been paid/);
});

test("duplicate orders: the same items for the same amount are spotted at checkout and the buyer chooses on screen", async () => {
  const b = await newBuyer();
  const first = await place(b);
  // unpaid twin: told about it, offered Pay now on the existing order
  const twin = await pay("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop, 2) });
  assert.equal(twin.status, 409);
  assert.equal(twin.data.code, "DUPLICATE_ORDER");
  assert.equal(twin.data.kind, "unpaid");
  assert.equal(twin.data.duplicate.id, first.order.id);
  assert.equal(twin.data.duplicate.canPay, true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM orders WHERE buyer_id=$1", [b.id])).rows[0].n, 1, "nothing was created");
  // different quantity: no warning
  const other = await pay("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop, 3) });
  assert.equal(other.status, 201);

  // pay the first one, then try the same cart again: now it says it was PAID
  await paystack.success(first.payment.reference); await paystack.webhook(first.payment.reference);
  const paidTwin = await pay("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop, 2) });
  assert.equal(paidTwin.status, 409);
  assert.equal(paidTwin.data.kind, "paid");
  assert.equal(paidTwin.data.duplicate.reference, first.order.reference);
  assert.ok(paidTwin.data.duplicate.paidAt);
  assert.match(paidTwin.data.error, /already paid/i);
  // a payment that really went through but whose webhook has not arrived yet is still reported as PAID
  const c = await place(await newBuyer(), 5);
  await paystack.success(c.payment.reference); // Paystack has it; we have not heard yet
  const buyerC = (await db.query("SELECT buyer_id FROM orders WHERE id=$1", [c.order.id])).rows[0].buyer_id;
  const sig = (await db.query("SELECT items_signature FROM orders WHERE id=$1", [c.order.id])).rows[0].items_signature;
  const { findDuplicateOrder } = await import("../../src/services/orderPayments.js");
  assert.equal((await findDuplicateOrder(buyerC, sig)).kind, "paid");
  assert.equal((await orderRow(c.order.id)).status, "payment_confirmed");

  // the buyer chooses to go ahead anyway
  const go = await pay("/orders", { method: "POST", token: b.token, body: { ...orderBody(crop.crop, 2), confirmDuplicate: true } });
  assert.equal(go.status, 201);
  assert.equal(go.data.order.status, "awaiting_payment");

  // outside the window it is not a duplicate any more
  await db.query("UPDATE orders SET created_at = now() - interval '30 hours' WHERE buyer_id=$1", [b.id]);
  const late = await pay("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop, 2) });
  assert.equal(late.status, 201);
  // cancelled or expired twins do not count
  const b2 = await newBuyer(); const o2 = await place(b2);
  await pay(`/orders/${o2.order.id}/cancel`, { method: "POST", token: b2.token });
  assert.equal((await pay("/orders", { method: "POST", token: b2.token, body: orderBody(crop.crop, 2) })).status, 201);
  // balance orders are checked the same way
  const b3 = await newBuyer();
  await db.query("UPDATE buyer_profiles SET standing_commitment_total=1000000, standing_commitment_balance=1000000, standing_commitment_years=1 WHERE user_id=$1", [b3.id]);
  assert.equal((await pay("/orders", { method: "POST", token: b3.token, body: orderBody(crop.crop, 2, "balance") })).status, 201);
  const dupBal = await pay("/orders", { method: "POST", token: b3.token, body: orderBody(crop.crop, 2, "balance") });
  assert.equal(dupBal.status, 409); assert.equal(dupBal.data.kind, "paid");
  // the window is a Finance setting
  await api("/payments/admin/settings", { method: "PUT", token: admin, body: { duplicateWindowHours: 1 } });
  assert.equal((await api("/payments/admin/settings", { token: admin })).data.duplicateWindowHours, 1);
  await api("/payments/admin/settings", { method: "PUT", token: admin, body: { duplicateWindowHours: 24 } });
  assert.equal((await api("/payments/admin/settings", { method: "PUT", token: admin, body: { duplicateWindowHours: 0 } })).status, 400);
});

test("a large order is flagged for review only after the threshold is set; it still proceeds", async () => {
  const b = await newBuyer();
  const none = await place(b);
  await paystack.success(none.payment.reference); await paystack.webhook(none.payment.reference);
  assert.equal((await flagsFor(none.payment.reference)).length, 0, "no threshold set: nothing flagged for size");

  const set = await api("/payments/admin/settings", { method: "PUT", token: admin, body: { reviewThreshold: 1 } });
  assert.equal(set.status, 200);
  const big = await place(b, 3);
  await paystack.success(big.payment.reference); await paystack.webhook(big.payment.reference);
  assert.equal((await orderRow(big.order.id)).status, "payment_confirmed", "review-only flags do not stop the order");
  const fl = await flagsFor(big.payment.reference);
  assert.equal(fl[0].kind, "review");
  assert.ok((await api("/payments/admin/flags", { token: admin })).data.flags.every((f) => f.kind === "review"));
  assert.equal(fl[0].reason, "large_order");
  const led = (await api("/payments/admin/ledger?type=order", { token: admin })).data.payments.find((x) => x.reference === big.payment.reference);
  assert.match(led.review_reasons, /large_order/);
  await api("/payments/admin/settings", { method: "PUT", token: admin, body: { reviewThreshold: null } });
});

test("settings: Finance edits the fee and the log records it; bad values are refused", async () => {
  const s = await api("/payments/admin/settings", { token: admin });
  assert.equal(s.data.fee.percent, 1.5);
  assert.equal(s.data.paystackConfigured, false); // server A has no key; the setting screen says so
  assert.equal((await api("/payments/admin/settings", { method: "PUT", token: admin, body: { fee: { percent: "abc", flat: 100, waiverUnder: 2500, cap: 2000 } } })).status, 400);
  assert.equal((await api("/payments/admin/settings", { method: "PUT", token: admin, body: { orderExpiryHours: 0 } })).status, 400);
  const ok = await api("/payments/admin/settings", { method: "PUT", token: admin, body: { fee: { percent: 1.6, flat: 100, waiverUnder: 2500, cap: 2000 } } });
  assert.equal(ok.data.fee.percent, 1.6);
  const out = await place(await newBuyer());
  assert.equal(out.payment.fee, calculateFee(Number(crop.sell_price) * 2, { percent: 1.6, flat: 100, waiverUnder: 2500, cap: 2000 }).fee);
  await api("/payments/admin/settings", { method: "PUT", token: admin, body: { fee: DEFAULT_FEE_CONFIG } });
  const log = await api("/security/log?type=money_setting_changed", { token: admin });
  assert.ok(log.data.events.length >= 2);
  // non-admins are shut out
  const b = await newBuyer();
  assert.equal((await api("/payments/admin/settings", { token: b.token })).status, 403);
  assert.equal((await api("/payments/admin/flags", { token: b.token })).status, 403);
  assert.equal((await api("/payments/admin/ledger.csv", { token: b.token })).status, 403);
});

test("standing commitment: nothing is credited until Paystack confirms; only the amount (not the fee) is credited; balance orders skip the gateway", async () => {
  const b = await newBuyer();
  const c = await pay("/orders/commitment", { method: "POST", token: b.token, body: { amount: 500000, years: 2 } });
  assert.equal(c.status, 201);
  const exp = calculateFee(500000);
  assert.equal(c.data.payment.amountCharged, exp.gross);
  const bal = async () => Number((await db.query("SELECT standing_commitment_balance AS b FROM buyer_profiles WHERE user_id=$1", [b.id])).rows[0].b);
  assert.equal(await bal(), 0, "typing a number no longer creates money");
  await paystack.success(c.data.payment.reference);
  await Promise.all([paystack.webhook(c.data.payment.reference), paystack.webhook(c.data.payment.reference)]);
  assert.equal(await bal(), 500000, "credited once, for the amount only");
  const prof = (await db.query("SELECT standing_commitment_years AS y, commitment_funded_at AS f FROM buyer_profiles WHERE user_id=$1", [b.id])).rows[0];
  assert.equal(prof.y, 2); assert.ok(prof.f);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='commitment_receipt'", [b.id]));
  // cannot start a second one while funds remain
  assert.equal((await pay("/orders/commitment", { method: "POST", token: b.token, body: { amount: 1000, years: 1 } })).status, 409);

  // an order paid from the balance: no gateway, no fee, straight to Procurement
  const o = await pay("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop, 3, "balance") });
  assert.equal(o.status, 201);
  assert.equal(o.data.order.status, "payment_confirmed");
  assert.equal(Number(o.data.order.fee_amount), 0);
  assert.equal(o.data.payment, undefined);
  assert.equal(await bal(), 500000 - Number(crop.sell_price) * 3);
  assert.equal((await pay("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop, 99999999, "balance") })).status, 400, "cannot overdraw");
  const rc = await pay(`/orders/${o.data.order.id}/receipt`, { token: b.token });
  assert.equal(rc.data.receipt.method, "Standing commitment balance");
});

test("legacy typed-in balances stay and appear on the Finance 'Unfunded commitments (legacy)' list", async () => {
  const b = await newBuyer();
  await db.query("UPDATE buyer_profiles SET standing_commitment_total=250000, standing_commitment_balance=250000, standing_commitment_years=1 WHERE user_id=$1", [b.id]);
  const list = await api("/payments/admin/unfunded-commitments", { token: admin });
  assert.ok(list.data.commitments.some((c) => c.user_id === b.id));
  const o = await pay("/orders", { method: "POST", token: b.token, body: orderBody(crop.crop, 1, "balance") });
  assert.equal(o.status, 201, "the old balance can still be spent");
});

test("a payment stuck as pending (webhook never came) is found and settled by the re-check job", async () => {
  const b = await newBuyer(); const out = await place(b);
  await paystack.success(out.payment.reference);
  await db.query("UPDATE gateway_payments SET created_at = now() - interval '30 minutes' WHERE reference=$1", [out.payment.reference]);
  const r = await recheckStuckPayments();
  assert.ok(r.settled >= 1);
  assert.equal((await orderRow(out.order.id)).status, "payment_confirmed");
  // Paystack down: nothing breaks, nothing is lost
  const b2 = await newBuyer(); const o2 = await place(b2);
  await db.query("UPDATE gateway_payments SET created_at = now() - interval '30 minutes' WHERE reference=$1", [o2.payment.reference]);
  await paystack.down(true);
  const down = await recheckStuckPayments();
  await paystack.down(false);
  assert.ok(down.unreachable >= 1);
  assert.equal((await orderRow(o2.order.id)).status, "awaiting_payment");
});

test("receipts and privacy", async () => {
  const b = await newBuyer(); const other = await newBuyer();
  const out = await place(b);
  assert.equal((await pay(`/orders/${out.order.id}/receipt`, { token: b.token })).status, 409, "no receipt before payment");
  await paystack.success(out.payment.reference); await paystack.webhook(out.payment.reference);
  const rc = await pay(`/orders/${out.order.id}/receipt`, { token: b.token });
  assert.equal(rc.status, 200);
  assert.equal(rc.data.receipt.totalPaid, out.payment.amountCharged);
  assert.equal(rc.data.receipt.fee, out.payment.fee);
  assert.equal((await pay(`/orders/${out.order.id}/receipt`, { token: other.token })).status, 404);
  assert.equal((await pay(`/payments/status/${out.payment.reference}`, { token: other.token })).status, 404, "someone else's payment");
  const mine = await pay("/orders/me", { token: b.token });
  const row = mine.data.orders.find((o) => o.id === out.order.id);
  assert.equal(row.has_receipt, true); assert.equal(row.can_pay, false);

  // there is no refund action on an order any more: refunds live only in the Refund room
  assert.equal((await api(`/orders/${out.order.id}/mark-refunded`, { method: "POST", token: admin, body: { note: "x" } })).status, 404);
});

test("old orders still work: legacy 'paid' orders can still be confirmed by hand from the manual queue", async () => {
  const b = await newBuyer();
  const ins = await db.query(`INSERT INTO orders (reference, buyer_id, delivery_location, total, goods_total, paid_via, status) VALUES ('ORD-LEGACY-'||substr(md5(random()::text),1,5), $1, 'Bauchi', 1000, 1000, 'upfront', 'paid') RETURNING id`, [b.id]);
  const pending = await api("/orders/pending-confirmation", { token: admin });
  assert.ok(pending.data.orders.some((o) => o.id === ins.rows[0].id));
  assert.equal((await api(`/orders/${ins.rows[0].id}/confirm-payment`, { method: "POST", token: admin })).status, 200);
  assert.equal((await orderRow(ins.rows[0].id)).status, "payment_confirmed");
});
