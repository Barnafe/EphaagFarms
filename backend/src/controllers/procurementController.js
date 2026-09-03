import { pool } from "../db/pool.js";

async function withItems(orders) {
  const { rows: items } = await pool.query(
    "SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])",
    [orders.map((o) => o.id)]
  );
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

// --- Queue: orders confirmed by Finance, awaiting sourcing ----------------

export async function sourcingQueue(req, res) {
  const { rows: orders } = await pool.query(
    "SELECT * FROM orders WHERE status = 'payment_confirmed' ORDER BY created_at ASC"
  );
  res.json({ orders: await withItems(orders) });
}

// --- Registered farmers, for crop/location matching ------------------------

export async function farmerDirectory(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.phone, u.state, u.lga, fp.crops
     FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
     WHERE u.role_type = 'farmer'
     ORDER BY u.name ASC`
  );
  res.json({ farmers: rows });
}

// A farmer's currently-available listings, for the sourcing picker (so
// admin sources against a real listing + quantity rather than just a name —
// 2026-08-29 spec, needed to make purchases deduct declared inventory).
export async function farmerAvailableProducts(req, res) {
  const { farmerId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, crop, quantity, unit, address FROM farmer_products
     WHERE farmer_id = $1 AND status = 'available' ORDER BY created_at ASC`,
    [farmerId]
  );
  res.json({ products: rows });
}

// --- Source an order: record which farmer(s) fulfill it, against a real
// listing + quantity so it deducts the farmer's declared-inventory balance -
// body: { sourcing: [{ farmerId, productId, quantity }], notifiedRep }

export async function sourceOrder(req, res) {
  const { id } = req.params;
  const { sourcing, notifiedRep } = req.body;

  if (!Array.isArray(sourcing) || sourcing.length === 0) {
    return res.status(400).json({ error: "sourcing must be a non-empty array of { farmerId, productId, quantity }" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "UPDATE orders SET status = 'sourcing' WHERE id = $1 AND status = 'payment_confirmed' RETURNING *",
      [id]
    );
    if (!rows[0]) {
      throw Object.assign(new Error("Order not found or not awaiting sourcing"), { status: 400 });
    }

    for (const entry of sourcing) {
      const { farmerId, productId, quantity } = entry;
      const qty = Number(quantity);
      if (!farmerId || !productId || !qty || qty <= 0) {
        throw Object.assign(new Error("Each sourcing entry needs farmerId, productId, and a positive quantity"), {
          status: 400,
        });
      }
      const { rows: productRows } = await client.query(
        `SELECT * FROM farmer_products WHERE id = $1 AND farmer_id = $2 AND status = 'available' FOR UPDATE`,
        [productId, farmerId]
      );
      const product = productRows[0];
      if (!product) {
        throw Object.assign(new Error("One of the selected listings is no longer available"), { status: 400 });
      }
      if (qty > Number(product.quantity)) {
        throw Object.assign(
          new Error(`Requested ${qty} ${product.unit} but the listing only has ${product.quantity} ${product.unit} available`),
          { status: 400 }
        );
      }

      const remainingOnListing = Number(product.quantity) - qty;
      await client.query(
        `UPDATE farmer_products SET quantity = $1, status = $2 WHERE id = $3`,
        [remainingOnListing, remainingOnListing <= 0 ? "sold_out" : "available", productId]
      );

      await client.query(
        `INSERT INTO order_sourcing (order_id, farmer_id, product_id, crop, quantity_sourced, notified_rep)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, farmerId, productId, product.crop, qty, notifiedRep || null]
      );

      // Farmer payment — "when the company source goods, they pay directly
      // to the farmers" (2026-08-30 spec). This IS Settlement's farmer leg:
      // quantity sourced × the company's buy_price for that crop. Created
      // 'unpaid' here; Finance marks it paid via financeController.markPaymentPaid.
      const { rows: priceRows } = await client.query(
        `SELECT buy_price FROM standard_prices WHERE crop = $1`,
        [product.crop]
      );
      const buyPrice = priceRows[0] ? Number(priceRows[0].buy_price) : 0;
      await client.query(
        `INSERT INTO payments (order_id, payee_type, payee_id, amount, status)
         VALUES ($1, 'farmer', $2, $3, 'unpaid')`,
        [id, farmerId, qty * buyPrice]
      );
    }

    await client.query("COMMIT");
    res.json({ order: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not source order" });
  } finally {
    client.release();
  }
}

// --- Queue: sourced orders, awaiting processor assignment ------------------

export async function assignmentQueue(req, res) {
  const { rows: orders } = await pool.query(
    "SELECT * FROM orders WHERE status = 'sourcing' ORDER BY created_at ASC"
  );
  const { rows: sourcing } = await pool.query(
    `SELECT os.order_id, u.name AS farmer_name
     FROM order_sourcing os JOIN users u ON u.id = os.farmer_id
     WHERE os.order_id = ANY($1::uuid[])`,
    [orders.map((o) => o.id)]
  );
  const withOrders = await withItems(orders);
  res.json({
    orders: withOrders.map((o) => ({
      ...o,
      sourcedFrom: sourcing.filter((s) => s.order_id === o.id).map((s) => s.farmer_name),
    })),
  });
}

// --- Processors, for assignment ---------------------------------------------

export async function processorDirectory(req, res) {
  const { rows } = await pool.query(
    "SELECT id, name, phone, state, lga FROM users WHERE role_type = 'processor' ORDER BY name ASC"
  );
  res.json({ processors: rows });
}

// --- Assign a processor: creates the job, moves order to 'processing' -----

export async function assignProcessor(req, res) {
  const { id } = req.params;
  const { processorId } = req.body;
  if (!processorId) return res.status(400).json({ error: "processorId is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "UPDATE orders SET status = 'processing' WHERE id = $1 AND status = 'sourcing' RETURNING *",
      [id]
    );
    if (!rows[0]) {
      throw Object.assign(new Error("Order not found or not ready for processor assignment"), {
        status: 400,
      });
    }

    await client.query(
      "INSERT INTO processor_jobs (order_id, processor_id) VALUES ($1, $2)",
      [id, processorId]
    );

    await client.query("COMMIT");
    res.json({ order: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not assign processor" });
  } finally {
    client.release();
  }
}
