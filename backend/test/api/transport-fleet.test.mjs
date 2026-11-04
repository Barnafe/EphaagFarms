// Phase 12: Transport fleet (vehicles, drivers, trips), delivery tracking with proof, breakdowns into Maintenance,
// and the budget rule for Maintenance and Transport costs.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, db, newFarmer, newBuyer, newUser, loginAdmin, waitForMessage, sleep, uniq } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

const staff = {};
after(async () => {
  await db.query("UPDATE users SET department_head_of = NULL WHERE id = ANY($1)", [Object.values(staff).map((s) => s.id)]);
  await db.end(); await pool.end();
});

// A real 1x1 PNG (the storage layer checks the real file type).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const YEAR = 2021; // an old year keeps cost budgets separate from every other test
let main;
const T = (p, token = main, opts = {}) => api(`/transport${p}`, { token, ...opts });
const post = (p, body, token = main) => api(`/transport${p}`, { method: "POST", token, body });
const M = (p, token = main, opts = {}) => api(`/maintenance${p}`, { token, ...opts });

async function makeStaff(role) {
  const f = await newFarmer();
  assert.equal((await api(`/admin/positions/admins/${f.id}/promote`, { method: "POST", token: main })).status, 200);
  if (role) assert.equal((await api(`/admin/positions/hods/${f.id}/promote`, { method: "POST", token: main, body: { department: role } })).status, 200);
  const login = await api("/auth/login", { method: "POST", body: { email: f.email, password: f.password } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  return { id: f.id, email: f.email, token: login.data.token };
}
async function makeDriver(licenceExpiry = "2099-01-01") {
  const u = await newUser();
  await db.query("UPDATE users SET role_type = 'transporter' WHERE id = $1", [u.id]);
  const login = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const d = { id: u.id, email: u.email, token: login.data.token };
  assert.equal((await api(`/transport/drivers/${d.id}/profile`, { method: "PUT", token: main, body: { licenceNumber: `LIC${uniq()}`, licenceExpiry } })).status, 200);
  return d;
}
async function readyOrder(buyer) {
  const { rows: [o] } = await db.query(
    `INSERT INTO orders (reference, buyer_id, delivery_location, total, paid_via, status, contact_email)
     VALUES ($1,$2,'12 Market Road, Bauchi',50000,'upfront','allocated',$3) RETURNING *`, [`ORD-T-${uniq()}`, buyer.id, buyer.email]);
  await db.query("INSERT INTO order_items (order_id, crop, quantity, unit, line_total) VALUES ($1,'Maize',5,'bags',50000)", [o.id]);
  await db.query("INSERT INTO distributor_allocations (order_id, distributor_id, status) VALUES ($1,$2,'confirmed')", [o.id, buyer.id]);
  return o;
}
const vehicle = async (plate = `T${uniq().toUpperCase()}`) => {
  const r = await post("/vehicles", { plateNumber: plate, name: "Test truck", vehicleType: "truck", capacityKg: 3000, odometerKm: 1000 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.vehicle;
};
const codeOf = async (orderId) => (await db.query("SELECT delivery_code FROM shipments WHERE order_id = $1", [orderId])).rows[0].delivery_code;
const deliverForm = (fields, withPhoto = true) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.append(k, String(v));
  if (withPhoto) f.append("photo", new Blob([PNG], { type: "image/png" }), "proof.png");
  return f;
};
const deliver = (shipmentId, fields, token, withPhoto = true) => api(`/transport/shipments/${shipmentId}/deliver`, { method: "POST", token, body: deliverForm(fields, withPhoto) });
const GPS = { lat: 10.3158, lng: 9.8442, accuracy: 12 };

let buyer, buyer2, driver, driver2, driver3, veh, veh2, finance, plainAdmin;

test("setup: staff, drivers, buyers; only admins use the Transport office and only drivers use the driver routes", async () => {
  main = await loginAdmin();
  finance = await makeStaff("Finance");
  plainAdmin = await makeStaff("Procurement");
  driver = await makeDriver(); driver2 = await makeDriver(); driver3 = await makeDriver();
  buyer = await newBuyer(); buyer2 = await newBuyer();
  const farmer = await newFarmer();
  for (const p of ["/dashboard", "/queue", "/vehicles", "/trips", "/costs", "/drivers", "/reports/fleet"]) {
    assert.equal((await api(`/transport${p}`)).status, 401, `${p} anonymous`);
    assert.equal((await T(p, farmer.token)).status, 403, `${p} farmer`);
    assert.equal((await T(p, driver.token)).status, 403, `${p} driver`);
  }
  for (const p of ["/trips/me"]) {
    assert.equal((await T(p, main)).status, 403, "an admin is not a driver");
    assert.equal((await T(p, buyer.token)).status, 403);
  }
});

test("vehicles: checked, unique plate, and each one appears in Maintenance as an asset", async () => {
  for (const [body, status] of [[{}, 400], [{ plateNumber: "AB" }, 400], [{ plateNumber: "BAU 111 AA", vehicleType: "boat" }, 400], [{ plateNumber: "BAU 111 AA", capacityKg: -4 }, 400], [{ plateNumber: "BAU 111 AA", odometerKm: "abc" }, 400]]) {
    assert.equal((await post("/vehicles", body)).status, status, JSON.stringify(body));
  }
  const plate = `PLT ${uniq().toUpperCase()}`;
  veh = await vehicle(plate);
  assert.equal(veh.status, "available"); assert.equal(Number(veh.odometer_km), 1000);
  assert.equal((await post("/vehicles", { plateNumber: plate.toLowerCase() })).status, 409, "the plate is unique whatever the case");
  const assets = (await M("/assets")).data.assets;
  const asset = assets.find((a) => a.id === veh.asset_id);
  assert.ok(asset, "the vehicle is a Maintenance asset"); assert.equal(asset.asset_type, "Vehicle");
  veh2 = await vehicle();
  assert.equal((await T(`/vehicles/${veh2.id}`, main, { method: "PATCH", body: { status: "on_trip" } })).status, 400);
  assert.equal((await T(`/vehicles/${veh2.id}`, main, { method: "PATCH", body: {} })).status, 400);
  assert.equal((await T("/vehicles/nope", main, { method: "PATCH", body: { name: "x" } })).status, 404);
  const r = await T(`/vehicles/${veh2.id}`, main, { method: "PATCH", body: { status: "retired" } });
  assert.equal(r.data.vehicle.status, "retired");
  assert.equal((await T(`/vehicles/${veh2.id}`, main, { method: "PATCH", body: { status: "available" } })).data.vehicle.status, "available");
});

test("drivers: licence details are kept and an expired licence stops a trip", async () => {
  assert.equal((await api(`/transport/drivers/${driver.id}/profile`, { method: "PUT", token: main, body: { licenceExpiry: "31/12/2030" } })).status, 400);
  assert.equal((await api(`/transport/drivers/${plainAdmin.id}/profile`, { method: "PUT", token: main, body: {} })).status, 404, "only drivers have a driver profile");
  const dirs = (await T("/drivers")).data.drivers;
  assert.ok(dirs.find((d) => d.id === driver.id && d.licence_number && d.on_trip === false));
  const old = await makeDriver("2020-01-01");
  const o = await readyOrder(buyer2);
  const r = await post("/trips", { vehicleId: veh2.id, driverId: old.id, orderIds: [o.id] });
  assert.equal(r.status, 409); assert.equal(r.data.code, "LICENCE_EXPIRED");
  await db.query("DELETE FROM distributor_allocations WHERE order_id = $1", [o.id]); await db.query("DELETE FROM orders WHERE id = $1", [o.id]);
});

let trip, ship, order1, order2;
test("dispatch: a trip carries several orders, buyers are sent a delivery code, and nothing is double booked", async () => {
  order1 = await readyOrder(buyer); order2 = await readyOrder(buyer2);
  const q = (await T("/queue")).data.orders.map((o) => o.id);
  assert.ok(q.includes(order1.id) && q.includes(order2.id), "both orders are in the dispatch queue");
  for (const [body, status] of [[{}, 400], [{ vehicleId: veh.id, driverId: driver.id, orderIds: [] }, 400], [{ vehicleId: "x", driverId: driver.id, orderIds: [order1.id] }, 400],
    [{ vehicleId: veh.id, driverId: driver.id, orderIds: ["nope"] }, 400],
    [{ vehicleId: "00000000-0000-4000-8000-000000000000", driverId: driver.id, orderIds: [order1.id] }, 404],
    [{ vehicleId: veh.id, driverId: plainAdmin.id, orderIds: [order1.id] }, 404],
    [{ vehicleId: veh.id, driverId: driver.id, orderIds: [order1.id, "00000000-0000-4000-8000-000000000000"] }, 400]]) {
    assert.equal((await post("/trips", body)).status, status, JSON.stringify(body));
  }
  assert.equal((await post("/trips", { vehicleId: veh.id, driverId: driver.id, orderIds: [order1.id, order2.id] }, driver.token)).status, 403);
  const r = await post("/trips", { vehicleId: veh.id, driverId: driver.id, orderIds: [order1.id, order2.id], notes: "Morning run" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  trip = r.data.trip; assert.equal(trip.status, "planned"); assert.equal(r.data.shipments.length, 2);
  assert.ok(!JSON.stringify(r.data).includes("delivery_code"), "the delivery code never goes back to the office");
  const st = (await db.query("SELECT status FROM orders WHERE id = ANY($1)", [[order1.id, order2.id]])).rows;
  assert.ok(st.every((x) => x.status === "in_transit"));
  assert.equal((await db.query("SELECT status FROM vehicles WHERE id = $1", [veh.id])).rows[0].status, "on_trip");
  // the same vehicle, the same driver, or the same orders cannot be used again
  const o3 = await readyOrder(buyer);
  assert.equal((await post("/trips", { vehicleId: veh.id, driverId: driver2.id, orderIds: [o3.id] })).data.code, "VEHICLE_UNAVAILABLE");
  assert.equal((await post("/trips", { vehicleId: veh2.id, driverId: driver.id, orderIds: [o3.id] })).data.code, "DRIVER_BUSY");
  assert.equal((await post("/trips", { vehicleId: veh2.id, driverId: driver2.id, orderIds: [order1.id] })).status, 400, "an order already on a trip");
  await db.query("DELETE FROM distributor_allocations WHERE order_id = $1", [o3.id]); await db.query("DELETE FROM orders WHERE id = $1", [o3.id]);
  // messages: the buyer gets the code, the driver is told
  const code1 = await codeOf(order1.id);
  const m = await waitForMessage("template = 'delivery_dispatched' AND to_address = $1", [buyer.email]);
  assert.ok(m && m.body_html.includes(code1), "the buyer's message carries the delivery code");
  assert.ok(await waitForMessage("template = 'driver_trip_assigned' AND to_address = $1", [driver.email]));
  const list = (await T("/trips?status=planned")).data.trips.find((t) => t.id === trip.id);
  assert.equal(list.shipments.length, 2); assert.ok(!JSON.stringify(list).includes(code1));
  assert.equal((await T("/trips?status=weird")).status, 400);
});

test("the buyer sees where the order is and the delivery code until it is delivered", async () => {
  const mine = (await api("/orders/me", { token: buyer.token })).data.orders.find((o) => o.id === order1.id);
  assert.equal(mine.delivery.status, "assigned"); assert.equal(mine.delivery.code, await codeOf(order1.id));
  assert.ok(mine.delivery.driverName && mine.delivery.vehicle);
  const other = (await api("/orders/me", { token: buyer2.token })).data.orders.find((o) => o.id === order1.id);
  assert.equal(other, undefined, "another buyer cannot see it");
});

test("driver: only the assigned driver can start the trip; it picks up every order on it", async () => {
  const mine = (await T("/trips/me", driver.token)).data.trips;
  assert.equal(mine.length, 1); assert.ok(!JSON.stringify(mine).includes("delivery_code"), "the driver is never shown the code");
  assert.equal((await post(`/trips/${trip.id}/start`, {}, driver2.token)).status, 404);
  assert.equal((await post(`/trips/${trip.id}/start`, { odometerStart: 10 }, driver.token)).status, 400, "the odometer cannot go backwards");
  assert.equal((await post(`/trips/${trip.id}/complete`, {}, driver.token)).status, 409, "cannot finish before starting");
  const s = await post(`/trips/${trip.id}/start`, { odometerStart: 1010 }, driver.token);
  assert.equal(s.status, 200, JSON.stringify(s.data)); assert.equal(s.data.trip.status, "en_route");
  assert.equal((await post(`/trips/${trip.id}/start`, {}, driver.token)).status, 409);
  ship = (await T("/trips/me", driver.token)).data.trips[0].shipments;
  assert.ok(ship.every((x) => x.status === "en_route" && x.picked_up_at));
  assert.equal((await post(`/trips/${trip.id}/cancel`, {})).status, 409, "a started trip cannot be cancelled");
  const mineB = (await api("/orders/me", { token: buyer.token })).data.orders.find((o) => o.id === order1.id);
  assert.equal(mineB.delivery.status, "en_route");
});

test("proof of delivery needs the code, a photo with the recipient's name, and a GPS position", async () => {
  const s1 = ship.find((x) => x.order_id === order1.id);
  const code = await codeOf(order1.id);
  const ok = { code, recipientName: "Aisha Bello", ...GPS };
  assert.equal((await deliver(s1.id, ok, driver.token, false)).status, 400, "no photo");
  assert.equal((await deliver(s1.id, { ...ok, recipientName: "" }, driver.token)).status, 400, "no recipient name");
  assert.equal((await deliver(s1.id, { ...ok, code: "12" }, driver.token)).status, 400, "code is six digits");
  assert.equal((await deliver(s1.id, { code, recipientName: "Aisha Bello" }, driver.token)).data.code, "GPS_REQUIRED");
  assert.equal((await deliver(s1.id, { ...ok, lat: 123 }, driver.token)).status, 400, "an impossible position");
  assert.equal((await deliver(s1.id, ok, driver2.token)).status, 404, "another driver cannot deliver it");
  assert.equal((await deliver(s1.id, ok, buyer.token)).status, 403);
  const txt = new FormData(); for (const [k, v] of Object.entries(ok)) txt.append(k, String(v)); txt.append("photo", new Blob(["not a picture"], { type: "image/png" }), "x.png");
  assert.notEqual((await api(`/transport/shipments/${s1.id}/deliver`, { method: "POST", token: driver.token, body: txt })).status, 200, "a fake photo is refused");
  const wrong = await deliver(s1.id, { ...ok, code: code === "111111" ? "222222" : "111111" }, driver.token);
  assert.equal(wrong.status, 400); assert.equal(wrong.data.code, "WRONG_CODE"); assert.equal(wrong.data.details.triesLeft, 4);
  assert.equal((await db.query("SELECT status FROM shipments WHERE id = $1", [s1.id])).rows[0].status, "en_route", "still not delivered");

  const good = await deliver(s1.id, ok, driver.token);
  assert.equal(good.status, 200, JSON.stringify(good.data));
  const row = (await db.query("SELECT * FROM shipments WHERE id = $1", [s1.id])).rows[0];
  assert.equal(row.status, "delivered"); assert.equal(row.recipient_name, "Aisha Bello");
  assert.ok(row.delivery_photo_id && row.delivered_at); assert.equal(Number(row.delivery_lat), GPS.lat);
  assert.equal((await db.query("SELECT status FROM orders WHERE id = $1", [order1.id])).rows[0].status, "delivered");
  assert.equal((await deliver(s1.id, ok, driver.token)).status, 409, "it cannot be delivered twice");
  assert.ok(await waitForMessage("template = 'delivery_completed' AND to_address = $1", [buyer.email]), "the buyer is told");
  // buyer sees delivered, no code any more, and may open the photo; another buyer may not
  const mine = (await api("/orders/me", { token: buyer.token })).data.orders.find((o) => o.id === order1.id);
  assert.equal(mine.delivery.status, "delivered"); assert.equal(mine.delivery.code, null); assert.equal(mine.delivery.recipientName, "Aisha Bello");
  assert.equal((await api(`/files/${mine.delivery.photoFileId}/link`, { token: buyer.token })).status, 200);
  assert.equal((await api(`/files/${mine.delivery.photoFileId}/link`, { token: buyer2.token })).status, 403);
  assert.equal((await api(`/files/${mine.delivery.photoFileId}/link`, { token: main })).status, 200);
});

test("five wrong codes lock the delivery and tell the office; the office can record it with a written reason", async () => {
  const s2 = ship.find((x) => x.order_id === order2.id);
  const code = await codeOf(order2.id); const bad = code === "123456" ? "654321" : "123456";
  let last;
  for (let i = 1; i <= 5; i++) last = await deliver(s2.id, { code: bad, recipientName: "Someone", ...GPS }, driver.token);
  assert.equal(last.status, 423); assert.equal(last.data.code, "CODE_LOCKED");
  assert.ok(await waitForMessage("template = 'delivery_code_locked'", []), "the office is told");
  const again = await deliver(s2.id, { code, recipientName: "Someone", ...GPS }, driver.token);
  assert.equal(again.status, 423, "even the right code does not work once it is locked");
  assert.equal((await post(`/shipments/${s2.id}/override-delivery`, { recipientName: "Musa", reason: "short" })).status, 400);
  assert.equal((await post(`/shipments/${s2.id}/override-delivery`, { recipientName: "", reason: "Recipient lost the code, buyer confirmed by phone" })).status, 400);
  assert.equal((await post(`/shipments/${s2.id}/override-delivery`, { recipientName: "Musa", reason: "Recipient lost the code, buyer confirmed by phone" }, driver.token)).status, 403);
  const o = await post(`/shipments/${s2.id}/override-delivery`, { recipientName: "Musa Bello", reason: "Recipient lost the code, buyer confirmed by phone" });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  const row = (await db.query("SELECT status, override_reason, override_by FROM shipments WHERE id = $1", [s2.id])).rows[0];
  assert.equal(row.status, "delivered"); assert.ok(row.override_reason && row.override_by);
  assert.equal((await post(`/shipments/${s2.id}/override-delivery`, { recipientName: "Musa Bello", reason: "Recipient lost the code, buyer confirmed by phone" })).status, 409);
});

test("finishing a trip: the vehicle is free again and its odometer moves on", async () => {
  assert.equal((await post(`/trips/${trip.id}/complete`, { odometerEnd: 900 }, driver.token)).status, 400, "end reading below the start reading");
  const r = await post(`/trips/${trip.id}/complete`, { odometerEnd: 1090 }, driver.token);
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.trip.status, "completed");
  const v = (await db.query("SELECT status, odometer_km FROM vehicles WHERE id = $1", [veh.id])).rows[0];
  assert.equal(v.status, "available"); assert.equal(Number(v.odometer_km), 1090);
  assert.equal((await post(`/trips/${trip.id}/complete`, {}, driver.token)).status, 409);
});

test("a delivery with no GPS position needs a reason and the office is told", async () => {
  const o = await readyOrder(buyer);
  const t = (await post("/trips", { vehicleId: veh.id, driverId: driver.id, orderIds: [o.id] })).data.trip;
  assert.equal((await post(`/trips/${t.id}/start`, {}, driver.token)).status, 200);
  const sh = (await T("/trips/me", driver.token)).data.trips.find((x) => x.id === t.id).shipments[0];
  const code = await codeOf(o.id);
  assert.equal((await deliver(sh.id, { code, recipientName: "Kabiru", gpsMissingReason: "no" }, driver.token)).status, 400);
  const r = await deliver(sh.id, { code, recipientName: "Kabiru", gpsMissingReason: "Phone location is switched off in the village" }, driver.token);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(await waitForMessage("template = 'delivery_without_gps'", []));
  assert.equal((await post(`/trips/${t.id}/complete`, {}, driver.token)).status, 200);
});

test("a planned trip can be cancelled: its orders go back to the dispatch queue", async () => {
  const o = await readyOrder(buyer);
  const t = (await post("/trips", { vehicleId: veh.id, driverId: driver.id, orderIds: [o.id] })).data.trip;
  assert.equal((await post(`/trips/${t.id}/cancel`, {})).status, 200);
  assert.equal((await db.query("SELECT status FROM orders WHERE id = $1", [o.id])).rows[0].status, "allocated");
  assert.equal((await db.query("SELECT status FROM vehicles WHERE id = $1", [veh.id])).rows[0].status, "available");
  assert.ok((await T("/queue")).data.orders.find((x) => x.id === o.id));
  assert.equal((await post(`/trips/${t.id}/cancel`, {})).status, 409);
});

let broken, brokenOrders;
test("a breakdown opens an urgent maintenance request, takes the vehicle out of service and tells the office", async () => {
  brokenOrders = [await readyOrder(buyer), await readyOrder(buyer2)];
  broken = (await post("/trips", { vehicleId: veh.id, driverId: driver.id, orderIds: brokenOrders.map((o) => o.id) })).data.trip;
  assert.equal((await post(`/trips/${broken.id}/breakdown`, { description: "Engine overheating" }, driver.token)).status, 409, "not started yet");
  assert.equal((await post(`/trips/${broken.id}/start`, {}, driver.token)).status, 200);
  assert.equal((await post(`/trips/${broken.id}/breakdown`, { description: "x" }, driver.token)).status, 400);
  assert.equal((await post(`/trips/${broken.id}/breakdown`, { description: "Engine overheating" }, driver2.token)).status, 404);
  const sh = (await T("/trips/me", driver.token)).data.trips.find((x) => x.id === broken.id).shipments;
  assert.equal((await deliver(sh.find((s) => s.order_id === brokenOrders[0].id).id, { code: await codeOf(brokenOrders[0].id), recipientName: "First Buyer", ...GPS }, driver.token)).status, 200, "one order is delivered before the breakdown");
  const r = await post(`/trips/${broken.id}/breakdown`, { description: "Engine overheating, steam from the bonnet", lat: 10.31, lng: 9.84 }, driver.token);
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.undelivered, 1);
  const mr = r.data.maintenanceRequest;
  assert.equal(mr.priority, "urgent"); assert.equal(mr.status, "approved"); assert.equal(mr.source, "breakdown"); assert.equal(mr.asset_id, veh.asset_id);
  assert.equal((await db.query("SELECT status FROM vehicles WHERE id = $1", [veh.id])).rows[0].status, "in_maintenance");
  assert.equal((await db.query("SELECT status FROM maintenance_assets WHERE id = $1", [veh.asset_id])).rows[0].status, "in_repair");
  assert.equal((await T(`/trips?status=broken_down`)).data.trips.find((t) => t.id === broken.id).status, "broken_down");
  const reqs = (await M("/requests")).data.requests;
  assert.ok(reqs.find((x) => x.id === mr.id), "Maintenance sees the request");
  assert.ok(await waitForMessage("template = 'vehicle_breakdown'", []), "the office is told");
  assert.equal((await post(`/trips/${broken.id}/breakdown`, { description: "Again, still broken" }, driver.token)).status, 409);
  const o = await post("/trips", { vehicleId: veh.id, driverId: driver3.id, orderIds: [] });
  assert.equal(o.status, 400);
  assert.equal((await post("/trips", { vehicleId: veh.id, driverId: driver3.id, orderIds: [brokenOrders[1].id] })).status, 409 , "the broken vehicle cannot be booked");
});

test("rescue: another vehicle and driver take over the undelivered orders; once repaired, the vehicle is available again", async () => {
  assert.equal((await post(`/trips/${broken.id}/rescue`, { vehicleId: veh.id, driverId: driver3.id })).status, 409, "the broken vehicle itself cannot rescue");
  assert.equal((await post(`/trips/${broken.id}/rescue`, { driverId: driver3.id })).status, 400);
  assert.equal((await post(`/trips/${trip.id}/rescue`, { vehicleId: veh2.id, driverId: driver3.id })).status, 409, "a trip that did not break down");
  const r = await post(`/trips/${broken.id}/rescue`, { vehicleId: veh2.id, driverId: driver3.id });
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.movedShipments, 1);
  const moved = (await db.query("SELECT status, driver_id, trip_id FROM shipments WHERE order_id = $1", [brokenOrders[1].id])).rows[0];
  assert.equal(moved.status, "assigned"); assert.equal(moved.driver_id, driver3.id); assert.equal(moved.trip_id, r.data.trip.id);
  assert.equal((await db.query("SELECT status FROM trips WHERE id = $1", [broken.id])).rows[0].status, "completed");
  assert.equal((await post(`/trips/${broken.id}/rescue`, { vehicleId: veh2.id, driverId: driver3.id })).status, 409, "already rescued");
  // the rescue driver finishes the delivery with the SAME code the buyer was sent
  assert.equal((await post(`/trips/${r.data.trip.id}/start`, {}, driver3.token)).status, 200);
  const sh = (await T("/trips/me", driver3.token)).data.trips[0].shipments[0];
  assert.equal((await deliver(sh.id, { code: await codeOf(brokenOrders[1].id), recipientName: "Second Buyer", ...GPS }, driver3.token)).status, 200);
  assert.equal((await post(`/trips/${r.data.trip.id}/complete`, {}, driver3.token)).status, 200);
  // Maintenance repairs the vehicle
  const mrId = (await db.query("SELECT maintenance_request_id FROM trip_breakdowns WHERE trip_id = $1", [broken.id])).rows[0].maintenance_request_id;
  const wo = await M(`/requests/${mrId}/convert`, main, { method: "POST", body: {} });
  assert.equal(wo.status, 201, JSON.stringify(wo.data));
  const done = await M(`/work-orders/${wo.data.workOrder.id}/complete`, main, { method: "POST", body: { workPerformed: "Replaced the water pump" } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal((await db.query("SELECT status FROM vehicles WHERE id = $1", [veh.id])).rows[0].status, "available", "the repaired vehicle is back in service");
  assert.ok((await db.query("SELECT resolved_at FROM trip_breakdowns WHERE trip_id = $1", [broken.id])).rows[0].resolved_at, "the breakdown is marked resolved");
});

const cost = (body, token = main) => post("/costs", { expenseDate: `${YEAR}-06-15`, ...body }, token);
const setBudget = (department, amount) => api(`/purchasing/budgets/${department}`, { method: "PUT", token: finance.token, body: { year: YEAR, amount } });
const held = (dept) => db.query("SELECT count(*)::int AS n FROM messages WHERE template = 'cost_budget_hold'").then((r) => r.rows[0].n);

test("transport costs: checked, fuel carries litres, and a cost that overruns the Transport budget waits for Finance", async () => {
  for (const [body, status] of [[{}, 400], [{ vehicleId: veh.id, kind: "fuel", amount: -5 }, 400], [{ vehicleId: veh.id, kind: "fuel", amount: "abc" }, 400], [{ vehicleId: veh.id, kind: "wine", amount: 10 }, 400],
    [{ vehicleId: veh.id, kind: "toll", amount: 500, litres: 4 }, 400], [{ vehicleId: veh.id, kind: "fuel", amount: 500, expenseDate: "2999-01-01" }, 400], [{ vehicleId: veh.id, kind: "fuel", amount: 500, expenseDate: "yesterday" }, 400],
    [{ vehicleId: "00000000-0000-4000-8000-000000000000", kind: "fuel", amount: 500 }, 404], [{ vehicleId: veh.id, tripId: "00000000-0000-4000-8000-000000000000", kind: "fuel", amount: 500 }, 404],
    [{ vehicleId: veh2.id, tripId: trip.id, kind: "fuel", amount: 500 }, 400]]) {
    assert.equal((await cost(body)).status, status, JSON.stringify(body));
  }
  assert.equal((await setBudget("Transport", 100000)).status, 200);
  const a = await cost({ vehicleId: veh.id, tripId: trip.id, kind: "fuel", amount: 60000, litres: 120, odometerKm: 1100, vendor: "NNPC Bauchi" });
  assert.equal(a.status, 201, JSON.stringify(a.data)); assert.equal(a.data.cost.budget_status, "counted"); assert.equal(a.data.waitingForFinance, false);
  const b = await cost({ vehicleId: veh.id, kind: "allowance", amount: 50000, note: "Driver allowance for the Jos run" });
  assert.equal(b.status, 201); assert.equal(b.data.cost.budget_status, "held"); assert.equal(b.data.waitingForFinance, true);
  assert.ok((await T("/costs")).data.budget, "the cost list shows the budget");
  const bud = (await api(`/purchasing/budgets?year=${YEAR}`, { token: main })).data.budgets.find((x) => x.department === "Transport");
  assert.equal(bud.committed, 60000, "the held cost does not count yet");
  assert.ok(await waitForMessage("template = 'cost_budget_hold' AND to_address = $1", [finance.email]), "Finance is told");
  assert.equal(Number((await db.query("SELECT odometer_km FROM vehicles WHERE id = $1", [veh.id])).rows[0].odometer_km) >= 1100, true);
  globalThis.__heldTransport = b.data.cost;
});

test("Finance decides a held cost: only the Finance head (or main admin), with a written reason, once", async () => {
  const c = globalThis.__heldTransport;
  const dec = (body, token) => post(`/costs/${c.id}/budget-decision`, body, token);
  assert.equal((await dec({ decision: "approve", note: "okay then" }, plainAdmin.token)).status, 403, "another department head cannot");
  assert.equal((await dec({ decision: "approve", note: "okay then" }, driver.token)).status, 403);
  assert.equal((await dec({ decision: "maybe", note: "okay then" }, finance.token)).status, 400);
  assert.equal((await dec({ decision: "approve", note: "" }, finance.token)).status, 400, "a reason is required");
  assert.equal((await post("/costs/not-an-id/budget-decision", { decision: "approve", note: "okay then" }, finance.token)).status, 404);
  const ok = await dec({ decision: "approve", note: "Jos run was urgent" }, finance.token);
  assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.cost.budget_status, "counted");
  assert.equal((await dec({ decision: "approve", note: "again please" }, finance.token)).status, 409, "decided only once");
  const bud = (await api(`/purchasing/budgets?year=${YEAR}`, { token: main })).data.budgets.find((x) => x.department === "Transport");
  assert.equal(bud.committed, 110000, "an approved cost now counts");
  // a rejected cost never counts
  const again = await cost({ vehicleId: veh.id, kind: "toll", amount: 7000 });
  assert.equal(again.data.cost.budget_status, "held", "the budget is already used up");
  const rej = await post(`/costs/${again.data.cost.id}/budget-decision`, { decision: "reject", note: "Not a company toll" }, main);
  assert.equal(rej.data.cost.budget_status, "rejected");
  assert.equal((await api(`/purchasing/budgets?year=${YEAR}`, { token: main })).data.budgets.find((x) => x.department === "Transport").committed, 110000);
});

test("a driver records fuel and tolls on their own trip only; a department with no budget has no limit", async () => {
  const o = await readyOrder(buyer);
  const t = (await post("/trips", { vehicleId: veh.id, driverId: driver.id, orderIds: [o.id] })).data.trip;
  const mine = (body, token = driver.token) => post("/costs/me", { expenseDate: `${YEAR}-07-01`, ...body }, token);
  assert.equal((await mine({ kind: "fuel", amount: 1000 })).status, 400, "the trip must be named");
  assert.equal((await mine({ tripId: t.id, kind: "fuel", amount: 1000 }, driver2.token)).status, 404, "not their trip");
  assert.equal((await mine({ tripId: t.id, kind: "fuel", amount: 1000 }, main)).status, 403);
  await db.query("DELETE FROM department_budgets WHERE department = 'Transport' AND year = $1", [YEAR]);
  const r = await mine({ tripId: t.id, kind: "fuel", amount: 5000000, litres: 50 });
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.cost.budget_status, "counted", "no budget set means no limit");
  assert.equal((await post(`/trips/${t.id}/cancel`, {})).status, 200);
  assert.equal((await mine({ tripId: t.id, kind: "fuel", amount: 1000 })).status, 409, "a cancelled trip takes no more costs");
});

test("Maintenance costs follow the same budget rule; parts bought into stock are a cost, parts from a purchase order are not", async () => {
  assert.equal((await setBudget("Maintenance", 50000)).status, 200);
  const mc = (body, token = main) => M("/expenses", token, { method: "POST", body: { expenseDate: `${YEAR}-05-05`, ...body } });
  for (const [body, status] of [[{}, 400], [{ category: "labor", amount: -3 }, 400], [{ category: "fuel", amount: 10 }, 400], [{ category: "labor", amount: 10, expenseDate: "2999-01-01" }, 400]]) {
    assert.equal((await mc(body)).status, status, JSON.stringify(body));
  }
  const a = await mc({ category: "contractor", amount: 30000, vendor: "Auto Hub" });
  assert.equal(a.data.expense.budget_status, "counted");
  const b = await mc({ category: "other", amount: 40000 });
  assert.equal(b.data.expense.budget_status, "held"); assert.equal(b.data.waitingForFinance, true);
  const list = (await M("/expenses")).data;
  assert.equal(list.expenses[0].budget_status, "held", "held costs are listed first"); assert.ok(list.budget);
  assert.equal((await M(`/expenses/${b.data.expense.id}/budget-decision`, plainAdmin.token, { method: "POST", body: { decision: "approve", note: "fine by me" } })).status, 403);
  assert.equal((await M(`/expenses/${b.data.expense.id}/budget-decision`, finance.token, { method: "POST", body: { decision: "approve", note: "Needed for the generator" } })).data.expense.budget_status, "counted");
  // parts
  const part = (await M("/parts", main, { method: "POST", body: { name: `Filter ${uniq()}`, unitCost: 2000, quantityOnHand: 0 } })).data.part;
  const adj = (body) => M(`/parts/${part.id}/adjust`, main, { method: "POST", body });
  const p1 = await adj({ direction: "in", quantity: 3, reason: "purchase", unitCost: 1500 });
  assert.equal(p1.status, 200, JSON.stringify(p1.data)); assert.equal(Number(p1.data.expense.amount), 4500); assert.equal(p1.data.expense.category, "parts");
  const p2 = await adj({ direction: "in", quantity: 2, reason: "purchase", fromPurchaseOrder: true });
  assert.equal(p2.data.expense, null, "already counted through the purchase order");
  const p3 = await adj({ direction: "in", quantity: 1, reason: "adjustment" });
  assert.equal(p3.data.expense, null, "a stock correction is not a cost");
  const free = (await M("/parts", main, { method: "POST", body: { name: `Free ${uniq()}` } })).data.part;
  assert.equal((await M(`/parts/${free.id}/adjust`, main, { method: "POST", body: { direction: "in", quantity: 1, reason: "purchase" } })).status, 400, "a purchase needs a price");
  assert.equal((await adj({ direction: "in", quantity: 1, reason: "purchase", unitCost: -1 })).status, 400);
  const lab = await M("/parts", main, { method: "GET" });
  assert.equal(Number(lab.data.parts.find((x) => x.id === part.id).quantity_on_hand), 6);
});

test("the fleet report adds up trips, kilometres and costs per vehicle", async () => {
  assert.equal((await T("/reports/fleet?year=1800")).status, 400);
  const now = (await T("/reports/fleet")).data;
  const v = now.vehicles.find((x) => x.id === veh.id);
  assert.ok(v.trips >= 2 && v.km >= 80, JSON.stringify(v));
  const old = (await T(`/reports/fleet?year=${YEAR}`)).data.vehicles.find((x) => x.id === veh.id);
  assert.equal(old.cost_total, 5110000, "only counted costs are added up (the rejected toll is left out)");
  assert.equal(old.fuel_litres, 170); assert.equal(old.fuel_cost, 5060000);
  const dash = (await T("/dashboard")).data;
  assert.ok(dash.deliveredTotal >= 4 && typeof dash.vehiclesAvailable === "number" && typeof dash.costsWaitingForFinance === "number");
});
