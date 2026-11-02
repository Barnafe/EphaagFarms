// Phase 9: Analytics. Drill-down through state, LGA, ward and unit; key-chart data; Excel export.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { api, db, newFarmer, loginAdmin, uniq } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

after(async () => { await db.end(); await pool.end(); });

const S = `TestState-${uniq()}`;
let admin, A, B, C;
const q = (o = {}) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
const get = (path, o = {}) => api(`${path}?${q(o)}`, { token: admin });
async function place(f, lga, ward, unit) { await db.query("UPDATE users SET state=$2, lga=$3, ward=$4, unit=$5 WHERE id=$1", [f.id, S, lga, ward, unit]); }
async function declare(f, crop, quantity, unit = "bags") { await db.query("INSERT INTO farmer_declarations (farmer_id, crop, quantity, unit) VALUES ($1,$2,$3,$4)", [f.id, crop, quantity, unit]); }
async function save(f, amount, monthsAgo = 0) {
  await db.query("INSERT INTO savings_deposits (user_id, amount, main_portion, insurance_portion, created_at) VALUES ($1,$2,$3,500, date_trunc('month', now()) - ($4 || ' months')::interval + interval '3 days')", [f.id, amount, amount - 500, String(monthsAgo)]);
}
async function loan(f, amount, status, type = "business_fast_cash") {
  await db.query("INSERT INTO loans (reference, farmer_id, loan_type, amount, status) VALUES ($1,$2,$3,$4,$5)", [`LN-AN-${uniq()}`, f.id, type, amount, status]);
}

test("setup: three farmers in one state, two LGAs, three wards, three units", async () => {
  admin = await loginAdmin();
  [A, B, C] = [await newFarmer(), await newFarmer(), await newFarmer()];
  await place(A, "Lga One", "Ward One", "Unit One");
  await place(B, "Lga One", "Ward One", "Unit Two");
  await place(C, "Lga Two", "Ward Three", "Unit Three");
  await declare(A, "Maize", 100); await declare(B, "Maize", 50); await declare(B, "Rice", 20); await declare(C, "Maize", 10);
  await save(A, 5000, 0); await save(A, 3000, 1); await save(C, 2500, 0);
  await loan(A, 30000, "approved"); await loan(C, 10000, "pending", "aided");
});

test("analytics is for admins only, including the summary, the drill-down lists and the export", async () => {
  const f = await newFarmer();
  for (const p of ["/analytics/summary", "/analytics/geo-options", "/analytics/export.xlsx", "/analytics/overview"]) {
    assert.equal((await api(p)).status, 401, `${p} anonymous`);
    assert.equal((await api(p, { token: f.token })).status, 403, `${p} farmer`);
  }
});

test("the location lists drill down one level at a time", async () => {
  const top = (await get("/analytics/geo-options")).data;
  assert.ok(top.states.includes(S)); assert.deepEqual([top.lgas, top.wards, top.units], [[], [], []]);
  const s = (await get("/analytics/geo-options", { state: S })).data;
  assert.deepEqual(s.lgas, ["Lga One", "Lga Two"]); assert.deepEqual(s.wards, []);
  const l = (await get("/analytics/geo-options", { state: S, lga: "Lga One" })).data;
  assert.deepEqual(l.wards, ["Ward One"]); assert.deepEqual(l.units, []);
  const w = (await get("/analytics/geo-options", { state: S, lga: "Lga One", ward: "Ward One" })).data;
  assert.deepEqual(w.units, ["Unit One", "Unit Two"]);
  const bad = (await get("/analytics/geo-options", { lga: "Lga One" })).data;
  assert.deepEqual(bad.lgas, [], "a child list needs its parent");
});

test("the summary follows the drill-down: state, then LGA, then ward, then unit", async () => {
  const st = (await get("/analytics/summary", { state: S })).data;
  assert.equal(st.areaLevel, "lga");
  assert.deepEqual([st.totals.farmers, st.totals.farmersDeclaring, st.totals.declarations, st.totals.loans, st.totals.loanValue, st.totals.savings, st.totals.savers],
    [3, 3, 4, 2, 40000, 10500, 2]);
  const maize = st.produceByCrop.find((c) => c.crop === "Maize");
  assert.deepEqual([maize.total, maize.farmers, maize.unit], [160, 3, "bags"]);
  assert.deepEqual(st.byArea.map((a) => [a.area, a.farmers, a.declarers, a.loanValue]), [["Lga One", 2, 2, 30000], ["Lga Two", 1, 1, 10000]]);
  assert.deepEqual(st.loansByStatus.map((x) => x.status).sort(), ["approved", "pending"]);
  assert.deepEqual(st.loansByType.map((x) => x.loanType).sort(), ["aided", "business_fast_cash"]);

  const lga = (await get("/analytics/summary", { state: S, lga: "Lga One" })).data;
  assert.equal(lga.areaLevel, "ward");
  assert.deepEqual([lga.totals.farmers, lga.totals.loans, lga.totals.savings], [2, 1, 8000]);
  assert.equal(lga.produceByCrop.find((c) => c.crop === "Maize").total, 150);
  assert.deepEqual(lga.byArea.map((a) => [a.area, a.farmers]), [["Ward One", 2]]);

  const ward = (await get("/analytics/summary", { state: S, lga: "Lga One", ward: "Ward One" })).data;
  assert.equal(ward.areaLevel, "unit");
  assert.deepEqual(ward.byArea.map((a) => a.area).sort(), ["Unit One", "Unit Two"]);

  const unit = (await get("/analytics/summary", { state: S, lga: "Lga One", ward: "Ward One", unit: "Unit One" })).data;
  assert.deepEqual([unit.totals.farmers, unit.totals.declarations, unit.totals.loanValue, unit.totals.savings], [1, 1, 30000, 8000]);
  assert.deepEqual(unit.filters, { state: S, lga: "Lga One", ward: "Ward One", unit: "Unit One" });
});

test("savings trend is oldest to newest, and an unknown or hostile location gives empty results, not errors", async () => {
  const st = (await get("/analytics/summary", { state: S })).data;
  assert.equal(st.savingsTrend.length, 2);
  assert.ok(st.savingsTrend[0].month < st.savingsTrend[1].month, "ascending months");
  assert.deepEqual(st.savingsTrend.map((m) => m.total), [3000, 7500]);
  for (const state of ["No Such State", "x' OR '1'='1", "'; DROP TABLE users; --"]) {
    const r = await get("/analytics/summary", { state });
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.totals.farmers, r.data.totals.loans, r.data.produceByCrop.length, r.data.byArea.length], [0, 0, 0, 0]);
  }
  assert.ok((await db.query("SELECT count(*)::int AS n FROM users")).rows[0].n > 0, "the users table is still there");
});

test("every existing analytics view honours the same four filters", async () => {
  const f = (await get("/analytics/farmers", { state: S, lga: "Lga One" })).data;
  assert.equal(f.totalFarmers, 2);
  const p = (await get("/analytics/produce", { state: S, ward: "Ward Three" })).data;
  assert.equal(p.byCrop.length, 1); assert.equal(p.byCrop[0].total, 10);
  const cap = (await get("/analytics/produce/capacity", { crop: "maize", minQuantity: 50, state: S, lga: "Lga One" })).data;
  assert.equal(cap.matchingFarmerCount, 2);
  const capUnit = (await get("/analytics/produce/capacity", { crop: "maize", minQuantity: 50, state: S, unit: "Unit One" })).data;
  assert.equal(capUnit.matchingFarmerCount, 1);
  const l = (await get("/analytics/loans", { state: S, lga: "Lga Two" })).data;
  assert.deepEqual([l.byStatus.length, l.byStatus[0].totalAmount], [1, 10000]);
  const sv = (await get("/analytics/savings", { state: S, unit: "Unit Three" })).data;
  assert.deepEqual([sv.mainTotal, sv.saversCount], [2000, 1]);
  const tr = (await get("/analytics/training", { state: S })).data;
  assert.ok(Array.isArray(tr.byTrainingRank));
  const ov = (await get("/analytics/overview", { state: S })).data;
  assert.deepEqual([ov.usersByRole.length, ov.usersByRole[0].role, ov.usersByRole[0].count, ov.totalSavings], [1, "farmer", 3, 10500]);
});

test("the Excel export contains what the dashboard shows for the chosen location", async () => {
  const res = await api(`/analytics/export.xlsx?${q({ state: S, lga: "Lga One" })}`, { token: admin, raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /spreadsheetml/);
  assert.match(res.headers.get("content-disposition"), /attachment; filename="ephaag-analytics-\d{4}-\d{2}-\d{2}\.xlsx"/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Summary", "Produce by crop", "By Ward", "Loans", "Savings trend"]);
  const sum = Object.fromEntries(wb.getWorksheet("Summary").getSheetValues().filter(Boolean).map((r) => [r[1], r[2]]));
  assert.equal(sum["Registered farmers"], 2);
  assert.equal(sum["Loans (total value, NGN)"], 30000);
  assert.equal(sum["Location"], `State: ${S} > LGA: Lga One`);
  const crops = wb.getWorksheet("Produce by crop").getSheetValues().filter(Boolean).slice(1);
  assert.ok(crops.some((r) => r[1] === "Maize" && r[3] === 150));
  const wards = wb.getWorksheet("By Ward").getSheetValues().filter(Boolean).slice(1);
  assert.deepEqual(wards.map((r) => [r[1], r[2]]), [["Ward One", 2]]);

  const all = await api("/analytics/export.xlsx", { token: admin, raw: true });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(Buffer.from(await all.arrayBuffer()));
  const s2 = Object.fromEntries(wb2.getWorksheet("Summary").getSheetValues().filter(Boolean).map((r) => [r[1], r[2]]));
  assert.equal(s2["Location"], "All of Nigeria (no location filter)");
  assert.ok(s2["Registered farmers"] >= 3);
  assert.equal(wb2.worksheets[2].name, "By State");
});
