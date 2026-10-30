// Phase 8: verified farmer identity (NIN via NIMC), locked NIMC fields, residential address with an
// automatically detected unit, and the gate on sensitive features.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, db, loginAdmin, newFarmer, waitForMessage, PAYSTACK } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

after(async () => { await db.end(); await pool.end(); });

let admin, seq = 0;
const run = Date.now().toString().slice(-6);
const ninOf = () => { const n = `7${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}${++seq % 10}`; return n; };
const ps = (path) => fetch(`${PAYSTACK}${path}`).then((r) => r.json());
const STATE = `Idstate${run}`;
const email = () => `idf${run}${++seq}@example.test`;
const verify = (nin, extra = {}) => api("/auth/verify-nin", { method: "POST", body: { nin, consent: true, ...extra } });
const reg = (body) => api("/auth/register", { method: "POST", body: { role_type: "farmer", password: "Passw0rd!x", sex: "male", email: email(), ...body } });
const userRow = async (id) => (await db.query("SELECT * FROM users WHERE id=$1", [id])).rows[0];
const profRow = async (id) => (await db.query("SELECT * FROM farmer_profiles WHERE user_id=$1", [id])).rows[0];
const put = (path, token, body) => api(path, { method: "PUT", token, body });
const FULL = { maritalStatus: "married", farmType: "crop_production", farmSize: "2-4_hectares", yearsExperience: "6-10", keepsRecords: "yes", annualFarmIncome: "100k-400k", additionalIncomeType: "business", businessType: "Shop", businessMaxDuration: "3", businessIncomeFrequency: "weekly", businessIncomeAmount: "5000", crops: "Maize,Cassava", homeAddress: "5 Kasuwa Road" };

test("setup", async () => { admin = await loginAdmin(); });

test("verify-nin: validation, consent, not found, provider outage, and a successful NIMC lookup", async () => {
  assert.equal((await verify("123")).status, 400);
  assert.equal((await api("/auth/verify-nin", { method: "POST", body: { nin: ninOf() } })).data.code, "CONSENT_REQUIRED");
  const nf = await verify("01234567890");
  assert.equal(nf.status, 404); assert.equal(nf.data.code, "NIN_NOT_FOUND");
  const down = await verify("91234567890");
  assert.equal(down.status, 503); assert.equal(down.data.code, "NIN_UNAVAILABLE");
  await ps("/__ninfail?on=1");
  assert.equal((await verify(ninOf())).data.code, "NIN_UNAVAILABLE");
  await ps("/__ninfail?on=0");
  const ok = await verify("70123456789");
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.identity.fullName, "John Anon Doe");
  assert.equal(ok.data.identity.gender, "female"); assert.match(ok.data.identity.dateOfBirth, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(ok.data.identity.permanentAddress, /MARKET ROAD/);
  assert.ok(ok.data.token); assert.equal(ok.data.ninLast4, "6789");
  assert.ok(!JSON.stringify(ok.data).includes("70123456789"), "the NIN is never echoed back");
});

test("registering with a verified NIN: NIMC supplies name, gender, date of birth and permanent address and they override the form; the NIN itself is never stored", async () => {
  const nin = ninOf();
  const v = (await verify(nin)).data;
  const r = await reg({ name: "Typed Name", sex: v.identity.gender === "male" ? "female" : "male", dateOfBirth: "1999-09-09", ninToken: v.token, state: STATE, lga: "L1", ward: "W1", unit: "Typed Unit", ...FULL });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const u = await userRow(r.data.user.id), p = await profRow(r.data.user.id);
  assert.equal(u.name, v.identity.fullName); assert.equal(u.sex, v.identity.gender);
  assert.equal(String(p.date_of_birth.toISOString?.().slice(0, 10) ?? p.date_of_birth), v.identity.dateOfBirth);
  assert.equal(p.permanent_address, v.identity.permanentAddress);
  assert.equal(u.nin_verified, true); assert.equal(u.nin_last4, nin.slice(-4));
  assert.ok(u.nin_hash && u.nin_hash !== nin);
  const all = JSON.stringify((await db.query("SELECT * FROM users WHERE id=$1", [u.id])).rows) + JSON.stringify((await db.query("SELECT * FROM farmer_profiles WHERE user_id=$1", [u.id])).rows);
  assert.ok(!all.includes(nin), "the NIN is not stored anywhere");
  assert.equal(r.data.user.ninVerified, true); assert.equal(r.data.user.profileStatus.ninVerified, true);

  // the same NIN cannot open a second account
  const again = await verify(nin);
  assert.equal(again.status, 409); assert.equal(again.data.code, "NIN_ALREADY_REGISTERED");
  assert.equal((await reg({ name: "X", ninToken: v.token, state: STATE, lga: "L1", ward: "W1" })).status, 409);
  // a forged or broken token is refused; an unverified registration still works
  assert.equal((await reg({ name: "X", ninToken: v.token + "x", state: STATE, lga: "L1", ward: "W1" })).data.code, "NIN_TOKEN_INVALID");
  const plain = await reg({ name: "No Nin Farmer", state: STATE, lga: "L1", ward: "W1", unit: "Typed Unit", ...FULL });
  assert.equal(plain.status, 201);
  assert.equal((await userRow(plain.data.user.id)).nin_verified, false);
  assert.equal(plain.data.user.name, "No Nin Farmer");
});

test("NIMC fields are locked once verified; everything else is editable; an unverified farmer may still edit their own name and date of birth", async () => {
  const v = (await verify(ninOf())).data;
  const r = await reg({ name: "A", ninToken: v.token, state: STATE, lga: "L1", ward: "W1", unit: "U", ...FULL });
  const t = r.data.token;
  for (const body of [{ name: "New Name" }, { sex: "female" }, { dateOfBirth: "1980-01-01" }, { permanentAddress: "Somewhere else" }]) {
    const res = await put("/farmers/me", t, body);
    assert.equal(res.status, 400, JSON.stringify(body)); assert.equal(res.data.code, "NIMC_LOCKED");
  }
  const ok = await put("/farmers/me", t, { maritalStatus: "widowed", farmSize: "5plus_hectares", crops: "Rice,Yam", keepsRecords: "no" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const p = await profRow(r.data.user.id);
  assert.equal(p.marital_status, "widowed"); assert.equal(p.farm_size, "5plus_hectares"); assert.deepEqual(p.crops, ["Rice", "Yam"]); assert.equal(p.keeps_inventory_records, false);
  assert.equal((await put("/farmers/me", t, { farmSize: "huge" })).status, 400);
  const unit = await put("/farmers/me", t, { unit: "Hacked Unit" });
  assert.equal(unit.status, 400); assert.equal(unit.data.code, "UNIT_IS_AUTOMATIC");

  const u = await reg({ name: "Old Name", state: STATE, lga: "L1", ward: "W1", unit: "U", ...FULL });
  const edit = await put("/farmers/me", u.data.token, { name: "Corrected Name", dateOfBirth: "1985-05-05", permanentAddress: "12 Old Road" });
  assert.equal(edit.status, 200);
  assert.equal((await userRow(u.data.user.id)).name, "Corrected Name"); assert.equal((await profRow(u.data.user.id)).permanent_address, "12 Old Road");
});

test("an existing farmer verifies later: NIMC data replaces theirs and locks it; the NIN cannot be reused or verified twice", async () => {
  const f = await newFarmer();
  const nin = ninOf();
  assert.equal((await api("/farmers/me/verify-nin", { method: "POST", token: f.token, body: { nin } })).data.code, "CONSENT_REQUIRED");
  assert.equal((await api("/farmers/me/verify-nin", { method: "POST", token: f.token, body: { nin: "12", consent: true } })).status, 400);
  const ok = await api("/farmers/me/verify-nin", { method: "POST", token: f.token, body: { nin, consent: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const u = await userRow(f.id);
  assert.equal(u.nin_verified, true); assert.equal(u.name, ok.data.identity.fullName);
  assert.equal((await put("/farmers/me", f.token, { name: "Nope" })).data.code, "NIMC_LOCKED");
  assert.equal((await api("/farmers/me/verify-nin", { method: "POST", token: f.token, body: { nin: ninOf(), consent: true } })).status, 409);
  const other = await newFarmer();
  const dup = await api("/farmers/me/verify-nin", { method: "POST", token: other.token, body: { nin, consent: true } });
  assert.equal(dup.status, 409); assert.equal(dup.data.code, "NIN_ALREADY_REGISTERED");
  assert.equal((await api("/farmers/me/verify-nin", { method: "POST", token: admin, body: { nin: ninOf(), consent: true } })).status, 403);
});

// ---------------------------------------------------------------------------------------------
// units: set up two official units in a private state, then place farmers by their address
// ---------------------------------------------------------------------------------------------
const AREA = { state: `Unitstate${run}`, lga: "Lga One", ward: "Ward One" };
const ALPHA = { lat: 10.29, lng: 11.17 }, BETA = { lat: 10.35, lng: 11.25 };
async function leader(unitName) {
  const r = await reg({ name: `Leader ${unitName}`, ...AREA, unit: unitName, ...FULL });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await db.query("UPDATE farmer_profiles SET rank='Unit Leader' WHERE user_id=$1", [r.data.user.id]);
  return { token: r.data.token, id: r.data.user.id };
}
let leaderA, leaderB;

test("unit leaders pin their own unit and list its communities; admins manage the unit list", async () => {
  leaderA = await leader("Alpha Unit"); leaderB = await leader("Beta Unit");
  assert.equal((await put("/units/mine/location", leaderA.token, { lat: ALPHA.lat })).status, 400, "both coordinates or neither");
  assert.equal((await put("/units/mine/location", leaderA.token, { lat: 51.5, lng: 0.1 })).status, 400, "outside Nigeria");
  assert.equal((await put("/units/mine/location", leaderA.token, { ...ALPHA, communities: "Gidan Dutse, Sabon Layi" })).status, 200);
  assert.equal((await put("/units/mine/location", leaderB.token, { ...BETA, communities: ["Kasuwa", "Tudun Wada"] })).status, 200);
  const mine = await api("/units/mine/location", { token: leaderB.token });
  assert.deepEqual(mine.data.unit.communities, ["Kasuwa", "Tudun Wada"]); assert.equal(mine.data.unit.lat, BETA.lat);
  const member = await newFarmer();
  assert.equal((await put("/units/mine/location", member.token, { ...BETA })).status, 403, "only Unit Leaders");

  const list = (await api("/units/catalog", { token: admin })).data.units.filter((u) => u.state === AREA.state);
  assert.deepEqual(list.map((u) => u.name).sort(), ["Alpha Unit", "Beta Unit"]);
  assert.ok(list.find((u) => u.name === "Beta Unit").members >= 1);
  assert.equal((await api("/units/catalog", { token: member.token })).status, 403);
  const created = await api("/units/catalog", { method: "POST", token: admin, body: { name: "Gamma Unit", ...AREA, lat: 10.2, lng: 11.0, communities: "Rafin Gora" } });
  assert.equal(created.status, 201);
  assert.equal((await api("/units/catalog", { method: "POST", token: admin, body: { name: "gamma unit", ...AREA } })).status, 409);
  assert.equal((await api("/units/catalog", { method: "POST", token: admin, body: { name: "x" } })).status, 400);
  assert.equal((await api(`/units/catalog/${created.data.id}`, { method: "PUT", token: admin, body: { active: false } })).status, 200);
  assert.equal((await api("/units/catalog/not-a-uuid", { method: "PUT", token: admin, body: { active: false } })).status, 404);
  // an approved unit proposal becomes an official unit
  const prop = await api("/units", { method: "POST", token: leaderA.token, body: { name: "Delta Unit", ...AREA } });
  assert.equal((await api(`/units/admin/${prop.data.unit.id}/decide`, { method: "POST", token: admin, body: { decision: "approved" } })).status, 200);
  assert.ok((await api("/units/catalog", { token: admin })).data.units.some((u) => u.name === "Delta Unit" && u.source === "approved_proposal"));
  await db.query("UPDATE unit_catalog SET active = FALSE WHERE name IN ('Delta Unit','Gamma Unit') AND state=$1", [AREA.state]);
});

test("registration finds the unit from the address: GPS pin, then community names, then the only unit in the ward", async () => {
  const gps = await reg({ name: "Near Beta", ...AREA, community: "Nowhere Known", lat: 10.351, lng: 11.251, ...FULL });
  assert.equal(gps.status, 201);
  assert.equal(gps.data.user.unit, "Beta Unit"); assert.equal((await profRow(gps.data.user.id)).unit_match_method, "gps");
  const near = await reg({ name: "Near Alpha", ...AREA, lat: 10.2905, lng: 11.1705, ...FULL });
  assert.equal(near.data.user.unit, "Alpha Unit");
  const comm = await reg({ name: "By Community", ...AREA, community: "Tudun Wada", street: "Zaria Road", ...FULL });
  assert.equal(comm.data.user.unit, "Beta Unit"); assert.equal((await profRow(comm.data.user.id)).unit_match_method, "community");
  const street = await reg({ name: "By Street", ...AREA, community: "Unknown", street: "Gidan Dutse", ...FULL });
  assert.equal(street.data.user.unit, "Alpha Unit");
  // far from every pin and nothing in the names: two units in the ward, so no guess is made
  const lost = await reg({ name: "Lost Farmer", ...AREA, community: "Zzzz", lat: 6.5, lng: 3.4, ...FULL });
  assert.equal(lost.status, 201);
  assert.equal(lost.data.user.unit, null);
  assert.ok(lost.data.user.profileStatus.missing.includes("unit"));
  assert.ok(await waitForMessage("template='unit_not_found' AND body_text ILIKE $1", [`%${AREA.ward}%`]), "admins are told");
  // the only unit in a ward is used when nothing else matches
  await db.query("INSERT INTO unit_catalog (name,state,lga,ward) VALUES ('Solo Unit',$1,'Lga Two','Ward Solo')", [AREA.state]);
  const solo = await reg({ name: "Solo Farmer", state: AREA.state, lga: "Lga Two", ward: "Ward Solo", community: "Anything", ...FULL });
  assert.equal(solo.data.user.unit, "Solo Unit"); assert.equal((await profRow(solo.data.user.id)).unit_match_method, "ward_only");
});

test("changing the residential address switches the unit automatically, moves a pending loan to the new Unit Leader, tells the farmer, and is logged", async () => {
  const f = await reg({ name: "Mover", ...AREA, lat: 10.2902, lng: 11.1702, ...FULL });
  assert.equal(f.data.user.unit, "Alpha Unit");
  const loan = await db.query("INSERT INTO loans (reference, farmer_id, loan_type, amount, status) VALUES ($1,$2,'boost_cash',50000,'pending') RETURNING id", [`LN-${run}-${++seq}`, f.data.user.id]);
  const seen = async (l) => (await api("/loans/pending/my-unit", { token: l.token })).data.loans.map((x) => x.id);
  assert.ok((await seen(leaderA)).includes(loan.rows[0].id)); assert.ok(!(await seen(leaderB)).includes(loan.rows[0].id));

  assert.equal((await put("/farmers/me/residence", f.data.token, { address: "x", ...AREA })).status, 400);
  assert.equal((await put("/farmers/me/residence", f.data.token, { address: "9 New Road", state: AREA.state })).status, 400);
  assert.equal((await put("/farmers/me/residence", f.data.token, { address: "9 New Road", ...AREA, lat: 10.3 })).status, 400);
  assert.equal((await put("/farmers/me/residence", f.data.token, { address: "9 New Road", ...AREA, lat: 60, lng: 5 })).status, 400);
  assert.equal((await put("/farmers/me/residence", admin, { address: "9 New Road", ...AREA })).status, 403);

  const r = await put("/farmers/me/residence", f.data.token, { address: "9 New Road, Kasuwa", ...AREA, community: "Kasuwa", lat: 10.3501, lng: 11.2499 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.changed, true); assert.equal(r.data.unit.name, "Beta Unit"); assert.equal(r.data.method, "gps"); assert.equal(r.data.pendingLoansMoved, 1);
  assert.ok(r.data.distanceKm < 1);
  assert.equal((await userRow(f.data.user.id)).unit, "Beta Unit");
  assert.equal((await profRow(f.data.user.id)).home_address, "9 New Road, Kasuwa");
  assert.ok((await seen(leaderB)).includes(loan.rows[0].id), "the pending loan is now with the new Unit Leader");
  assert.ok(!(await seen(leaderA)).includes(loan.rows[0].id));
  const log = (await db.query("SELECT * FROM farmer_unit_changes WHERE user_id=$1", [f.data.user.id])).rows;
  assert.equal(log.length, 1); assert.equal(log[0].from_unit, "Alpha Unit"); assert.equal(log[0].to_unit, "Beta Unit"); assert.equal(log[0].pending_loans_moved, 1);
  assert.ok(await waitForMessage("to_user_id=$1 AND template='unit_changed'", [f.data.user.id]));
  // saving the same address again changes nothing
  const same = await put("/farmers/me/residence", f.data.token, { address: "9 New Road, Kasuwa", ...AREA, lat: 10.3501, lng: 11.2499 });
  assert.equal(same.data.changed, false);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM farmer_unit_changes WHERE user_id=$1", [f.data.user.id])).rows[0].n, 1);
  // an address that matches nothing keeps the current unit and tells the admins
  const nowhere = await put("/farmers/me/residence", f.data.token, { address: "1 Faraway Lane", ...AREA, community: "Qqqq", lat: 6.4, lng: 3.3 });
  assert.equal(nowhere.data.matched, false); assert.equal((await userRow(f.data.user.id)).unit, "Beta Unit");
  // the match distance is an admin setting
  assert.equal((await api("/farmers/admin/identity-settings", { method: "PUT", token: admin, body: { unitMatchMaxKm: 0 } })).status, 400);
  await api("/farmers/admin/identity-settings", { method: "PUT", token: admin, body: { unitMatchMaxKm: 1 } });
  const far = await put("/farmers/me/residence", f.data.token, { address: "3 Road", ...AREA, community: "Qqqq", lat: 10.2999, lng: 11.2 });
  assert.equal(far.data.matched, false, "about 5 km away is outside a 1 km limit");
  await api("/farmers/admin/identity-settings", { method: "PUT", token: admin, body: { unitMatchMaxKm: 15 } });
});

test("sensitive features need a verified NIN and a complete profile when the gate is on; everything else stays open", async () => {
  const set = (gateEnabled) => api("/farmers/admin/identity-settings", { method: "PUT", token: admin, body: { gateEnabled } });
  assert.equal((await api("/farmers/admin/identity-settings", { method: "PUT", token: admin, body: { gateEnabled: "yes" } })).status, 400);
  assert.equal((await api("/farmers/admin/identity-settings", { token: (await newFarmer()).token })).status, 403);
  try {
    const on = await set(true);
    assert.equal(on.data.gateEnabled, true); assert.ok(on.data.farmers >= 1);

    const legacy = await newFarmer();                                  // registered long ago: no NIN, blank survey fields
    const me = (await api("/auth/me", { token: legacy.token })).data.user;
    assert.equal(me.profileStatus.restricted, true); assert.equal(me.profileStatus.needsNin, true);
    assert.ok(me.profileStatus.missing.includes("farmType") && me.profileStatus.missing.includes("maritalStatus"));
    const blocked = [
      api("/loans", { method: "POST", token: legacy.token, body: { loanType: "boost_cash", amount: 50000 } }),
      api("/farmers/me/savings/withdraw", { method: "POST", token: legacy.token, body: { amount: 100 } }),
      api("/farmers/me/shares/checkout", { method: "POST", token: legacy.token, body: { quantity: 1 } }),
    ];
    for (const r of await Promise.all(blocked)) { assert.equal(r.status, 403); assert.equal(r.data.code, "PROFILE_RESTRICTED"); assert.equal(r.data.needsNin, true); assert.equal(r.data.needsProfile, true); assert.match(r.data.error, /verify your NIN/); }
    // non-sensitive features are untouched
    assert.equal((await api("/farmers/me/savings", { token: legacy.token })).status, 200);
    assert.equal((await api("/farmers/me/profile-status", { token: legacy.token })).status, 200);
    assert.equal((await api("/farmers/me/products", { token: legacy.token })).status, 200);

    // verified but the profile is incomplete: only the profile is asked for
    const v = (await verify(ninOf())).data;
    const half = await reg({ name: "Half", ninToken: v.token, ...AREA, unit: "Alpha Unit" });
    const h = await api("/farmers/me/savings/withdraw", { method: "POST", token: half.data.token, body: { amount: 100 } });
    assert.equal(h.status, 403); assert.equal(h.data.needsNin, false); assert.equal(h.data.needsProfile, true); assert.match(h.data.error, /complete your profile/);
    // complete the profile and it opens (the request then fails only on its own rules, not the gate)
    assert.equal((await put("/farmers/me", half.data.token, { maritalStatus: "single", farmType: "livestock", farmSize: "0-1_hectares", yearsExperience: "1-5", keepsRecords: "no", annualFarmIncome: "50k-100k", additionalIncomeType: "work", workType: "Teacher", workOrgName: "School", workRank: "Teacher", workMonthlyIncome: "50000", crops: "Poultry" })).status, 200);
    assert.equal((await put("/farmers/me/residence", half.data.token, { address: "4 Market Road", ...AREA, lat: 10.2901, lng: 11.1701 })).status, 200);
    const st = (await api("/farmers/me/profile-status", { token: half.data.token })).data.status;
    assert.deepEqual(st.missing, []); assert.equal(st.restricted, false);
    const open = await api("/farmers/me/savings/withdraw", { method: "POST", token: half.data.token, body: { amount: 100 } });
    assert.notEqual(open.data.code, "PROFILE_RESTRICTED");

    // verifying an existing farmer lifts the NIN part; the profile part remains until they fill it in
    assert.equal((await api("/farmers/me/verify-nin", { method: "POST", token: legacy.token, body: { nin: ninOf(), consent: true } })).status, 200);
    const after = (await api("/farmers/me/profile-status", { token: legacy.token })).data.status;
    assert.equal(after.needsNin, false); assert.equal(after.needsProfile, true);
    // switching the gate off opens everything again
    await set(false);
    const lift = await api("/farmers/me/savings/withdraw", { method: "POST", token: (await newFarmer()).token, body: { amount: 100 } });
    assert.notEqual(lift.data.code, "PROFILE_RESTRICTED");
  } finally {
    await set(false);
  }
});
