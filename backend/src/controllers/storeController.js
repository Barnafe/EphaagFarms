import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";

// Store Department (merged build). Workflow:
//   1. An order's goods are ready once its processor job is complete. Store
//      explicitly receives them (receiveOrder) — verifying quality and
//      recording the ACTUAL quantity received per line item (can differ
//      from what was ordered, e.g. shrinkage). That recorded quantity, not
//      the order's original ask, is what enters the shared inventory pool.
//      One receipt per order item — a UNIQUE constraint on order_item_id
//      blocks double-receiving the same item.
//   2. Before an order can be allocated to a distributor, Store audits it
//      against the pool and quality (auditOrder) — a persisted verdict,
//      re-auditable if something changes. Allocation is blocked until the
//      current audit says verified = true.
//   3. Once an order is confirmed taken out (allocated to a distributor),
//      inventory is decremented to keep available stock accurate
//      (allocate) — never allowed to go negative.
//   4. When stock runs low (below its reorder_level), Store raises a
//      purchase request through the existing generic cross-department
//      approval workflow (see requestsController.js), tagging
//      Procurement/Finance, with Admin final approval always auto-appended.
// Every physical stock change (in or out) is logged to stock_movements —
// store_inventory.quantity_on_hand is the running total, stock_movements is
// the durable "why did it change" trail.

async function withItems(orders) {
  if (orders.length === 0) return orders;
  const { rows: items } = await pool.query(
    "SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])",
    [orders.map((o) => o.id)]
  );
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

async function bumpInventory(client, crop, unit, delta, reorderLevel) {
  const { rows } = await client.query(
    `INSERT INTO store_inventory (crop, unit, quantity_on_hand, reorder_level, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (crop) DO UPDATE
       SET quantity_on_hand = store_inventory.quantity_on_hand + $3, unit = $2, updated_at = now()
     RETURNING *`,
    [crop, unit, delta, reorderLevel ?? 10]
  );
  return rows[0];
}

// Compares an order's line items against current pool stock. Returns one
// row per line item with what's required vs what's available, plus an
// overall `sufficient` flag. Crop matching is case-insensitive since
// order_items and store_inventory aren't guaranteed to agree on casing.
async function stockCheckForOrder(order) {
  const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = $1", [order.id]);
  const { rows: stock } = await pool.query("SELECT * FROM store_inventory");
  const byCrop = new Map(stock.map((s) => [s.crop.trim().toLowerCase(), s]));

  const breakdown = items.map((item) => {
    const match = byCrop.get(item.crop.trim().toLowerCase());
    const available = match ? Number(match.quantity_on_hand) : 0;
    const required = Number(item.quantity);
    return {
      crop: item.crop,
      unit: item.unit,
      required,
      available,
      sufficient: available >= required,
    };
  });

  return { breakdown, sufficient: breakdown.every((b) => b.sufficient) };
}

// --- Inventory ---------------------------------------------------------
// "Responsible for company inventory" — the running stock pool, aggregated
// by crop across every order ever received.

export async function inventory(req, res) {
  const { rows } = await pool.query(
    `SELECT id, crop, unit, quantity_on_hand, reorder_level, updated_at FROM store_inventory ORDER BY crop ASC`
  );
  res.json({
    inventory: rows.map((s) => ({
      ...s,
      low: Number(s.quantity_on_hand) < Number(s.reorder_level),
    })),
  });
}

export async function updateReorderLevel(req, res) {
  const { id } = req.params;
  const { reorderLevel } = req.body;
  const level = Number(reorderLevel);
  if (!Number.isFinite(level) || level < 0) {
    return res.status(400).json({ error: "reorderLevel must be a non-negative number" });
  }
  const { rows } = await pool.query(
    `UPDATE store_inventory SET reorder_level = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [level, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Stock item not found" });
  res.json({ stock: { ...rows[0], low: Number(rows[0].quantity_on_hand) < Number(rows[0].reorder_level) } });
}

export async function stockMovementHistory(req, res) {
  const { rows } = await pool.query(
    `SELECT m.*, u.name AS recorded_by_name, o.reference AS order_reference
     FROM stock_movements m
     LEFT JOIN users u ON u.id = m.recorded_by
     LEFT JOIN orders o ON o.id = m.order_id
     ORDER BY m.created_at DESC LIMIT 100`
  );
  res.json({ movements: rows });
}

// --- Receiving: "Any goods that comes, store verify and store it
// physically and update the inventory" ---------------------------------
// A processed order's goods are ready for Store to receive once its
// processor job is complete. Receiving is Store's own explicit action —
// it both verifies quality and records the actual quantity received.

export async function receivingQueue(req, res) {
  const { rows: orders } = await pool.query(
    `SELECT o.* FROM orders o
     JOIN processor_jobs j ON j.order_id = o.id
     WHERE o.status = 'processing' AND j.status = 'complete'
       AND EXISTS (
         SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
         AND NOT EXISTS (SELECT 1 FROM store_receipts sr WHERE sr.order_item_id = oi.id)
       )
     ORDER BY o.created_at ASC`
  );
  res.json({ orders: await withItems(orders) });
}

export async function receiveOrder(req, res) {
  const { id } = req.params;
  const { items } = req.body; // [{orderItemId, quantityReceived}]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array of { orderItemId, quantityReceived }" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: orderItems } = await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [id]);
    if (orderItems.length === 0) {
      throw Object.assign(new Error("Order not found or has no items"), { status: 404 });
    }

    for (const entry of items) {
      const item = orderItems.find((oi) => oi.id === entry.orderItemId);
      const qty = Number(entry.quantityReceived);
      if (!item) throw Object.assign(new Error("One of the items doesn't belong to this order"), { status: 400 });
      if (!qty || qty <= 0) throw Object.assign(new Error("quantityReceived must be a positive number"), { status: 400 });

      await client.query(
        `INSERT INTO store_receipts (order_item_id, order_id, crop, quantity_received, unit, received_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.id, id, item.crop, qty, item.unit, req.user.id]
      );
      await bumpInventory(client, item.crop, item.unit, qty);
      await client.query(
        `INSERT INTO stock_movements (crop, unit, direction, quantity, reason, order_id, recorded_by)
         VALUES ($1, $2, 'in', $3, 'goods_received', $4, $5)`,
        [item.crop, item.unit, qty, id, req.user.id]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ received: true });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "23505") return res.status(400).json({ error: "One of these items has already been received" });
    console.error(err);
    res.status(500).json({ error: "Could not record receipt" });
  } finally {
    client.release();
  }
}

// --- Admin: orders ready for allocation, audited against stock -------------
// "If an order come, store verify the quality against available stock and
// be able to audit the order" — each order shows what it needs against
// current pool levels, plus its current audit verdict (if any).

export async function allocationQueue(req, res) {
  const { rows: orders } = await pool.query(
    `SELECT o.* FROM orders o
     JOIN processor_jobs j ON j.order_id = o.id
     WHERE o.status = 'processing' AND j.status = 'complete'
       AND NOT EXISTS (SELECT 1 FROM distributor_allocations a WHERE a.order_id = o.id)
     ORDER BY o.created_at ASC`
  );
  const withOrderItems = await withItems(orders);

  const { rows: audits } = orders.length
    ? await pool.query("SELECT * FROM order_audits WHERE order_id = ANY($1::uuid[])", [orders.map((o) => o.id)])
    : { rows: [] };
  const auditByOrder = new Map(audits.map((a) => [a.order_id, a]));

  const enriched = await Promise.all(
    withOrderItems.map(async (o) => ({
      ...o,
      stockCheck: await stockCheckForOrder(o),
      audit: auditByOrder.get(o.id) || null,
    }))
  );

  res.json({ orders: enriched });
}

export async function distributorDirectory(req, res) {
  const { rows } = await pool.query(
    "SELECT id, name, phone, state, lga FROM users WHERE role_type = 'distributor' ORDER BY name ASC"
  );
  res.json({ distributors: rows });
}

// --- Admin: audit an order against stock/quality before allocation --------

export async function auditOrder(req, res) {
  const { id } = req.params;
  const { verified, note } = req.body;
  if (typeof verified !== "boolean") {
    return res.status(400).json({ error: "verified (true/false) is required" });
  }

  const { rows: orderRows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const { rows } = await pool.query(
    `INSERT INTO order_audits (order_id, verified, note, audited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id) DO UPDATE SET verified = $2, note = $3, audited_by = $4, audited_at = now()
     RETURNING *`,
    [id, verified, note || null, req.user.id]
  );

  res.json({ audit: rows[0], stockCheck: await stockCheckForOrder(order) });
}

// --- Admin: allocate a distributor, order -> 'allocated' -------------------
// Requires a passing audit first, then decrements the pool (never allowed
// to go negative — a real shortfall blocks dispatch instead of silently
// under-fulfilling).

export async function allocate(req, res) {
  const { id } = req.params;
  const { distributorId } = req.body;
  if (!distributorId) return res.status(400).json({ error: "distributorId is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: auditRows } = await client.query("SELECT * FROM order_audits WHERE order_id = $1", [id]);
    if (!auditRows[0] || auditRows[0].verified !== true) {
      throw Object.assign(new Error("This order must pass Store's audit before it can be allocated"), {
        status: 400,
      });
    }

    const { rows: orderRows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND status = 'processing' FOR UPDATE`,
      [id]
    );
    if (!orderRows[0]) {
      throw Object.assign(new Error("Order not found or not ready for allocation"), { status: 400 });
    }

    const { rows: items } = await client.query("SELECT * FROM order_items WHERE order_id = $1", [id]);
    for (const item of items) {
      const qty = Number(item.quantity);
      const { rows: stockRows } = await client.query(
        `SELECT quantity_on_hand FROM store_inventory WHERE lower(crop) = lower($1) FOR UPDATE`,
        [item.crop]
      );
      const onHand = stockRows[0] ? Number(stockRows[0].quantity_on_hand) : 0;
      if (onHand < qty) {
        throw Object.assign(
          new Error(`Not enough ${item.crop} in stock — have ${onHand} ${item.unit}, order needs ${qty}. Receive more stock or re-audit.`),
          { status: 400 }
        );
      }
    }

    const { rows } = await client.query(
      "UPDATE orders SET status = 'allocated' WHERE id = $1 RETURNING *",
      [id]
    );

    for (const item of items) {
      const qty = Number(item.quantity);
      await bumpInventory(client, item.crop, item.unit, -qty);
      await client.query(
        `INSERT INTO stock_movements (crop, unit, direction, quantity, reason, order_id, recorded_by)
         VALUES ($1, $2, 'out', $3, 'order_allocated', $4, $5)`,
        [item.crop, item.unit, qty, id, req.user.id]
      );
    }

    await client.query(
      "INSERT INTO distributor_allocations (order_id, distributor_id) VALUES ($1, $2)",
      [id, distributorId]
    );

    await client.query("COMMIT");
    res.json({ order: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not allocate distributor" });
  } finally {
    client.release();
  }
}

// --- Distributor: own allocation tasks --------------------------------------

export async function myAllocations(req, res) {
  const { rows: allocs } = await pool.query(
    `SELECT a.*, o.reference, o.delivery_location
     FROM distributor_allocations a JOIN orders o ON o.id = a.order_id
     WHERE a.distributor_id = $1
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  const { rows: items } = allocs.length
    ? await pool.query("SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])", [allocs.map((a) => a.order_id)])
    : { rows: [] };
  res.json({
    allocations: allocs.map((a) => ({
      ...a,
      items: items.filter((i) => i.order_id === a.order_id),
    })),
  });
}

export async function confirmAllocation(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE distributor_allocations SET status = 'confirmed' WHERE id = $1 AND distributor_id = $2 AND status = 'assigned' RETURNING *",
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Allocation not found or already confirmed" });
  res.json({ allocation: rows[0] });
}

// --- Restock requests -------------------------------------------------------
// "Stock get low, store make purchase request via the approval workflow
// and tag relevant people eg. Procurement, finance and admin for
// approval" — a thin convenience wrapper around the EXISTING generic
// department_requests system (see requestsController.js), pre-titled and
// pre-chained to Procurement's and Finance's current department heads
// (whichever are assigned — a head not yet assigned simply isn't added as
// a step) plus the system's always-appended Admin final approval step.
export async function createRestockRequest(req, res) {
  const { crop, quantity, unit, note } = req.body;
  if (!crop || !quantity || !unit) {
    return res.status(400).json({ error: "crop, quantity, and unit are required" });
  }

  const { rows: heads } = await pool.query(
    `SELECT id, name, department_head_of FROM users
     WHERE role_type = 'admin' AND department_head_of IN ('Procurement', 'Finance')`
  );
  const procurementHead = heads.find((h) => h.department_head_of === "Procurement");
  const financeHead = heads.find((h) => h.department_head_of === "Finance");

  const approvers = [];
  if (procurementHead) approvers.push({ approverId: procurementHead.id, label: "Procurement" });
  if (financeHead) approvers.push({ approverId: financeHead.id, label: "Finance" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = generateReference(REF_PREFIX.request);
    const { rows } = await client.query(
      `INSERT INTO department_requests (reference, requester_id, department, title, description)
       VALUES ($1, $2, 'Store', $3, $4) RETURNING *`,
      [
        reference,
        req.user.id,
        `Restock: ${quantity} ${unit} ${crop}`,
        note || `Store stock is low on ${crop} — requesting ${quantity} ${unit} be sourced.`,
      ]
    );
    const request = rows[0];

    let order = 1;
    for (const step of approvers) {
      await client.query(
        `INSERT INTO request_approval_steps (request_id, step_order, approver_id, label)
         VALUES ($1, $2, $3, $4)`,
        [request.id, order, step.approverId, step.label]
      );
      order++;
    }
    await client.query(
      `INSERT INTO request_approval_steps (request_id, step_order, approver_id, label)
       VALUES ($1, $2, NULL, 'Admin final approval')`,
      [request.id, order]
    );
    await client.query("COMMIT");
    res.status(201).json({ request });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not create restock request" });
  } finally {
    client.release();
  }
}
