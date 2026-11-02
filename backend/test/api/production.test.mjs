// Phase 11: Production. Crop and livestock farms, harvests, farm costs (inputs, labour, other) and profit per harvest.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, db, newFarmer, loginAdmin, uniq } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

after(async () => { await db.end(); await pool.end(); });

const YEAR = 2018; // an old year keeps these figures separate from anything else in the database
let admin;
const post = (p, body, token = admin) => api(`/production${p}`, { method: "POST", token, body });
const patch = (p, body, token = admin) => api(`/production${p}`, { method: "PATCH", token, body });
const get = (p, token = admin) => api(`/production${p}`, { token });
const del = (p, token = admin) => api(`/production${p}`, { method: "DELETE", token });
let layers, maize, h1, h2, h3;

test("setup and access: only admins use Production", async () => {
  admin = await loginAdmin();
  const f = await newFarmer();
  for (const p of ["/farms", "/harvests", "/costs", "/profit", "/dashboard"]) {
    assert.equal((await api(`/production${p}`)).status, 401, `${p} anonymous`);
    assert.equal((await get(p, f.token)).status, 403, `${p} farmer`);
  }
});

test("farms are crop or livestock farms; livestock harvests are recorded the same way as crops", async () => {
  assert.equal((await post("/farms", { name: "x", kind: "fish" })).status, 400);
  const a = await post("/farms", { name: `Layer house ${uniq()}`, state: "Plateau", crop: "Poultry (layers)", kind: "livestock", sizeHectares: 2 });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  layers = a.data.farm; assert.equal(layers.kind, "livestock");
  const b = await post("/farms", { name: `Maize farm ${uniq()}`, state: "Plateau", crop: "Maize" });
  maize = b.data.farm; assert.equal(maize.kind, "crop", "a farm is a crop farm unless said otherwise");
  assert.equal((await patch(`/farms/${maize.id}`, { kind: "weird" })).status, 400);
  const list = (await get("/farms")).data.farms;
  assert.deepEqual([list.find((f) => f.id === layers.id).kind, list.find((f) => f.id === maize.id).kind], ["livestock", "crop"]);
});

test("harvests are checked, and what a harvest was worth can be recorded now or later", async () => {
  const base = { farmId: layers.id, crop: "Eggs", quantity: 300, unit: "crates", harvestedAt: `${YEAR}-03-10` };
  for (const [extra, status] of [[{ farmId: "nope" }, 404], [{ farmId: "00000000-0000-4000-8000-000000000000" }, 404], [{ quantity: 0 }, 400], [{ crop: "" }, 400],
    [{ harvestedAt: "10/03/2018" }, 400], [{ harvestedAt: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10) }, 400], [{ revenue: -5 }, 400], [{ revenue: "abc" }, 400]]) {
    assert.equal((await post("/harvests", { ...base, ...extra })).status, status, JSON.stringify(extra));
  }
  const a = await post("/harvests", { ...base, revenue: 500000 });
  assert.equal(a.status, 201, JSON.stringify(a.data)); h1 = a.data.harvest; assert.equal(Number(h1.revenue), 500000);
  const b = await post("/harvests", { farmId: layers.id, crop: "Broilers", quantity: 800, unit: "birds", harvestedAt: `${YEAR}-06-01` });
  h2 = b.data.harvest; assert.equal(h2.revenue, null, "revenue is optional");
  const c = await post("/harvests", { farmId: maize.id, crop: "Maize", quantity: 40, unit: "bags", harvestedAt: `${YEAR}-10-20`, revenue: 200000 });
  h3 = c.data.harvest;
  assert.equal((await patch(`/harvests/${h2.id}`, {})).status, 400);
  assert.equal((await patch(`/harvests/${h2.id}`, { revenue: -1 })).status, 400);
  assert.equal((await patch("/harvests/not-an-id", { revenue: 1 })).status, 404);
  const set = await patch(`/harvests/${h2.id}`, { revenue: 320000 });
  assert.equal(set.status, 200); assert.equal(Number(set.data.harvest.revenue), 320000);
  const clear = await patch(`/harvests/${h2.id}`, { revenue: null });
  assert.equal(clear.data.harvest.revenue, null, "it can be cleared again");
  const list = (await get(`/harvests?year=${YEAR}`)).data.harvests;
  assert.deepEqual([list.find((h) => h.id === h1.id).farm_kind, list.find((h) => h.id === h3.id).farm_kind], ["livestock", "crop"]);
});

test("costs: inputs, labour and other, per farm, optionally charged to one of its harvests", async () => {
  const day = `${YEAR}-02-01`;
  const base = { farmId: layers.id, category: "inputs", description: "Layer feed", amount: 100000, incurredOn: day };
  for (const [extra, status] of [[{ farmId: undefined }, 400], [{ farmId: "00000000-0000-4000-8000-000000000000" }, 404], [{ category: "rent" }, 400], [{ description: " " }, 400],
    [{ amount: 0 }, 400], [{ amount: "x" }, 400], [{ incurredOn: "2018-13-40" }, 400], [{ incurredOn: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10) }, 400],
    [{ harvestId: h3.id }, 400], [{ harvestId: "nope" }, 400]]) {
    assert.equal((await post("/costs", { ...base, ...extra })).status, status, JSON.stringify(extra));
  }
  assert.equal((await post("/costs", base, (await newFarmer()).token)).status, 403);
  const c1 = await post("/costs", { ...base, harvestId: h1.id });          // inputs charged to the egg harvest
  assert.equal(c1.status, 201, JSON.stringify(c1.data));
  await post("/costs", { ...base, category: "labour", description: "Attendants", amount: 50000, harvestId: h1.id });
  await post("/costs", { ...base, category: "other", description: "Water and power", amount: 40000 });                 // general farm cost
  await post("/costs", { farmId: layers.id, category: "inputs", description: "Day-old chicks", amount: 90000, harvestId: h2.id, incurredOn: `${YEAR}-04-01` });
  await post("/costs", { farmId: maize.id, category: "inputs", description: "Seed and fertiliser", amount: 60000, harvestId: h3.id, incurredOn: `${YEAR}-05-01` });
  const upd = await patch(`/costs/${c1.data.cost.id}`, { amount: 110000, description: "Layer feed (corrected)" });
  assert.equal(upd.status, 200); assert.equal(upd.data.cost.amount, 110000);
  assert.equal((await patch(`/costs/${c1.data.cost.id}`, { harvestId: h3.id })).status, 400, "cannot move a cost to another farm's harvest");
  const moved = await patch(`/costs/${c1.data.cost.id}`, { amount: 100000, harvestId: null });
  assert.equal(moved.data.cost.harvest_id, null, "a cost can be made a general farm cost");
  const back = await patch(`/costs/${c1.data.cost.id}`, { harvestId: h1.id, description: "Layer feed" });
  assert.equal(back.data.cost.harvest_id, h1.id);
  assert.equal((await patch("/costs/00000000-0000-4000-8000-000000000000", { amount: 5 })).status, 404);
  const byFarm = (await get(`/costs?farmId=${layers.id}&year=${YEAR}`)).data.costs;
  assert.equal(byFarm.length, 4);
  assert.equal((await get(`/costs?harvestId=${h1.id}`)).data.costs.length, 2);
  const tmp = await post("/costs", { ...base, description: "Mistake", amount: 1 });
  assert.equal((await del(`/costs/${tmp.data.cost.id}`)).status, 204);
  assert.equal((await del(`/costs/${tmp.data.cost.id}`)).status, 404);
});

test("profit per harvest, per farm and overall, with nothing hidden", async () => {
  const p = (await get(`/profit?year=${YEAR}`)).data;
  const hv = (id) => p.harvests.find((h) => h.id === id);
  // eggs: revenue 500,000 - charged costs 150,000 = 350,000 (70%)
  assert.deepEqual([hv(h1.id).revenue, hv(h1.id).costs, hv(h1.id).profit, hv(h1.id).margin], [500000, 150000, 350000, 70]);
  // broilers: no revenue recorded yet -> profit unknown, not zero
  assert.deepEqual([hv(h2.id).revenue, hv(h2.id).costs, hv(h2.id).profit], [null, 90000, null]);
  assert.deepEqual([hv(h3.id).profit, hv(h3.id).margin], [140000, 70]);
  const farm = (id) => p.farms.find((f) => f.farmId === id);
  // layer farm: revenue 500,000; ALL costs 150,000 + 40,000 general + 90,000 = 280,000 -> 220,000
  assert.deepEqual([farm(layers.id).revenue, farm(layers.id).costs, farm(layers.id).generalCosts, farm(layers.id).profit], [500000, 280000, 40000, 220000]);
  assert.deepEqual([farm(maize.id).revenue, farm(maize.id).costs, farm(maize.id).profit], [200000, 60000, 140000]);
  assert.deepEqual(p.costsByCategory, { inputs: 250000, labour: 50000, other: 40000 });
  assert.deepEqual(p.totals, { revenue: 700000, costs: 340000, profit: 360000, harvestsMissingRevenue: 1 });
  assert.equal((await get(`/profit?year=1999`)).data.totals.revenue, 0);
});

test("the annual summary and the dashboard know about livestock and money", async () => {
  const s = (await get(`/summary?year=${YEAR}`)).data.summary;
  const eggs = s.find((r) => r.crop === "Eggs");
  assert.deepEqual([eggs.kind, eggs.totalDeclared, eggs.totalRevenue], ["livestock", 300, 500000]);
  assert.equal(s.find((r) => r.crop === "Maize").kind, "crop");
  const d = (await get("/dashboard")).data;
  assert.ok(d.livestockFarms >= 1);
  for (const k of ["revenueThisYear", "costsThisYear", "profitThisYear"]) assert.equal(typeof d[k], "number");
});

test("a farm with harvests or costs cannot be deleted; an empty one can", async () => {
  const del1 = await del(`/farms/${layers.id}`);
  assert.equal(del1.status, 400); assert.match(del1.data.error, /harvest or cost records/);
  const empty = (await post("/farms", { name: `Empty ${uniq()}`, kind: "livestock" })).data.farm;
  assert.equal((await post("/costs", { farmId: empty.id, category: "other", description: "Fencing", amount: 5000 })).status, 201);
  assert.equal((await del(`/farms/${empty.id}`)).status, 400, "a farm with only costs is also protected");
  const clean = (await post("/farms", { name: `Clean ${uniq()}` })).data.farm;
  assert.equal((await del(`/farms/${clean.id}`)).status, 204);
});
