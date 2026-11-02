// Phase 6: loan scoring. Funds utilization is worked out from produce declared/listed; the admin sets a minimum
// total score; the last COMPLETED calendar quarter's score counts; nobody (tickets, first-timers) is exempt.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pay, db, newFarmer, loginAdmin } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";
import { lastCompletedQuarterStart } from "../../src/utils/indicesEngine.js";

after(async () => { await db.end(); await pool.end(); });

let admin, seq = 0;
const run = Date.now().toString().slice(-6);
const Q = lastCompletedQuarterStart(); // e.g. 2026-07-01
const inQuarter = (days) => new Date(new Date(`${Q}T12:00:00Z`).getTime() + days * 86400000).toISOString();
const setMin = (v) => pay("/loans/scoring-settings", { method: "PUT", token: admin, body: { minimumScore: v } });
const apply = (f, amount = 100000) => pay("/loans", { method: "POST", token: f.token, body: { loan_type: "business_fast_cash", amount } });
const counting = async (f) => (await pay("/loans/me/eligibility", { token: f.token })).data.counting;
const adminView = async (loanId) => (await pay(`/loans/${loanId}/applicant-indices`, { token: admin })).data.counting;

async function declareLastQuarter(f, days = 5) {
  await db.query("INSERT INTO farmer_declarations (farmer_id, crop, quantity, unit, created_at) VALUES ($1,'Maize',100,'bags',$2)", [f.id, inQuarter(days)]);
}
async function listLastQuarter(f, days = 6) {
  await db.query("INSERT INTO farmer_products (farmer_id, crop, quantity, unit, address, created_at) VALUES ($1,'Maize',10,'bags','Yelwa',$2)", [f.id, inQuarter(days)]);
}
async function trainingLastQuarter(f, sessions) {
  for (let i = 0; i < sessions; i++) {
    const s = await db.query("INSERT INTO seminars (title, event_date, location) VALUES ($1,$2,'Hall') RETURNING id", [`S${run}-${++seq}`, inQuarter(10 + i).slice(0, 10)]);
    await db.query("INSERT INTO seminar_attendance (seminar_id, user_id, attended) VALUES ($1,$2,TRUE)", [s.rows[0].id, f.id]);
  }
}
async function backdateJoined(f) { await db.query("UPDATE users SET created_at = now() - interval '2 years' WHERE id = $1", [f.id]); }
async function dummyLoan(f, status = "pending") {
  const r = await db.query("INSERT INTO loans (reference, farmer_id, loan_type, amount, status) VALUES ($1,$2,'business_fast_cash',100000,$3) RETURNING id", [`LN-S${run}-${++seq}`, f.id, status]);
  return r.rows[0].id;
}

test("setup", async () => { admin = await loginAdmin(); await setMin(0); });

test("admin screen: only admins can read or change the minimum score, and it must be a number from 0 to 50", async () => {
  const f = await newFarmer();
  assert.equal((await pay("/loans/scoring-settings")).status, 401);
  assert.equal((await pay("/loans/scoring-settings", { token: f.token })).status, 403);
  assert.equal((await pay("/loans/scoring-settings", { method: "PUT", token: f.token, body: { minimumScore: 10 } })).status, 403);
  for (const bad of [-1, 51, "abc"]) assert.equal((await setMin(bad)).status, 400, `rejects ${bad}`);
  const ok = await setMin(25);
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.data.minimumScore, ok.data.maxScore, ok.data.minimumPercent], [25, 50, 50]);
  assert.equal((await pay("/loans/scoring-settings", { token: admin })).data.minimumScore, 25);
  assert.equal((await setMin("")).data.minimumScore, 0, "empty means no minimum");
  assert.equal((await pay("/loans/scoring-settings", { method: "PUT", token: admin, headers: { "X-Acting-As": "Finance" }, body: { minimumScore: 10 } })).status, 403, "blocked while acting as a department");
});

test("no minimum set: a farmer with no score can still apply", async () => {
  await setMin(0);
  const f = await newFarmer();
  const r = await apply(f);
  assert.equal(r.status, 201, JSON.stringify(r.data));
});

test("funds utilization is worked out from produce: 6 points for declaring and 6 more for listing, in the last completed quarter", async () => {
  const f = await newFarmer(); await backdateJoined(f);
  let c = await counting(f);
  assert.equal(c.breakdownPercent.fundsUtilization, 0);
  await declareLastQuarter(f);
  c = await counting(f);
  assert.equal(c.breakdownPercent.fundsUtilization, 50, "declared only = half of 12");
  assert.equal(c.fundsDetail.declared, true); assert.equal(c.fundsDetail.listed, false);
  await listLastQuarter(f);
  c = await counting(f);
  assert.equal(c.breakdownPercent.fundsUtilization, 100);
  const id = await dummyLoan(f);
  const a = await adminView(id);
  assert.equal(a.breakdown.fundsUtilization, 12); assert.equal(a.total, 12); assert.equal(a.totalMax, 50);
});

test("the minimum blocks applying with a clear message; meeting it lets the farmer apply", async () => {
  const f = await newFarmer(); await backdateJoined(f);
  await trainingLastQuarter(f, 6);   // 20 points
  await declareLastQuarter(f);       // +6
  await listLastQuarter(f);          // +6  -> 32 of 50 = 64%
  assert.equal((await counting(f)).totalPercent, 64);
  await setMin(35);
  const no = await apply(f);
  assert.equal(no.status, 403);
  assert.equal(no.data.code, "SCORE_TOO_LOW");
  assert.equal(no.data.score.totalPercent, 64); assert.equal(no.data.score.minimumPercent, 70);
  assert.match(no.data.error, /64%/); assert.match(no.data.error, /70%/);
  assert.ok(!("breakdown" in no.data.score) && !JSON.stringify(no.data).includes('"total":'), "farmers see percentages, not internal points");
  const rows = (await db.query("SELECT count(*)::int AS n FROM loans WHERE farmer_id=$1", [f.id])).rows[0].n;
  assert.equal(rows, 0, "no loan was created");
  await setMin(32);
  assert.equal((await apply(f)).status, 201, "exactly at the minimum is enough");
  await setMin(0);
});

test("nobody is exempt: a Unit Leader recommendation ticket does not skip the minimum", async () => {
  const f = await newFarmer(); await backdateJoined(f);
  const issuer = await newFarmer();
  await db.query("INSERT INTO loan_recommendation_tickets (farmer_id, issued_by, reason) VALUES ($1,$2,'trusted farmer')", [f.id, issuer.id]);
  await setMin(10);
  const r = await apply(f);
  assert.equal(r.status, 403); assert.equal(r.data.code, "SCORE_TOO_LOW");
  const t = (await db.query("SELECT used_at FROM loan_recommendation_tickets WHERE farmer_id=$1", [f.id])).rows[0];
  assert.equal(t.used_at, null, "the ticket stays unused");
  await trainingLastQuarter(f, 3); // 10 points
  assert.equal((await apply(f)).status, 201, "once the score is met the ticket works as before");
  const loan = (await db.query("SELECT status FROM loans WHERE farmer_id=$1", [f.id])).rows[0];
  assert.equal(loan.status, "recommended");
  await setMin(0);
});

test("a brand-new farmer must finish a quarter first, with a message saying so", async () => {
  await setMin(5);
  const f = await newFarmer(); // joined today, nothing in the last completed quarter
  await declareLastQuarter(f); await listLastQuarter(f); // even backdated activity cannot get around a quarter that has not ended for them
  const r = await apply(f);
  assert.equal(r.status, 403);
  assert.equal(r.data.score.newThisQuarter, true);
  assert.match(r.data.error, /joined this quarter/);
  const c = await counting(f);
  assert.equal(c.newThisQuarter, true);
  await setMin(0);
});

test("only the last COMPLETED quarter counts: produce declared this quarter does not raise the score", async () => {
  await setMin(5);
  const f = await newFarmer(); await backdateJoined(f);
  const d = await pay("/farmers/me/declarations", { method: "POST", token: f.token, body: { crop: "Maize", quantity: 50, unit: "bags" } });
  assert.equal(d.status, 201, JSON.stringify(d.data));
  const p = await pay("/farmers/me/products", { method: "POST", token: f.token, body: { crop: "Maize", quantity: 10, unit: "bags", address: "Yelwa" } });
  assert.equal(p.status, 201, JSON.stringify(p.data));
  await new Promise((r) => setTimeout(r, 400));
  const e = (await pay("/loans/me/eligibility", { token: f.token })).data;
  const funds = e.indices.find((i) => i.key === "funds_utilization");
  assert.equal(funds.points, 12, "this quarter's progress shows the declaration and the listing right away");
  assert.equal(e.counting.totalPercent, 0, "but the score that counts is still the last completed quarter's");
  assert.equal((await apply(f)).status, 403);
  await setMin(0);
});

test("after a loan is paid out inside the quarter, only produce declared or listed AFTER the payout counts", async () => {
  const f = await newFarmer(); await backdateJoined(f);
  const id = await dummyLoan(f, "disbursed");
  await db.query("INSERT INTO loan_status_history (loan_id, from_status, to_status, created_at) VALUES ($1,'approved','disbursed',$2)", [id, inQuarter(30)]);
  await declareLastQuarter(f, 10);   // before the payout: does not count
  await listLastQuarter(f, 40);      // after the payout: counts
  let c = await counting(f);
  assert.equal(c.fundsDetail.afterLoanPayout, true);
  assert.equal(c.fundsDetail.declared, false); assert.equal(c.fundsDetail.listed, true);
  assert.equal(c.breakdownPercent.fundsUtilization, 50);
  await declareLastQuarter(f, 50);   // now also after the payout
  c = await counting(f);
  assert.equal(c.breakdownPercent.fundsUtilization, 100);
});

test("the score for the last completed quarter is stored for history", async () => {
  const f = await newFarmer(); await backdateJoined(f);
  await declareLastQuarter(f);
  await counting(f);
  const h = (await pay("/loans/me/eligibility/history", { token: f.token })).data.history;
  const row = h.find((x) => x.quarterStart.slice(0, 10) === Q);
  assert.ok(row, "the counted quarter is on record");
  assert.equal(row.fundsUtilizationPoints, 6);
});
