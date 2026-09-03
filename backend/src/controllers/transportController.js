import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";

async function withItems(orders) {
  const { rows: items } = await pool.query(
    "SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])",
    [orders.map((o) => o.id)]
  );
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

// --- Admin: orders ready to dispatch -----------------------------------
// Ready = allocated to a distributor who has confirmed, no shipment yet.

export async function dispatchQueue(req, res) {
  const { rows: orders } = await pool.query(
    `SELECT o.* FROM orders o
     JOIN distributor_allocations a ON a.order_id = o.id
     WHERE o.status = 'allocated' AND a.status = 'confirmed'
       AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)
     ORDER BY o.created_at ASC`
  );
  res.json({ orders: await withItems(orders) });
}

export async function driverDirectory(req, res) {
  const { rows } = await pool.query(
    "SELECT id, name, phone, state, lga FROM users WHERE role_type = 'transporter' ORDER BY name ASC"
  );
  res.json({ drivers: rows });
}

// --- Admin: assign a driver, generates the shipment, order -> 'in_transit' --

export async function assignDriver(req, res) {
  const { id } = req.params;
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ error: "driverId is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "UPDATE orders SET status = 'in_transit' WHERE id = $1 AND status = 'allocated' RETURNING *",
      [id]
    );
    if (!rows[0]) {
      throw Object.assign(new Error("Order not found or not ready for dispatch"), { status: 400 });
    }

    const reference = generateReference(REF_PREFIX.shipment);
    const { rows: shipmentRows } = await client.query(
      "INSERT INTO shipments (reference, order_id, driver_id) VALUES ($1, $2, $3) RETURNING *",
      [reference, id, driverId]
    );

    await client.query("COMMIT");
    res.json({ order: rows[0], shipment: shipmentRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not assign driver" });
  } finally {
    client.release();
  }
}

// --- Driver: own shipments -------------------------------------------------

export async function myShipments(req, res) {
  const { rows: shipments } = await pool.query(
    `SELECT s.*, o.reference AS order_reference, o.delivery_location
     FROM shipments s JOIN orders o ON o.id = s.order_id
     WHERE s.driver_id = $1
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  const { rows: items } = await pool.query(
    "SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])",
    [shipments.map((s) => s.order_id)]
  );
  res.json({
    shipments: shipments.map((s) => ({
      ...s,
      items: items.filter((i) => i.order_id === s.order_id),
    })),
  });
}

export async function markPickedUp(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE shipments SET status = 'en_route' WHERE id = $1 AND driver_id = $2 AND status = 'assigned' RETURNING *",
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Shipment not found or already picked up" });
  res.json({ shipment: rows[0] });
}

// Note: real file storage isn't built yet — proofOfDeliveryUrl is stored
// as whatever string the client sends (currently just the filename).
export async function markDelivered(req, res) {
  const { id } = req.params;
  const { proofOfDeliveryUrl } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE shipments SET status = 'delivered', proof_of_delivery_url = $1
       WHERE id = $2 AND driver_id = $3 AND status = 'en_route' RETURNING *`,
      [proofOfDeliveryUrl || null, id, req.user.id]
    );
    if (!rows[0]) {
      throw Object.assign(new Error("Shipment not found or not en route"), { status: 400 });
    }

    await client.query("UPDATE orders SET status = 'delivered' WHERE id = $1", [rows[0].order_id]);

    await client.query("COMMIT");
    res.json({ shipment: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not mark delivered" });
  } finally {
    client.release();
  }
}
