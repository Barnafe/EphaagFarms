// Transport Department (Phase 12): fleet (vehicles, drivers, trips, costs), delivery tracking and proof of delivery,
// breakdowns that open a maintenance request, and the budget rule for Transport costs.
import crypto from "node:crypto";
import { pool, detached } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { notifyUser, notifyAddress, notifyAdmins } from "../services/messaging.js";
import { registerAccessRule, deleteFile } from "../services/storage.js";
import { budgetStatus, budgetStatusForCost, announceHeldCost, checkBudgetAlerts } from "../services/budgets.js";
import { decideHeldCost } from "../services/costDecisions.js";
import "../services/transportMessages.js";

const fail = (status, message, clientCode, details) => Object.assign(new Error(message), { status, clientCode, details });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v) => typeof v === "string" && UUID.test(v);
const VEHICLE_TYPES = ["truck", "van", "pickup", "tricycle", "motorbike", "other"];
const COST_KINDS = ["fuel", "toll", "allowance", "other"];
const MAX_CODE_TRIES = 5;
const today = () => new Date().toISOString().slice(0, 10);

function money(v, what = "amount") {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw fail(400, `${what} must be a positive number`);
  return Math.round(n * 100) / 100;
}
function optNumber(v, what, { min = 0, max = 1e9 } = {}) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw fail(400, `${what} is not a valid number`);
  return n;
}
function dateOrToday(v) {
  if (v === undefined || v === null || v === "") return today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(v))) throw fail(400, "Date must look like 2026-11-02");
  if (String(v) > today()) throw fail(400, "The date cannot be in the future");
  return String(v);
}

// A buyer may open the delivery photo of their own order (the driver who took it and admins already can).
registerAccessRule("delivery_photo", async (user, row) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.delivery_photo_id = $1 AND o.buyer_id = $2`,
    [row.id, user.id]);
  return rows.length > 0;
});

async function withItems(orders) {
  if (orders.length === 0) return [];
  const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])", [orders.map((o) => o.id)]);
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

const READY_SQL = `FROM orders o JOIN distributor_allocations a ON a.order_id = o.id
  WHERE o.status = 'allocated' AND a.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)`;

// ---- Dashboard ---------------------------------------------------------------
export async function dashboardSummary(req, res) {
  const ready = await pool.query(`SELECT COUNT(*)::int AS n ${READY_SQL}`);
  const ships = await pool.query(`SELECT status, COUNT(*)::int AS n FROM shipments GROUP BY status`);
  const drivers = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role_type = 'transporter'`);
  const veh = await pool.query(`SELECT status, COUNT(*)::int AS n FROM vehicles GROUP BY status`);
  const trips = await pool.query(`SELECT status, COUNT(*)::int AS n FROM trips GROUP BY status`);
  const held = await pool.query(`SELECT COUNT(*)::int AS n FROM vehicle_expenses WHERE budget_status = 'held'`);
  const c = (rows, s) => rows.find((r) => r.status === s)?.n || 0;
  res.json({
    readyToDispatch: ready.rows[0].n,
    enRoute: c(ships.rows, "en_route"),
    deliveredTotal: c(ships.rows, "delivered"),
    registeredDrivers: drivers.rows[0].n,
    vehiclesAvailable: c(veh.rows, "available"),
    vehiclesInMaintenance: c(veh.rows, "in_maintenance"),
    activeTrips: c(trips.rows, "planned") + c(trips.rows, "en_route"),
    brokenDownTrips: c(trips.rows, "broken_down"),
    costsWaitingForFinance: held.rows[0].n,
  });
}

// ---- Orders ready to dispatch -------------------------------------------------
export async function dispatchQueue(req, res) {
  const { rows } = await pool.query(`SELECT o.* ${READY_SQL} ORDER BY o.created_at ASC`);
  res.json({ orders: await withItems(rows) });
}

// ---- Vehicles --------------------------------------------------------------------
export async function listVehicles(req, res) {
  const { rows } = await pool.query(`SELECT * FROM vehicles ORDER BY (status = 'retired'), plate_number ASC`);
  res.json({ vehicles: rows });
}

export async function createVehicle(req, res) {
  const b = req.body || {};
  const plate = String(b.plateNumber || "").trim().toUpperCase();
  if (plate.length < 3 || plate.length > 20) throw fail(400, "Enter the plate number (3 to 20 characters)");
  const type = b.vehicleType || "truck";
  if (!VEHICLE_TYPES.includes(type)) throw fail(400, `vehicleType must be one of ${VEHICLE_TYPES.join(", ")}`);
  const capacity = optNumber(b.capacityKg, "capacityKg", { min: 1, max: 1e6 });
  const odometer = optNumber(b.odometerKm, "odometerKm") ?? 0;
  const name = String(b.name || "").trim() || plate;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query("SELECT 1 FROM vehicles WHERE upper(plate_number) = $1", [plate]);
    if (dup.rows[0]) throw fail(409, "A vehicle with this plate number already exists");
    // The Maintenance side of the vehicle: it appears in Maintenance as an asset so faults and servicing are tracked.
    const asset = await client.query(
      `INSERT INTO maintenance_assets (name, asset_type, department, notes) VALUES ($1, 'Vehicle', 'Transport', $2) RETURNING id`,
      [`${name} (${plate})`, b.notes || null]);
    const { rows } = await client.query(
      `INSERT INTO vehicles (plate_number, name, vehicle_type, capacity_kg, odometer_km, asset_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [plate, name, type, capacity, odometer, asset.rows[0].id, b.notes || null]);
    await client.query("COMMIT");
    res.status(201).json({ vehicle: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateVehicle(req, res) {
  const { id } = req.params;
  if (!isId(id)) throw fail(404, "Vehicle not found");
  const b = req.body || {};
  const sets = []; const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.name !== undefined) add("name", String(b.name).trim() || null);
  if (b.vehicleType !== undefined) { if (!VEHICLE_TYPES.includes(b.vehicleType)) throw fail(400, "Unknown vehicle type"); add("vehicle_type", b.vehicleType); }
  if (b.capacityKg !== undefined) add("capacity_kg", optNumber(b.capacityKg, "capacityKg", { min: 1, max: 1e6 }));
  if (b.notes !== undefined) add("notes", b.notes || null);
  if (b.odometerKm !== undefined) add("odometer_km", optNumber(b.odometerKm, "odometerKm"));
  if (b.status !== undefined) {
    if (!["available", "retired"].includes(b.status)) throw fail(400, "You can set a vehicle to available or retired. Other states follow its trips and repairs.");
    const cur = await pool.query("SELECT status FROM vehicles WHERE id = $1", [id]);
    if (!cur.rows[0]) throw fail(404, "Vehicle not found");
    if (["on_trip", "in_maintenance"].includes(cur.rows[0].status)) throw fail(409, `This vehicle is ${cur.rows[0].status.replace("_", " ")}; finish that first`);
    add("status", b.status);
  }
  if (sets.length === 0) throw fail(400, "Nothing to change");
  vals.push(id);
  const { rows } = await pool.query(`UPDATE vehicles SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
  if (!rows[0]) throw fail(404, "Vehicle not found");
  res.json({ vehicle: rows[0] });
}

// ---- Drivers -----------------------------------------------------------------------
export async function driverDirectory(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.phone, u.state, u.lga, dp.licence_number, dp.licence_expiry,
            EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = u.id AND t.status IN ('planned','en_route')) AS on_trip
       FROM users u LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.role_type = 'transporter' ORDER BY u.name ASC`);
  res.json({ drivers: rows });
}

export async function saveDriverProfile(req, res) {
  const { id } = req.params;
  if (!isId(id)) throw fail(404, "Driver not found");
  const u = await pool.query("SELECT id FROM users WHERE id = $1 AND role_type = 'transporter'", [id]);
  if (!u.rows[0]) throw fail(404, "Driver not found");
  const b = req.body || {};
  const number = b.licenceNumber ? String(b.licenceNumber).trim().slice(0, 40) : null;
  let expiry = null;
  if (b.licenceExpiry) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.licenceExpiry)) || Number.isNaN(Date.parse(b.licenceExpiry))) throw fail(400, "Licence expiry must look like 2027-06-30");
    expiry = String(b.licenceExpiry);
  }
  const { rows } = await pool.query(
    `INSERT INTO driver_profiles (user_id, licence_number, licence_expiry, notes) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET licence_number = $2, licence_expiry = $3, notes = $4, updated_at = now() RETURNING *`,
    [id, number, expiry, b.notes || null]);
  res.json({ profile: rows[0] });
}

// ---- Trips ---------------------------------------------------------------------------
const newCode = () => String(crypto.randomInt(100000, 1000000));

async function tripsWithShipments(where, params, { forDriver = false } = {}) {
  const { rows: trips } = await pool.query(
    `SELECT t.*, v.plate_number, v.name AS vehicle_name, u.name AS driver_name, u.phone AS driver_phone
       FROM trips t JOIN vehicles v ON v.id = t.vehicle_id JOIN users u ON u.id = t.driver_id
      ${where} ORDER BY t.created_at DESC LIMIT 200`, params);
  if (trips.length === 0) return [];
  const { rows: ships } = await pool.query(
    `SELECT s.id, s.reference, s.trip_id, s.order_id, s.status, s.picked_up_at, s.delivered_at, s.recipient_name,
            s.delivery_photo_id, s.delivery_lat, s.delivery_lng, s.gps_missing_reason, s.code_locked, s.code_attempts, s.override_reason,
            o.reference AS order_reference, o.delivery_location, o.contact_phone_1, o.contact_phone_2, b.name AS buyer_name
       FROM shipments s JOIN orders o ON o.id = s.order_id JOIN users b ON b.id = o.buyer_id
      WHERE s.trip_id = ANY($1::uuid[]) ORDER BY o.created_at ASC`, [trips.map((t) => t.id)]);
  const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])", [ships.map((s) => s.order_id)]);
  return trips.map((t) => ({
    ...t,
    shipments: ships.filter((s) => s.trip_id === t.id).map((s) => ({
      ...s, items: items.filter((i) => i.order_id === s.order_id),
    })),
  }));
}

export async function listTrips(req, res) {
  const { status } = req.query;
  if (status && !["planned", "en_route", "completed", "broken_down", "cancelled"].includes(status)) throw fail(400, "Unknown status");
  const trips = status ? await tripsWithShipments("WHERE t.status = $1", [status]) : await tripsWithShipments("", []);
  res.json({ trips });
}

export async function createTrip(req, res) {
  const b = req.body || {};
  const { vehicleId, driverId } = b;
  const orderIds = [...new Set(Array.isArray(b.orderIds) ? b.orderIds : [])];
  if (!isId(vehicleId)) throw fail(400, "Choose a vehicle");
  if (!isId(driverId)) throw fail(400, "Choose a driver");
  if (orderIds.length === 0 || orderIds.length > 25 || !orderIds.every(isId)) throw fail(400, "Choose between 1 and 25 orders for the trip");

  const client = await pool.connect();
  let trip; let shipments; let vehicle; let driver; let orders;
  try {
    await client.query("BEGIN");
    const v = await client.query("SELECT * FROM vehicles WHERE id = $1 FOR UPDATE", [vehicleId]);
    vehicle = v.rows[0];
    if (!vehicle) throw fail(404, "Vehicle not found");
    if (vehicle.status !== "available") throw fail(409, `This vehicle is ${vehicle.status.replace("_", " ")}`, "VEHICLE_UNAVAILABLE");
    const d = await client.query(
      `SELECT u.id, u.name, dp.licence_expiry FROM users u LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.id = $1 AND u.role_type = 'transporter'`, [driverId]);
    driver = d.rows[0];
    if (!driver) throw fail(404, "Driver not found");
    if (driver.licence_expiry && String(driver.licence_expiry.toISOString?.().slice(0, 10) ?? driver.licence_expiry) < today()) {
      throw fail(409, `${driver.name}'s driving licence has expired`, "LICENCE_EXPIRED");
    }
    const busy = await client.query("SELECT 1 FROM trips WHERE driver_id = $1 AND status IN ('planned','en_route')", [driverId]);
    if (busy.rows[0]) throw fail(409, `${driver.name} is already on a trip`, "DRIVER_BUSY");

    const o = await client.query(
      `SELECT o.* ${READY_SQL} AND o.id = ANY($1::uuid[]) FOR UPDATE OF o`, [orderIds]);
    orders = o.rows;
    if (orders.length !== orderIds.length) throw fail(400, "One or more orders are not ready for dispatch (they must be allocated and confirmed by the distributor, with no trip yet)");

    const t = await client.query(
      `INSERT INTO trips (reference, vehicle_id, driver_id, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [generateReference("TRP"), vehicleId, driverId, b.notes || null, req.user.id]);
    trip = t.rows[0];
    shipments = [];
    for (const order of orders) {
      const s = await client.query(
        `INSERT INTO shipments (reference, order_id, driver_id, trip_id, delivery_code) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [generateReference(REF_PREFIX.shipment), order.id, driverId, trip.id, newCode()]);
      shipments.push(s.rows[0]);
      await client.query("UPDATE orders SET status = 'in_transit' WHERE id = $1", [order.id]);
    }
    await client.query("UPDATE vehicles SET status = 'on_trip' WHERE id = $1", [vehicleId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  detached(async () => {
    await notifyUser(driverId, "driver_trip_assigned", { tripReference: trip.reference, plate: vehicle.plate_number, count: shipments.length }, { allChannels: true }).catch(() => {});
    for (const s of shipments) {
      const order = orders.find((x) => x.id === s.order_id);
      await sendCodeToBuyer(order, s, driver.name, vehicle.plate_number).catch(() => {});
    }
  });
  res.status(201).json({ trip, shipments: shipments.map(({ delivery_code, ...rest }) => rest) });
}

async function sendCodeToBuyer(order, shipment, driverName, plate) {
  const data = { orderReference: order.reference, driverName, plate, code: shipment.delivery_code };
  await notifyUser(order.buyer_id, "delivery_dispatched", data, { allChannels: true });
  // The delivery contact on the order (who will receive the goods) also gets the code when it is a different address.
  const buyer = await pool.query("SELECT email, phone FROM users WHERE id = $1", [order.buyer_id]);
  const b = buyer.rows[0] || {};
  const email = order.contact_email && order.contact_email !== b.email ? order.contact_email : null;
  const phone = order.contact_phone_1 && order.contact_phone_1 !== b.phone ? order.contact_phone_1 : null;
  if (email || phone) await notifyAddress({ email, phone, name: "" }, "delivery_dispatched", data, { allChannels: true });
}

export async function cancelTrip(req, res) {
  const { id } = req.params;
  if (!isId(id)) throw fail(404, "Trip not found");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query("SELECT * FROM trips WHERE id = $1 FOR UPDATE", [id]);
    const trip = t.rows[0];
    if (!trip) throw fail(404, "Trip not found");
    if (trip.status !== "planned") throw fail(409, "Only a trip that has not started can be cancelled", "TRIP_STARTED");
    const ships = await client.query("SELECT order_id FROM shipments WHERE trip_id = $1", [id]);
    await client.query("DELETE FROM shipments WHERE trip_id = $1", [id]);
    for (const s of ships.rows) await client.query("UPDATE orders SET status = 'allocated' WHERE id = $1 AND status = 'in_transit'", [s.order_id]);
    await client.query("UPDATE trips SET status = 'cancelled' WHERE id = $1", [id]);
    await client.query("UPDATE vehicles SET status = 'available' WHERE id = $1 AND status = 'on_trip'", [trip.vehicle_id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** After a breakdown: send another vehicle and driver for the orders that were not delivered yet. */
export async function rescueTrip(req, res) {
  const { id } = req.params;
  const { vehicleId, driverId } = req.body || {};
  if (!isId(id)) throw fail(404, "Trip not found");
  if (!isId(vehicleId) || !isId(driverId)) throw fail(400, "Choose a vehicle and a driver for the rescue trip");
  const client = await pool.connect();
  let newTrip; let moved; let vehicle; let driver;
  try {
    await client.query("BEGIN");
    const t = await client.query("SELECT * FROM trips WHERE id = $1 FOR UPDATE", [id]);
    const old = t.rows[0];
    if (!old) throw fail(404, "Trip not found");
    if (old.status !== "broken_down") throw fail(409, "Only a trip that broke down can be rescued", "NOT_BROKEN_DOWN");
    const left = await client.query("SELECT * FROM shipments WHERE trip_id = $1 AND status <> 'delivered' FOR UPDATE", [id]);
    if (left.rows.length === 0) throw fail(409, "Every order on this trip was already delivered");
    const v = await client.query("SELECT * FROM vehicles WHERE id = $1 FOR UPDATE", [vehicleId]);
    vehicle = v.rows[0];
    if (!vehicle) throw fail(404, "Vehicle not found");
    if (vehicle.status !== "available") throw fail(409, `This vehicle is ${vehicle.status.replace("_", " ")}`, "VEHICLE_UNAVAILABLE");
    const d = await client.query(
      `SELECT u.id, u.name, dp.licence_expiry FROM users u LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.id = $1 AND u.role_type = 'transporter'`, [driverId]);
    driver = d.rows[0];
    if (!driver) throw fail(404, "Driver not found");
    if (driver.licence_expiry && String(driver.licence_expiry.toISOString?.().slice(0, 10) ?? driver.licence_expiry) < today()) throw fail(409, `${driver.name}'s driving licence has expired`, "LICENCE_EXPIRED");
    const busy = await client.query("SELECT 1 FROM trips WHERE driver_id = $1 AND status IN ('planned','en_route')", [driverId]);
    if (busy.rows[0]) throw fail(409, `${driver.name} is already on a trip`, "DRIVER_BUSY");

    const nt = await client.query(
      `INSERT INTO trips (reference, vehicle_id, driver_id, replaces_trip_id, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [generateReference("TRP"), vehicleId, driverId, id, `Rescue of ${old.reference}`, req.user.id]);
    newTrip = nt.rows[0];
    const mv = await client.query(
      `UPDATE shipments SET trip_id = $1, driver_id = $2, status = 'assigned', picked_up_at = NULL WHERE trip_id = $3 AND status <> 'delivered' RETURNING *`,
      [newTrip.id, driverId, id]);
    moved = mv.rows;
    await client.query("UPDATE vehicles SET status = 'on_trip' WHERE id = $1", [vehicleId]);
    // The broken trip is finished with: whatever was delivered stays on it.
    await client.query("UPDATE trips SET status = 'completed', completed_at = now(), notes = COALESCE(notes || E'\\n', '') || $2 WHERE id = $1",
      [id, `Rescued by ${newTrip.reference}`]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  detached(async () => {
    await notifyUser(driverId, "driver_trip_assigned", { tripReference: newTrip.reference, plate: vehicle.plate_number, count: moved.length }, { allChannels: true }).catch(() => {});
  });
  res.status(201).json({ trip: newTrip, movedShipments: moved.length });
}

// ---- Driver: trips ----------------------------------------------------------------------
export async function myTrips(req, res) {
  const trips = await tripsWithShipments("WHERE t.driver_id = $1", [req.user.id], { forDriver: true });
  res.json({ trips });
}

export async function startTrip(req, res) {
  const { id } = req.params;
  if (!isId(id)) throw fail(404, "Trip not found");
  const odometer = optNumber(req.body?.odometerStart, "odometerStart");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query("SELECT * FROM trips WHERE id = $1 AND driver_id = $2 FOR UPDATE", [id, req.user.id]);
    const trip = t.rows[0];
    if (!trip) throw fail(404, "Trip not found");
    if (trip.status !== "planned") throw fail(409, "This trip has already started or is finished", "TRIP_STATE");
    const veh = await client.query("SELECT odometer_km FROM vehicles WHERE id = $1", [trip.vehicle_id]);
    const start = odometer ?? Number(veh.rows[0].odometer_km);
    if (odometer !== null && odometer < Number(veh.rows[0].odometer_km)) throw fail(400, `The odometer cannot be lower than the last reading (${veh.rows[0].odometer_km} km)`);
    const { rows } = await client.query(`UPDATE trips SET status = 'en_route', started_at = now(), odometer_start = $2 WHERE id = $1 RETURNING *`, [id, start]);
    await client.query(`UPDATE shipments SET status = 'en_route', picked_up_at = now() WHERE trip_id = $1 AND status = 'assigned'`, [id]);
    await client.query("COMMIT");
    res.json({ trip: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function completeTrip(req, res) {
  const { id } = req.params;
  if (!isId(id)) throw fail(404, "Trip not found");
  const odometer = optNumber(req.body?.odometerEnd, "odometerEnd");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query("SELECT * FROM trips WHERE id = $1 AND driver_id = $2 FOR UPDATE", [id, req.user.id]);
    const trip = t.rows[0];
    if (!trip) throw fail(404, "Trip not found");
    if (trip.status !== "en_route") throw fail(409, "Only a trip that is under way can be finished", "TRIP_STATE");
    const left = await client.query("SELECT COUNT(*)::int AS n FROM shipments WHERE trip_id = $1 AND status <> 'delivered'", [id]);
    if (left.rows[0].n > 0) throw fail(409, `${left.rows[0].n} order(s) are not delivered yet`, "NOT_ALL_DELIVERED");
    if (odometer !== null && trip.odometer_start !== null && odometer < Number(trip.odometer_start)) throw fail(400, "The end reading cannot be lower than the start reading");
    const { rows } = await client.query(`UPDATE trips SET status = 'completed', completed_at = now(), odometer_end = $2 WHERE id = $1 RETURNING *`, [id, odometer]);
    await client.query(
      `UPDATE vehicles SET status = 'available', odometer_km = GREATEST(odometer_km, COALESCE($2, odometer_km)) WHERE id = $1 AND status = 'on_trip'`,
      [trip.vehicle_id, odometer]);
    await client.query("COMMIT");
    res.json({ trip: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---- Delivery with proof ------------------------------------------------------------------
export async function markDelivered(req, res) {
  const { id } = req.params;
  const b = req.body || {};
  const discard = async () => { if (req.file?.filename) await deleteFile(req.file.filename).catch(() => {}); };
  try {
    if (!isId(id)) throw fail(404, "Shipment not found");
    const recipient = String(b.recipientName || "").trim();
    if (recipient.length < 2 || recipient.length > 80) throw fail(400, "Enter the name of the person who received the goods");
    if (!req.file) throw fail(400, "Take a photo of the goods with the recipient as proof of delivery");
    const code = String(b.code || "").trim();
    if (!/^\d{6}$/.test(code)) throw fail(400, "Enter the 6 digit delivery code the recipient was sent");
    const lat = b.lat === undefined || b.lat === "" ? null : Number(b.lat);
    const lng = b.lng === undefined || b.lng === "" ? null : Number(b.lng);
    const hasGps = lat !== null && lng !== null;
    if (hasGps && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw fail(400, "The GPS position is not valid");
    const gpsReason = String(b.gpsMissingReason || "").trim();
    if (!hasGps && gpsReason.length < 5) throw fail(400, "The phone has not given a GPS position. Allow location access, or write why it is not possible", "GPS_REQUIRED");
    const accuracy = optNumber(b.accuracy, "accuracy", { min: 0, max: 1e6 });
  } catch (err) { await discard(); throw err; }

  const lat = b.lat === undefined || b.lat === "" ? null : Number(b.lat);
  const lng = b.lng === undefined || b.lng === "" ? null : Number(b.lng);
  const hasGps = lat !== null && lng !== null;
  const client = await pool.connect();
  let shipment; let order; let locked = false; let wrong = false; let driverName; let released = false;
  try {
    await client.query("BEGIN");
    const s = await client.query(
      `SELECT s.*, t.status AS trip_status FROM shipments s LEFT JOIN trips t ON t.id = s.trip_id WHERE s.id = $1 AND s.driver_id = $2 FOR UPDATE OF s`,
      [id, req.user.id]);
    shipment = s.rows[0];
    if (!shipment) throw fail(404, "Shipment not found");
    if (shipment.status !== "en_route" || shipment.trip_status !== "en_route") throw fail(409, "This shipment is not on a trip that is under way", "NOT_EN_ROUTE");
    if (shipment.code_locked) throw fail(423, "This delivery is locked after too many wrong codes. The Transport office has been told.", "CODE_LOCKED");
    if (shipment.delivery_code !== String(b.code).trim()) {
      const attempts = shipment.code_attempts + 1;
      locked = attempts >= MAX_CODE_TRIES;
      await client.query("UPDATE shipments SET code_attempts = $2, code_locked = $3 WHERE id = $1", [id, attempts, locked]);
      wrong = true;
      shipment.code_attempts = attempts;
    } else {
      await client.query(
        `UPDATE shipments SET status = 'delivered', delivered_at = now(), recipient_name = $2, delivery_photo_id = $3,
                delivery_lat = $4, delivery_lng = $5, gps_accuracy_m = $6, gps_missing_reason = $7,
                proof_of_delivery_url = $3 WHERE id = $1`,
        [id, String(b.recipientName).trim(), req.file.filename, hasGps ? lat : null, hasGps ? lng : null,
          optNumber(b.accuracy, "accuracy", { min: 0, max: 1e6 }), hasGps ? null : String(b.gpsMissingReason).trim()]);
      const o = await client.query("UPDATE orders SET status = 'delivered' WHERE id = $1 RETURNING *", [shipment.order_id]);
      order = o.rows[0];
    }
    const d = await client.query("SELECT name FROM users WHERE id = $1", [req.user.id]);
    driverName = d.rows[0]?.name;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    client.release(); released = true; // hand the connection back before the storage layer asks the pool for its own
    await discard();
    throw err;
  } finally {
    if (!released) client.release();
  }

  if (wrong) {
    await discard();
    if (locked) {
      const o = await pool.query("SELECT reference FROM orders WHERE id = $1", [shipment.order_id]);
      detached(() => notifyAdmins("delivery_code_locked", { orderReference: o.rows[0].reference, shipmentReference: shipment.reference, driverName, attempts: shipment.code_attempts }).catch(() => {}));
      throw fail(423, "Wrong code. This delivery is now locked and the Transport office has been told.", "CODE_LOCKED");
    }
    throw fail(400, `That code is not right. ${MAX_CODE_TRIES - shipment.code_attempts} ${MAX_CODE_TRIES - shipment.code_attempts === 1 ? "try" : "tries"} left.`, "WRONG_CODE", { triesLeft: MAX_CODE_TRIES - shipment.code_attempts });
  }

  detached(async () => {
    await notifyUser(order.buyer_id, "delivery_completed", { orderReference: order.reference, recipientName: String(b.recipientName).trim() }, { allChannels: true }).catch(() => {});
    if (!hasGps) await notifyAdmins("delivery_without_gps", { orderReference: order.reference, driverName, reason: String(b.gpsMissingReason).trim() }).catch(() => {});
  });
  res.json({ ok: true, shipmentId: id, deliveredAt: new Date().toISOString() });
}

/** The Transport office records a delivery when the code cannot be used (locked, or the recipient lost it). A reason is required. */
export async function overrideDelivery(req, res) {
  const { id } = req.params;
  if (!isId(id)) throw fail(404, "Shipment not found");
  const reason = String(req.body?.reason || "").trim();
  const recipient = String(req.body?.recipientName || "").trim();
  if (reason.length < 10) throw fail(400, "Write the reason for recording this delivery without the code (at least 10 characters)");
  if (recipient.length < 2) throw fail(400, "Enter the name of the person who received the goods");
  const client = await pool.connect();
  let order;
  try {
    await client.query("BEGIN");
    const s = await client.query("SELECT * FROM shipments WHERE id = $1 FOR UPDATE", [id]);
    const sh = s.rows[0];
    if (!sh) throw fail(404, "Shipment not found");
    if (sh.status !== "en_route") throw fail(409, "Only a shipment that is under way can be recorded as delivered", "NOT_EN_ROUTE");
    await client.query(
      `UPDATE shipments SET status = 'delivered', delivered_at = now(), recipient_name = $2, override_reason = $3, override_by = $4 WHERE id = $1`,
      [id, recipient, reason, req.user.id]);
    const o = await client.query("UPDATE orders SET status = 'delivered' WHERE id = $1 RETURNING *", [sh.order_id]);
    order = o.rows[0];
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  detached(() => notifyUser(order.buyer_id, "delivery_completed", { orderReference: order.reference, recipientName: recipient }, { allChannels: true }).catch(() => {}));
  res.json({ ok: true });
}

// ---- Breakdown ----------------------------------------------------------------------------
export async function reportBreakdown(req, res) {
  const { id } = req.params;
  if (!isId(id)) throw fail(404, "Trip not found");
  const description = String(req.body?.description || "").trim();
  if (description.length < 5) throw fail(400, "Tell us what happened to the vehicle (at least 5 characters)");
  const lat = req.body?.lat === undefined || req.body?.lat === null || req.body?.lat === "" ? null : Number(req.body.lat);
  const lng = req.body?.lng === undefined || req.body?.lng === null || req.body?.lng === "" ? null : Number(req.body.lng);
  if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) throw fail(400, "The GPS position is not valid");

  const client = await pool.connect();
  let trip; let vehicle; let mreq; let undelivered; let driverName;
  try {
    await client.query("BEGIN");
    const t = await client.query("SELECT * FROM trips WHERE id = $1 AND driver_id = $2 FOR UPDATE", [id, req.user.id]);
    trip = t.rows[0];
    if (!trip) throw fail(404, "Trip not found");
    if (trip.status !== "en_route") throw fail(409, "A breakdown can only be reported on a trip that is under way", "TRIP_STATE");
    const v = await client.query("SELECT * FROM vehicles WHERE id = $1 FOR UPDATE", [trip.vehicle_id]);
    vehicle = v.rows[0];
    const d = await client.query("SELECT name FROM users WHERE id = $1", [req.user.id]);
    driverName = d.rows[0].name;
    // A breakdown is urgent, so the request is created already approved and Maintenance can open a work order at once.
    const m = await client.query(
      `INSERT INTO maintenance_requests (reference, asset_id, title, description, priority, status, reported_by, reporter_name,
                                         reporter_department, review_note, reviewed_at, source, vehicle_id, trip_id)
       VALUES ($1,$2,$3,$4,'urgent','approved',$5,$6,'Transport','Created automatically from a vehicle breakdown on a trip',now(),'breakdown',$7,$8) RETURNING *`,
      [generateReference(REF_PREFIX.maintenanceRequest), vehicle.asset_id, `Breakdown: ${vehicle.plate_number}`, description, req.user.id, driverName, vehicle.id, trip.id]);
    mreq = m.rows[0];
    await client.query(
      `INSERT INTO trip_breakdowns (trip_id, vehicle_id, reported_by, description, lat, lng, maintenance_request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [trip.id, vehicle.id, req.user.id, description, lat, lng, mreq.id]);
    await client.query("UPDATE trips SET status = 'broken_down' WHERE id = $1", [trip.id]);
    await client.query("UPDATE vehicles SET status = 'in_maintenance' WHERE id = $1", [vehicle.id]);
    if (vehicle.asset_id) await client.query("UPDATE maintenance_assets SET status = 'in_repair' WHERE id = $1", [vehicle.asset_id]);
    const left = await client.query("SELECT COUNT(*)::int AS n FROM shipments WHERE trip_id = $1 AND status <> 'delivered'", [trip.id]);
    undelivered = left.rows[0].n;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  detached(() => notifyAdmins("vehicle_breakdown", {
    tripReference: trip.reference, plate: vehicle.plate_number, driverName, description, undelivered, maintenanceReference: mreq.reference,
    mapLink: lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat},${lng}` : "",
  }).catch(() => {}));
  res.status(201).json({ maintenanceRequest: mreq, undelivered });
}

// ---- Costs (fuel, tolls, allowances) ---------------------------------------------------------
export async function listCosts(req, res) {
  const { rows } = await pool.query(
    `SELECT e.*, v.plate_number, t.reference AS trip_reference, u.name AS recorded_by_name
       FROM vehicle_expenses e JOIN vehicles v ON v.id = e.vehicle_id LEFT JOIN trips t ON t.id = e.trip_id LEFT JOIN users u ON u.id = e.recorded_by
      ORDER BY (e.budget_status = 'held') DESC, e.expense_date DESC, e.created_at DESC LIMIT 300`);
  res.json({ costs: rows, budget: await budgetStatus("Transport") });
}

async function recordCost(user, b, { ownTripOnly = false } = {}) {
  if (!isId(b.vehicleId) && !isId(b.tripId)) throw fail(400, "Choose the vehicle (or the trip) this cost belongs to");
  if (!COST_KINDS.includes(b.kind)) throw fail(400, `kind must be one of ${COST_KINDS.join(", ")}`);
  const amount = money(b.amount);
  const litres = optNumber(b.litres, "litres", { min: 0.01, max: 100000 });
  if (b.kind === "fuel" && b.litres !== undefined && b.litres !== "" && litres === null) throw fail(400, "litres is not a valid number");
  if (b.kind !== "fuel" && litres !== null) throw fail(400, "Litres only belong on a fuel cost");
  const odometer = optNumber(b.odometerKm, "odometerKm");
  const date = dateOrToday(b.expenseDate);

  const client = await pool.connect();
  let row; let held = null; let vehicle;
  try {
    await client.query("BEGIN");
    let trip = null;
    if (isId(b.tripId)) {
      const t = await client.query("SELECT * FROM trips WHERE id = $1", [b.tripId]);
      trip = t.rows[0];
      if (!trip) throw fail(404, "Trip not found");
      if (ownTripOnly && trip.driver_id !== user.id) throw fail(404, "Trip not found");
      if (ownTripOnly && !["planned", "en_route", "broken_down"].includes(trip.status)) throw fail(409, "This trip is finished. Ask the Transport office to record the cost.");
    } else if (ownTripOnly) throw fail(400, "Choose the trip");
    const vehicleId = trip ? trip.vehicle_id : b.vehicleId;
    if (trip && isId(b.vehicleId) && b.vehicleId !== trip.vehicle_id) throw fail(400, "That trip was made with a different vehicle");
    const v = await client.query("SELECT * FROM vehicles WHERE id = $1", [vehicleId]);
    vehicle = v.rows[0];
    if (!vehicle) throw fail(404, "Vehicle not found");

    const verdict = await budgetStatusForCost("Transport", amount, client, Number(date.slice(0, 4)));
    const reference = generateReference("VEXP");
    const { rows } = await client.query(
      `INSERT INTO vehicle_expenses (reference, vehicle_id, trip_id, kind, amount, litres, odometer_km, vendor, note, expense_date, budget_status, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [reference, vehicle.id, trip?.id || null, b.kind, amount, litres, odometer, b.vendor || null, b.note || null, date, verdict.status, user.id]);
    row = rows[0];
    if (odometer !== null) await client.query("UPDATE vehicles SET odometer_km = GREATEST(odometer_km, $2) WHERE id = $1", [vehicle.id, odometer]);
    if (verdict.status === "held") held = verdict;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  detached(async () => {
    if (held) await announceHeldCost({ department: "Transport", what: `${b.kind} for ${vehicle.plate_number}`, reference: row.reference, amount, remaining: held.remaining, year: held.year });
    else await checkBudgetAlerts("Transport", Number(date.slice(0, 4)));
  });
  return row;
}

export async function createCost(req, res) {
  const cost = await recordCost(req.user, req.body || {});
  res.status(201).json({ cost, waitingForFinance: cost.budget_status === "held" });
}
export async function createMyCost(req, res) {
  const cost = await recordCost(req.user, req.body || {}, { ownTripOnly: true });
  res.status(201).json({ cost, waitingForFinance: cost.budget_status === "held" });
}
export async function costBudgetDecision(req, res) {
  const row = await decideHeldCost("vehicle_expenses", req.params.id, req.body || {}, req.user.id, req.purchasingRole);
  res.json({ cost: row });
}

// ---- Fleet report ------------------------------------------------------------------------------------
export async function fleetReport(req, res) {
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  if (year < 2000 || year > 2100) throw fail(400, "Unknown year");
  const { rows: vehicles } = await pool.query(
    `SELECT v.id, v.plate_number, v.name, v.status,
            (SELECT COUNT(*)::int FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'completed' AND EXTRACT(YEAR FROM t.completed_at) = $1) AS trips,
            (SELECT COALESCE(SUM(t.odometer_end - t.odometer_start), 0) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'completed'
                AND t.odometer_end IS NOT NULL AND t.odometer_start IS NOT NULL AND EXTRACT(YEAR FROM t.completed_at) = $1) AS km,
            (SELECT COALESCE(SUM(amount), 0) FROM vehicle_expenses e WHERE e.vehicle_id = v.id AND e.budget_status = 'counted' AND EXTRACT(YEAR FROM e.expense_date) = $1) AS cost_total,
            (SELECT COALESCE(SUM(amount), 0) FROM vehicle_expenses e WHERE e.vehicle_id = v.id AND e.kind = 'fuel' AND e.budget_status = 'counted' AND EXTRACT(YEAR FROM e.expense_date) = $1) AS fuel_cost,
            (SELECT COALESCE(SUM(litres), 0) FROM vehicle_expenses e WHERE e.vehicle_id = v.id AND e.kind = 'fuel' AND e.budget_status = 'counted' AND EXTRACT(YEAR FROM e.expense_date) = $1) AS fuel_litres,
            (SELECT COUNT(*)::int FROM trip_breakdowns b WHERE b.vehicle_id = v.id AND EXTRACT(YEAR FROM b.created_at) = $1) AS breakdowns
       FROM vehicles v ORDER BY v.plate_number`, [year]);
  const out = vehicles.map((v) => ({
    ...v, km: Number(v.km), cost_total: Number(v.cost_total), fuel_cost: Number(v.fuel_cost), fuel_litres: Number(v.fuel_litres),
    cost_per_km: Number(v.km) > 0 ? Math.round((Number(v.cost_total) / Number(v.km)) * 100) / 100 : null,
  }));
  res.json({ year, vehicles: out, budget: await budgetStatus("Transport", year) });
}
