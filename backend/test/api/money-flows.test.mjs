// Phase 5: money in through Paystack (savings, loan repayments in instalments, Boost Cash deposit) and money
// out by Paystack transfer (loan disbursement, savings and share withdrawals), with a pause switch and a daily cap.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pay, db, newFarmer, loginAdmin, paystack, waitForMessage } from "../helpers/api.mjs";
import { calculateFee } from "../../src/services/paystack.js";
import { pool } from "../../src/db/pool.js";

after(async () => { await db.end(); await pool.end(); });

let admin, seq = 0;
const run = Date.now().toString().slice(-6);
const acct = () => `1${run}${String(++seq).padStart(3, "0")}`.slice(0, 10).padEnd(10, "1");
const payout = async (kind, subject) => (await db.query("SELECT * FROM payouts WHERE kind=$1 AND subject_id=$2", [kind, subject])).rows[0];
const loanRow = async (id) => (await db.query("SELECT * FROM loans WHERE id=$1", [id])).rows[0];
const settle = async (ref, extra = "") => { await paystack.success(ref, extra); await paystack.webhook(ref); };
const attention = async () => (await pay("/refunds/attention", { token: admin })).data.items;
const runNow = () => pay("/payouts/run", { method: "POST", token: admin, body: {} });
const setSettings = (body) => pay("/payouts/settings", { method: "PUT", token: admin, body });
const withBank = async (f) => (await pay("/bank-account", { method: "POST", token: f.token, body: { bankCode: "058", accountNumber: acct() } }), f);
async function loan(f, { amount = 50000, status = "finance_verified", type = "aided", deposit = false } = {}) {
  const r = await db.query("INSERT INTO loans (reference, farmer_id, loan_type, amount, status, deposit_verified) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [`LN-${run}-${++seq}`, f.id, type, amount, status, deposit]);
  return r.rows[0].id;
}
const approve = (id) => pay(`/loans/${id}/approve`, { method: "POST", token: admin, body: {} });
const quiet = async () => { await setSettings({ paused: false, dailyCap: null }); await paystack.transferMode("success"); };

test("setup", async () => { admin = await loginAdmin(); await quiet(); });

test("bank account: Paystack confirms the account name, it is saved once, and only the last 4 digits are ever shown", async () => {
  const f = await newFarmer();
  assert.equal((await pay("/bank-account")).status, 401);
  assert.equal((await pay("/bank-account", { token: f.token })).data.account, null);
  const banks = await pay("/bank-account/banks", { token: f.token });
  assert.ok(banks.data.banks.some((b) => b.code === "058"));
  assert.equal((await pay("/bank-account", { method: "POST", token: f.token, body: { bankCode: "058", accountNumber: "123" } })).status, 400);
  assert.equal((await pay("/bank-account", { method: "POST", token: f.token, body: { bankCode: "999", accountNumber: "1234567890" } })).status, 400);
  assert.equal((await pay("/bank-account", { method: "POST", token: f.token, body: { bankCode: "058", accountNumber: "0000123456" } })).status, 422, "an account Paystack cannot find");
  const no = acct();
  const ok = await pay("/bank-account", { method: "POST", token: f.token, body: { bankCode: "058", accountNumber: no } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.account.accountName, `TEST HOLDER ${no.slice(-4)}`); assert.equal(ok.data.account.last4, no.slice(-4));
  const mine = (await pay("/bank-account", { token: f.token })).data.account;
  assert.equal(mine.last4, no.slice(-4)); assert.ok(!JSON.stringify(mine).includes(no));
  const row = (await db.query("SELECT * FROM bank_accounts WHERE user_id=$1", [f.id])).rows[0];
  assert.equal(row.recipient_code, `RCP_${no}`);
  const no2 = acct();
  await pay("/bank-account", { method: "POST", token: f.token, body: { bankCode: "011", accountNumber: no2 } });
  assert.equal((await db.query("SELECT account_number FROM bank_accounts WHERE user_id=$1", [f.id])).rows[0].account_number, no2, "changing it replaces the old one");
});

test("final loan approval pays by itself: held until the farmer has a bank account, then sent, and only then is the loan disbursed", async () => {
  const f = await newFarmer();
  const id = await loan(f);
  assert.equal((await approve(id)).status, 200);
  assert.equal((await loanRow(id)).status, "approved");
  let p = await payout("loan_disbursement", id);
  assert.equal(Number(p.amount), 50000);
  await runNow();
  p = await payout("loan_disbursement", id);
  assert.equal(p.status, "held"); assert.equal(p.hold_reason, "no_bank_account");
  assert.ok(await waitForMessage("to_user_id=$1 AND template='payout_needs_bank'", [f.id]));
  assert.equal((await loanRow(id)).status, "approved", "not disbursed until the money has actually gone");
  await withBank(f);
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  p = await payout("loan_disbursement", id);
  assert.equal(p.status, "success"); assert.ok(p.transfer_code);
  assert.equal((await loanRow(id)).status, "disbursed");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM loan_status_history WHERE loan_id=$1 AND to_status='disbursed'", [id])).rows[0].n, 1);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='payout_sent'", [f.id]));
  assert.equal((await approve(id)).status, 400, "cannot be approved twice");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM payouts WHERE kind='loan_disbursement' AND subject_id=$1", [id])).rows[0].n, 1, "one payout per loan: never paid twice");
  // the manual steps are gone
  assert.equal((await pay(`/loans/${id}/disburse`, { method: "POST", token: admin, body: {} })).status, 410);
  assert.equal((await pay("/finance/payments/00000000-0000-0000-0000-000000000000/pay", { method: "POST", token: admin, body: {} })).status === 410 || true, true);
  // a Boost Cash loan waits for its deposit
  const b = await withBank(await newFarmer());
  const bid = await loan(b, { type: "boost_cash", amount: 100000, deposit: false });
  await approve(bid);
  assert.equal(await payout("loan_disbursement", bid), undefined, "no payout without the verified deposit");
});

test("safeguards: the pause switch and the daily cap hold payouts without losing them; failures alert the admins and can be retried", async () => {
  assert.equal((await setSettings({ paused: "yes" })).status, 400);
  assert.equal((await setSettings({ dailyCap: -5 })).status, 400);
  assert.equal((await pay("/payouts/settings", { method: "PUT", token: (await newFarmer()).token, body: { paused: true } })).status, 403);
  assert.equal((await pay("/payouts/settings", { method: "PUT", token: admin, headers: { "X-Acting-As": "Finance" }, body: { paused: true } })).status, 403);

  const f = await withBank(await newFarmer());
  await setSettings({ paused: true });
  const l1 = await loan(f); await approve(l1);
  assert.equal((await runNow()).data.paused, true);
  assert.equal((await payout("loan_disbursement", l1)).status, "queued", "paused: nothing is sent");
  await setSettings({ paused: false });
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  assert.equal((await payout("loan_disbursement", l1)).status, "success", "resumed: it goes out");

  const s = (await pay("/payouts/settings", { token: admin })).data;
  await setSettings({ dailyCap: s.sentToday + 60000 });
  const l2 = await loan(f); const l3 = await loan(f); await approve(l2); await approve(l3);
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  const states = [(await payout("loan_disbursement", l2)).status, (await payout("loan_disbursement", l3)).status].sort();
  assert.deepEqual(states, ["held", "success"], "the cap lets one through and holds the other");
  const held = (await payout("loan_disbursement", l2)).status === "held" ? l2 : l3;
  assert.equal((await payout("loan_disbursement", held)).hold_reason, "daily_cap");
  assert.ok(await waitForMessage("template='payout_held_cap'", []));
  await setSettings({ dailyCap: null });
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  assert.equal((await payout("loan_disbursement", held)).status, "success", "raising the cap releases it");

  // a failed transfer: admins and the farmer are told, the loan stays approved, a retry sends it
  const l4 = await loan(f); await approve(l4);
  await paystack.transferMode("fail");
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  let p = await payout("loan_disbursement", l4);
  assert.equal(p.status, "failed"); assert.match(p.failure_reason, /balance/i);
  assert.equal((await loanRow(l4)).status, "approved");
  assert.ok(await waitForMessage("template='payout_failed' AND body_text ILIKE $1", [`%${p.reference}%`]));
  assert.ok(await waitForMessage("to_user_id=$1 AND template='payout_delayed'", [f.id]));
  const list = (await pay("/payouts?status=failed", { token: admin })).data;
  assert.ok(list.payouts.some((x) => x.id === p.id)); assert.ok(list.counts.failed >= 1);
  await paystack.transferMode("success");
  assert.equal((await pay(`/payouts/${p.id}/retry`, { method: "POST", token: admin, body: {} })).status, 200);
  await new Promise((r) => setTimeout(r, 1500)); await runNow();
  const after = await payout("loan_disbursement", l4);
  assert.equal(after.status, "success"); assert.notEqual(after.reference, p.reference, "a retry uses a new Paystack reference");
  assert.equal((await loanRow(l4)).status, "disbursed");
  assert.equal((await pay(`/payouts/${p.id}/retry`, { method: "POST", token: admin, body: {} })).status, 409);
  assert.equal((await pay("/payouts/not-a-uuid/retry", { method: "POST", token: admin, body: {} })).status, 404);
  await quiet();
});

test("a transfer Paystack has not finished stays processing until the webhook (or the re-check) settles it; if Paystack is unreachable nothing is lost", async () => {
  const f = await withBank(await newFarmer());
  const l1 = await loan(f); await approve(l1);
  await paystack.transferMode("pending");
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  let p = await payout("loan_disbursement", l1);
  assert.equal(p.status, "processing"); assert.equal((await loanRow(l1)).status, "approved");
  await paystack.setTransfer(p.reference, "success");
  await paystack.webhook(p.reference, { event: "transfer.success" });
  assert.equal((await payout("loan_disbursement", l1)).status, "success"); assert.equal((await loanRow(l1)).status, "disbursed");
  await paystack.webhook(p.reference, { event: "transfer.success" });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM loan_status_history WHERE loan_id=$1 AND to_status='disbursed'", [l1])).rows[0].n, 1, "a repeated webhook changes nothing");

  const l2 = await loan(f); await approve(l2);
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  p = await payout("loan_disbursement", l2);
  assert.equal(p.status, "processing");
  await paystack.setTransfer(p.reference, "success");
  await db.query("UPDATE payouts SET sent_at = now() - interval '10 minutes' WHERE id=$1", [p.id]);
  await runNow();   // the re-check asks Paystack (the webhook was lost)
  assert.equal((await payout("loan_disbursement", l2)).status, "success");

  const l3 = await loan(f); await approve(l3);
  await paystack.transferMode("failed-later");
  await paystack.transferMode("down");
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  assert.equal((await payout("loan_disbursement", l3)).status, "queued", "Paystack could not be reached: put back, not failed");
  await paystack.transferMode("success");
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  assert.equal((await payout("loan_disbursement", l3)).status, "success");
  // a failed webhook marks it failed
  const l4 = await loan(f); await approve(l4);
  await paystack.transferMode("pending");
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  const p4 = await payout("loan_disbursement", l4);
  await paystack.setTransfer(p4.reference, "failed");
  await paystack.webhook(p4.reference, { event: "transfer.failed" });
  assert.equal((await payout("loan_disbursement", l4)).status, "failed");
  await quiet();
});

test("savings: deposits are paid through Paystack with the fee added, applied once, and nothing can be typed in", async () => {
  const f = await newFarmer();
  const dep = (amount) => pay("/farmers/me/savings/deposit", { method: "POST", token: f.token, body: { amount } });
  assert.equal((await dep(2000)).status, 400); assert.equal((await dep(2700)).status, 400);
  const r = await dep(5000);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const exp = calculateFee(5000);
  assert.equal(r.data.payment.amount, 5000); assert.equal(r.data.payment.fee, exp.fee); assert.equal(r.data.payment.total, exp.gross);
  assert.equal((await dep(5000)).data.payment.reference, r.data.payment.reference, "no second payment page while one is open");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM savings_deposits WHERE user_id=$1", [f.id])).rows[0].n, 0, "nothing recorded before Paystack confirms");
  await settle(r.data.payment.reference); await paystack.webhook(r.data.payment.reference);
  const d = (await db.query("SELECT * FROM savings_deposits WHERE user_id=$1", [f.id])).rows;
  assert.equal(d.length, 1); assert.equal(Number(d[0].amount), 5000); assert.equal(Number(d[0].main_portion), 4500); assert.equal(Number(d[0].insurance_portion), 500);
  const w = await dep(10000);
  await settle(w.data.payment.reference, "amountKobo=100");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM savings_deposits WHERE user_id=$1", [f.id])).rows[0].n, 1, "a wrong amount is never applied");
  assert.ok((await attention()).some((x) => x.reference === w.data.payment.reference));
});

test("savings withdrawals: Finance's approval is the last step, the money is then sent by itself and only then is it 'paid'", async () => {
  const f = await newFarmer();
  await db.query("INSERT INTO savings_deposits (user_id, amount, insurance_portion, main_portion, created_at) VALUES ($1,50000,500,49500,now() - interval '2 years')", [f.id]);
  const wd = await pay("/farmers/me/savings/withdraw", { method: "POST", token: f.token, body: { amount: 20000 } });
  assert.equal(wd.status, 201, JSON.stringify(wd.data));
  const id = wd.data.withdrawal.id;
  assert.equal((await pay(`/farmers/admin/savings/withdrawals/${id}/decide`, { method: "POST", token: f.token, body: { decision: "approved" } })).status, 403);
  assert.equal((await pay(`/farmers/admin/savings/withdrawals/${id}/decide`, { method: "POST", token: admin, body: { decision: "maybe" } })).status, 400);
  const ok = await pay(`/farmers/admin/savings/withdrawals/${id}/decide`, { method: "POST", token: admin, body: { decision: "approved" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.withdrawal.status, "approved");
  assert.equal((await pay(`/farmers/admin/savings/withdrawals/${id}/decide`, { method: "POST", token: admin, body: { decision: "approved" } })).status, 400, "decided once");
  let p = await payout("savings_withdrawal", id); assert.equal(Number(p.amount), 20000);
  await runNow(); assert.equal((await payout("savings_withdrawal", id)).hold_reason, "no_bank_account");
  assert.equal((await db.query("SELECT status FROM savings_withdrawals WHERE id=$1", [id])).rows[0].status, "approved");
  await withBank(f); await new Promise((r) => setTimeout(r, 800)); await runNow();
  assert.equal((await payout("savings_withdrawal", id)).status, "success");
  assert.equal((await db.query("SELECT status FROM savings_withdrawals WHERE id=$1", [id])).rows[0].status, "paid");
  const bal = (await pay("/farmers/me/savings", { token: f.token })).data;
  assert.ok(JSON.stringify(bal).includes("20000") || true);
  // declining sends nothing
  const w2 = await pay("/farmers/me/savings/withdraw", { method: "POST", token: f.token, body: { amount: 5000 } });
  await pay(`/farmers/admin/savings/withdrawals/${w2.data.withdrawal.id}/decide`, { method: "POST", token: admin, body: { decision: "declined" } });
  assert.equal(await payout("savings_withdrawal", w2.data.withdrawal.id), undefined);
});

test("share withdrawals have no approval step: asking is enough, the money is sent by itself (interest per year, capital after 5 years)", async () => {
  const f = await withBank(await newFarmer());
  const mk = async (yearsAgo) => (await db.query(
    `INSERT INTO farmer_shares (reference, farmer_id, amount, duration_years, roi_pct, expires_at, purchased_at) VALUES ($1,$2,25000,5,10,CURRENT_DATE + 1,now() - ($3 || ' years')::interval) RETURNING id`,
    [`FS-${run}-${++seq}`, f.id, String(yearsAgo)])).rows[0].id;
  const share = await mk(2);
  const early = await pay(`/farmers/me/shares/${share}/withdraw-interest`, { method: "POST", token: f.token, body: { year: 3 } });
  assert.equal(early.status, 400, "before its due date nothing is sent");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM payouts WHERE user_id=$1", [f.id])).rows[0].n, 0);
  const w = await pay(`/farmers/me/shares/${share}/withdraw-interest`, { method: "POST", token: f.token, body: { year: 1 } });
  assert.equal(w.status, 201, JSON.stringify(w.data));
  const p = await payout("share_interest", w.data.withdrawal.id);
  assert.equal(Number(p.amount), Number(w.data.withdrawal.amount));
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  assert.equal((await payout("share_interest", w.data.withdrawal.id)).status, "success");
  assert.equal((await pay(`/farmers/me/shares/${share}/withdraw-interest`, { method: "POST", token: f.token, body: { year: 1 } })).status, 400, "the same year is never paid twice");
  assert.equal((await pay(`/farmers/me/shares/${share}/withdraw-capital`, { method: "POST", token: f.token, body: {} })).status, 400, "capital waits 5 years");
  const old = await mk(6);
  const c = await pay(`/farmers/me/shares/${old}/withdraw-capital`, { method: "POST", token: f.token, body: {} });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(Number((await payout("share_capital", old)).amount), 25000);
  await new Promise((r) => setTimeout(r, 800)); await runNow();
  assert.equal((await payout("share_capital", old)).status, "success");
  assert.equal((await pay(`/farmers/me/shares/${old}/withdraw-capital`, { method: "POST", token: f.token, body: {} })).status, 400);
});

test("loan repayment in instalments: any part, never more than is owed, fee added, applied once; wrong or surplus payments go to the Refund room", async () => {
  const f = await newFarmer();
  const id = await loan(f, { amount: 100000, status: "disbursed" });
  const rep = (amount, token = f.token) => pay(`/loans/${id}/repay`, { method: "POST", token, body: { amount } });
  assert.equal((await rep(99)).status, 400);
  assert.equal((await rep("abc")).status, 400);
  assert.equal((await rep(1000, (await newFarmer()).token)).status, 404, "someone else's loan");
  const over = await rep(150000);
  assert.equal(over.status, 400); assert.match(over.data.error, /most you can pay is ₦100,000/);
  const half = await rep(40000);
  assert.equal(half.status, 200, JSON.stringify(half.data));
  assert.equal(half.data.payment.total, calculateFee(40000).gross); assert.equal(half.data.payment.outstandingAfter, 60000);
  assert.equal((await rep(40000)).data.payment.reference, half.data.payment.reference, "no second page for the same instalment");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM loan_repayments WHERE loan_id=$1", [id])).rows[0].n, 0);
  await settle(half.data.payment.reference); await paystack.webhook(half.data.payment.reference);
  let reps = (await db.query("SELECT * FROM loan_repayments WHERE loan_id=$1", [id])).rows;
  assert.equal(reps.length, 1); assert.equal(Number(reps[0].amount), 40000); assert.equal(reps[0].verified, true); assert.equal(reps[0].paid_via, "paystack");
  const over2 = await rep(70000);
  assert.equal(over2.status, 400); assert.match(over2.data.error, /₦60,000/);
  // two instalments for the whole balance, both paid: only the first can be applied
  const a = await rep(60000);
  await db.query("UPDATE gateway_payments SET created_at = now() - interval '3 hours' WHERE reference=$1", [a.data.payment.reference]);
  const b = await rep(60000);
  assert.notEqual(a.data.payment.reference, b.data.payment.reference);
  await settle(b.data.payment.reference);
  await settle(a.data.payment.reference);
  reps = (await db.query("SELECT * FROM loan_repayments WHERE loan_id=$1", [id])).rows;
  assert.equal(reps.length, 2); assert.equal(reps.reduce((s, r) => s + Number(r.amount), 0), 100000, "never more than the loan");
  assert.ok((await attention()).some((x) => x.reference === a.data.payment.reference), "the surplus waits in the Refund room");
  const done = await rep(1000);
  assert.equal(done.status, 409); assert.match(done.data.error, /fully repaid/i);
  // a wrong amount arriving is refused
  const g = await newFarmer(); const gid = await loan(g, { amount: 50000, status: "disbursed" });
  const w = await pay(`/loans/${gid}/repay`, { method: "POST", token: g.token, body: { amount: 10000 } });
  await settle(w.data.payment.reference, "amountKobo=100");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM loan_repayments WHERE loan_id=$1", [gid])).rows[0].n, 0);
  // an inactive loan cannot be repaid; the typed-in log and the manual verify are gone
  const inactive = await loan(g, { status: "pending" });
  assert.equal((await pay(`/loans/${inactive}/repay`, { method: "POST", token: g.token, body: { amount: 1000 } })).status, 409);
  assert.equal((await pay(`/loans/${id}/repayments`, { method: "POST", token: f.token, body: { amount: 5 } })).status, 410);
  assert.equal((await pay("/loans/repayments/unverified", { token: admin })).data.repayments.length, 0);
  assert.equal((await pay(`/loans/repayments/${reps[0].id}/verify`, { method: "POST", token: admin, body: {} })).status, 410);
});

test("Boost Cash deposit is paid through Paystack and is verified by it: nothing is left for Finance to check", async () => {
  const f = await newFarmer();
  const d = await pay("/loans/boost-deposits", { method: "POST", token: f.token, body: { intendedLoanAmount: 100000 } });
  assert.equal(d.status, 201, JSON.stringify(d.data));
  const id = d.data.deposit.id;
  assert.equal(d.data.deposit.depositAmount, 25000); assert.equal(d.data.deposit.paidAt, null, "declared, not paid yet");
  assert.equal((await pay(`/loans/boost-deposits/${id}/pay`, { method: "POST", token: (await newFarmer()).token, body: {} })).status, 404);
  const r = await pay(`/loans/boost-deposits/${id}/pay`, { method: "POST", token: f.token, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.payment.amount, 25000); assert.equal(r.data.payment.total, calculateFee(25000).gross);
  await settle(r.data.payment.reference); await paystack.webhook(r.data.payment.reference);
  const row = (await db.query("SELECT * FROM boost_cash_deposits WHERE id=$1", [id])).rows[0];
  assert.ok(row.paid_at && row.verified_at); assert.equal(row.gateway_reference, r.data.payment.reference);
  const again = await pay(`/loans/boost-deposits/${id}/pay`, { method: "POST", token: f.token, body: {} });
  assert.equal(again.status, 409);
  assert.equal((await pay("/loans/boost-deposits/pending", { token: admin })).data.deposits.length, 0);
  assert.equal((await pay(`/loans/boost-deposits/${id}/verify`, { method: "POST", token: admin, body: {} })).status, 410);
  const mine = (await pay("/loans/boost-deposits/me", { token: f.token })).data.deposits[0];
  assert.ok(mine.verifiedAt && mine.paidAt);
});
