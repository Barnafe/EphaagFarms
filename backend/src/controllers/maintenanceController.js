import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function addInterval(date, type, value) {
  const d = new Date(date);
  if (type === "days") d.setDate(d.getDate() + value);
  else if (type === "weeks") d.setDate(d.getDate() + value * 7);
  else d.setMonth(d.getMonth() + value);
  return d.toISOString().slice(0, 10);
}

// =======================================================================
// Dashboard
// =======================================================================

export async function dashboardSummary(req, res) {
  const [
    { rows: reqCounts },
    { rows: woCounts },
    { rows: assetCounts },
    { rows: lowStock },
    { rows: dueSoon },
    { rows: monthExpense },
  ] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count FROM maintenance_requests GROUP BY status`
    ),
    pool.query(
      `SELECT status, COUNT(*)::int AS count FROM maintenance_work_orders GROUP BY status`
    ),
    pool.query(
      `SELECT status, COUNT(*)::int AS count FROM maintenance_assets GROUP BY status`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM maintenance_parts WHERE quantity_on_hand <= reorder_level`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM maintenance_schedules
       WHERE status = 'active' AND next_due_date <= CURRENT_DATE + INTERVAL '7 days'`
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM maintenance_expenses
       WHERE date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)`
    ),
  ]);

  res.json({
    requestsByStatus: reqCounts,
    workOrdersByStatus: woCounts,
    assetsByStatus: assetCounts,
    lowStockParts: lowStock[0].count,
    scheduleDueSoon: dueSoon[0].count,
    monthToDateExpense: Number(monthExpense[0].total),
  });
}

// =======================================================================
// Assets & Equipment
// =======================================================================

export async function listAssets(req, res) {
  const { rows } = await pool.query(`SELECT * FROM maintenance_assets ORDER BY created_at DESC NULLS LAST, name ASC`);
  res.json({ assets: rows });
}

export async function createAsset(req, res) {
  const { name, assetType, location, serialNumber, purchaseDate, warrantyExpiry, department, notes } = req.body;
  if (!name || !assetType) throw httpError("name and assetType are required");
  const { rows } = await pool.query(
    `INSERT INTO maintenance_assets (name, asset_type, location, serial_number, purchase_date, warranty_expiry, department, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, assetType, location || null, serialNumber || null, purchaseDate || null, warrantyExpiry || null, department || null, notes || null]
  );
  res.status(201).json({ asset: rows[0] });
}

export async function updateAsset(req, res) {
  const { id } = req.params;
  const { name, assetType, status, location, serialNumber, purchaseDate, warrantyExpiry, department, notes, lastServiced } = req.body;
  const { rows } = await pool.query(
    `UPDATE maintenance_assets SET
       name = COALESCE($1, name),
       asset_type = COALESCE($2, asset_type),
       status = COALESCE($3, status),
       location = COALESCE($4, location),
       serial_number = COALESCE($5, serial_number),
       purchase_date = COALESCE($6, purchase_date),
       warranty_expiry = COALESCE($7, warranty_expiry),
       department = COALESCE($8, department),
       notes = COALESCE($9, notes),
       last_serviced = COALESCE($10, last_serviced)
     WHERE id = $11 RETURNING *`,
    [name, assetType, status, location, serialNumber, purchaseDate, warrantyExpiry, department, notes, lastServiced, id]
  );
  if (!rows[0]) throw httpError("Asset not found", 404);
  res.json({ asset: rows[0] });
}

export async function logAssetService(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE maintenance_assets SET status = 'good', last_serviced = CURRENT_DATE WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows[0]) throw httpError("Asset not found", 404);
  res.json({ asset: rows[0] });
}

// =======================================================================
// Technicians
// =======================================================================

export async function listTechnicians(req, res) {
  const { rows } = await pool.query(`SELECT * FROM maintenance_technicians ORDER BY created_at DESC`);
  res.json({ technicians: rows });
}

export async function createTechnician(req, res) {
  const { name, phone, email, specialty, notes } = req.body;
  if (!name) throw httpError("name is required");
  const { rows } = await pool.query(
    `INSERT INTO maintenance_technicians (name, phone, email, specialty, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, phone || null, email || null, specialty || null, notes || null]
  );
  res.status(201).json({ technician: rows[0] });
}

export async function updateTechnician(req, res) {
  const { id } = req.params;
  const { name, phone, email, specialty, status, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE maintenance_technicians SET
       name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email),
       specialty = COALESCE($4, specialty), status = COALESCE($5, status), notes = COALESCE($6, notes)
     WHERE id = $7 RETURNING *`,
    [name, phone, email, specialty, status, notes, id]
  );
  if (!rows[0]) throw httpError("Technician not found", 404);
  res.json({ technician: rows[0] });
}

// Technician workload — open/active work orders per technician, used by
// the assignment picker so the HOD can see who's free before assigning.
export async function technicianWorkload(req, res) {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, COUNT(w.id) FILTER (WHERE w.status NOT IN ('completed','cancelled'))::int AS active_orders
     FROM maintenance_technicians t
     LEFT JOIN maintenance_work_orders w ON w.assigned_technician_id = t.id
     WHERE t.status = 'active'
     GROUP BY t.id, t.name ORDER BY t.name ASC`
  );
  res.json({ workload: rows });
}

// =======================================================================
// Contractors
// =======================================================================

export async function listContractors(req, res) {
  const { rows } = await pool.query(`SELECT * FROM maintenance_contractors ORDER BY created_at DESC`);
  res.json({ contractors: rows });
}

export async function createContractor(req, res) {
  const { companyName, contactPerson, phone, email, serviceType, notes } = req.body;
  if (!companyName) throw httpError("companyName is required");
  const { rows } = await pool.query(
    `INSERT INTO maintenance_contractors (company_name, contact_person, phone, email, service_type, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [companyName, contactPerson || null, phone || null, email || null, serviceType || null, notes || null]
  );
  res.status(201).json({ contractor: rows[0] });
}

export async function updateContractor(req, res) {
  const { id } = req.params;
  const { companyName, contactPerson, phone, email, serviceType, status, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE maintenance_contractors SET
       company_name = COALESCE($1, company_name), contact_person = COALESCE($2, contact_person),
       phone = COALESCE($3, phone), email = COALESCE($4, email), service_type = COALESCE($5, service_type),
       status = COALESCE($6, status), notes = COALESCE($7, notes)
     WHERE id = $8 RETURNING *`,
    [companyName, contactPerson, phone, email, serviceType, status, notes, id]
  );
  if (!rows[0]) throw httpError("Contractor not found", 404);
  res.json({ contractor: rows[0] });
}

// =======================================================================
// Spare Parts & Inventory
// =======================================================================

export async function listParts(req, res) {
  const { rows } = await pool.query(`SELECT * FROM maintenance_parts ORDER BY name ASC`);
  res.json({ parts: rows });
}

export async function createPart(req, res) {
  const { name, partNumber, category, unit, quantityOnHand, unitCost, reorderLevel, supplier, location } = req.body;
  if (!name) throw httpError("name is required");
  const { rows } = await pool.query(
    `INSERT INTO maintenance_parts (name, part_number, category, unit, quantity_on_hand, unit_cost, reorder_level, supplier, location)
     VALUES ($1,$2,$3,COALESCE($4,'pcs'),COALESCE($5,0),COALESCE($6,0),COALESCE($7,5),$8,$9) RETURNING *`,
    [name, partNumber || null, category || null, unit, quantityOnHand, unitCost, reorderLevel, supplier || null, location || null]
  );
  res.status(201).json({ part: rows[0] });
}

export async function updatePart(req, res) {
  const { id } = req.params;
  const { name, partNumber, category, unit, unitCost, reorderLevel, supplier, location } = req.body;
  const { rows } = await pool.query(
    `UPDATE maintenance_parts SET
       name = COALESCE($1, name), part_number = COALESCE($2, part_number), category = COALESCE($3, category),
       unit = COALESCE($4, unit), unit_cost = COALESCE($5, unit_cost), reorder_level = COALESCE($6, reorder_level),
       supplier = COALESCE($7, supplier), location = COALESCE($8, location)
     WHERE id = $9 RETURNING *`,
    [name, partNumber, category, unit, unitCost, reorderLevel, supplier, location, id]
  );
  if (!rows[0]) throw httpError("Part not found", 404);
  res.json({ part: rows[0] });
}

// Manual stock adjustment (restock or correction) — mirrors the Store
// Department's stock_movements pattern: every quantity change is a ledger
// row, quantity_on_hand is the running total kept in sync alongside it.
export async function adjustPartStock(req, res) {
  const { id } = req.params;
  const { direction, quantity, reason, note } = req.body;
  if (!["in", "out"].includes(direction)) throw httpError("direction must be 'in' or 'out'");
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw httpError("quantity must be a positive number");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const delta = direction === "in" ? qty : -qty;
    const { rows } = await client.query(
      `UPDATE maintenance_parts SET quantity_on_hand = quantity_on_hand + $1 WHERE id = $2 RETURNING *`,
      [delta, id]
    );
    if (!rows[0]) throw httpError("Part not found", 404);
    if (Number(rows[0].quantity_on_hand) < 0) throw httpError("Stock cannot go below zero");

    await client.query(
      `INSERT INTO maintenance_part_movements (part_id, direction, quantity, reason, recorded_by, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, direction, qty, reason || "adjustment", req.user.id, note || null]
    );
    await client.query("COMMIT");
    res.json({ part: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function partMovementHistory(req, res) {
  const { rows } = await pool.query(
    `SELECT m.*, p.name AS part_name, u.name AS recorded_by_name
     FROM maintenance_part_movements m
     JOIN maintenance_parts p ON p.id = m.part_id
     LEFT JOIN users u ON u.id = m.recorded_by
     ORDER BY m.created_at DESC LIMIT 200`
  );
  res.json({ movements: rows });
}

// =======================================================================
// Maintenance Requests  (workflow step 1-2: report -> supervisor review)
// =======================================================================

export async function listRequests(req, res) {
  const { rows } = await pool.query(
    `SELECT r.*, a.name AS asset_name, u.name AS reported_by_name
     FROM maintenance_requests r
     LEFT JOIN maintenance_assets a ON a.id = r.asset_id
     LEFT JOIN users u ON u.id = r.reported_by
     ORDER BY r.created_at DESC`
  );
  res.json({ requests: rows });
}

export async function createRequest(req, res) {
  const { assetId, title, description, location, priority, reporterName, reporterDepartment } = req.body;
  if (!title) throw httpError("title is required");
  const reference = generateReference(REF_PREFIX.maintenanceRequest);
  const { rows } = await pool.query(
    `INSERT INTO maintenance_requests
       (reference, asset_id, title, description, location, priority, reported_by, reporter_name, reporter_department)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'medium'),$7,$8,$9) RETURNING *`,
    [reference, assetId || null, title, description || null, location || null, priority, req.user.id, reporterName || null, reporterDepartment || null]
  );
  res.status(201).json({ request: rows[0] });
}

// Step 3: supervisor review — approve or reject. Approving does not by
// itself create the work order; converting to a work order is an explicit
// separate action so the reviewer can approve now and staff it later.
export async function reviewRequest(req, res) {
  const { id } = req.params;
  const { decision, note } = req.body;
  if (!["approved", "rejected"].includes(decision)) throw httpError("decision must be 'approved' or 'rejected'");
  const { rows } = await pool.query(
    `UPDATE maintenance_requests SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3
     WHERE id = $4 AND status IN ('submitted','under_review') RETURNING *`,
    [decision, req.user.id, note || null, id]
  );
  if (!rows[0]) throw httpError("Request not found or already decided", 400);
  res.json({ request: rows[0] });
}

// Step 4: Work Order created from an approved request.
export async function convertRequestToWorkOrder(req, res) {
  const { id } = req.params;
  const { priority, scheduledDate } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: reqRows } = await client.query(
      `SELECT * FROM maintenance_requests WHERE id = $1 AND status = 'approved'`,
      [id]
    );
    if (!reqRows[0]) throw httpError("Request not found or not approved", 400);
    const request = reqRows[0];

    const reference = generateReference(REF_PREFIX.workOrder);
    const { rows: woRows } = await client.query(
      `INSERT INTO maintenance_work_orders
         (reference, request_id, asset_id, source, title, description, priority, scheduled_date, created_by)
       VALUES ($1,$2,$3,'request',$4,$5,COALESCE($6,$7),$8,$9) RETURNING *`,
      [reference, request.id, request.asset_id, request.title, request.description, priority, request.priority, scheduledDate || null, req.user.id]
    );

    await client.query(`UPDATE maintenance_requests SET status = 'converted' WHERE id = $1`, [id]);
    await client.query("COMMIT");
    res.status(201).json({ workOrder: woRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =======================================================================
// Work Orders  (workflow steps 4-9)
// =======================================================================

async function attachWorkOrderExtras(orders) {
  if (orders.length === 0) return orders;
  const ids = orders.map((o) => o.id);
  const { rows: parts } = await pool.query(
    `SELECT wp.*, p.name AS part_name FROM maintenance_work_order_parts wp
     JOIN maintenance_parts p ON p.id = wp.part_id WHERE wp.work_order_id = ANY($1::uuid[])`,
    [ids]
  );
  const { rows: inspections } = await pool.query(
    `SELECT * FROM maintenance_inspections WHERE work_order_id = ANY($1::uuid[]) ORDER BY inspected_at ASC`,
    [ids]
  );
  return orders.map((o) => ({
    ...o,
    parts: parts.filter((p) => p.work_order_id === o.id),
    inspections: inspections.filter((i) => i.work_order_id === o.id),
  }));
}

export async function listWorkOrders(req, res) {
  const { rows } = await pool.query(
    `SELECT w.*, a.name AS asset_name, t.name AS technician_name, c.company_name AS contractor_name
     FROM maintenance_work_orders w
     LEFT JOIN maintenance_assets a ON a.id = w.asset_id
     LEFT JOIN maintenance_technicians t ON t.id = w.assigned_technician_id
     LEFT JOIN maintenance_contractors c ON c.id = w.assigned_contractor_id
     ORDER BY w.created_at DESC`
  );
  res.json({ workOrders: await attachWorkOrderExtras(rows) });
}

export async function createWorkOrder(req, res) {
  const { assetId, title, description, priority, scheduledDate } = req.body;
  if (!title) throw httpError("title is required");
  const reference = generateReference(REF_PREFIX.workOrder);
  const { rows } = await pool.query(
    `INSERT INTO maintenance_work_orders (reference, asset_id, source, title, description, priority, scheduled_date, created_by)
     VALUES ($1,$2,'manual',$3,$4,COALESCE($5,'medium'),$6,$7) RETURNING *`,
    [reference, assetId || null, title, description || null, priority, scheduledDate || null, req.user.id]
  );
  res.status(201).json({ workOrder: rows[0] });
}

// Step 5: Technician (or contractor) assigned.
export async function assignWorkOrder(req, res) {
  const { id } = req.params;
  const { technicianId, contractorId } = req.body;
  if (!technicianId && !contractorId) throw httpError("technicianId or contractorId is required");
  const { rows } = await pool.query(
    `UPDATE maintenance_work_orders SET
       assigned_technician_id = $1, assigned_contractor_id = $2,
       status = CASE WHEN status = 'open' THEN 'assigned' ELSE status END
     WHERE id = $3 RETURNING *`,
    [technicianId || null, contractorId || null, id]
  );
  if (!rows[0]) throw httpError("Work order not found", 404);
  res.json({ workOrder: rows[0] });
}

// Step 6: Diagnosis.
export async function recordDiagnosis(req, res) {
  const { id } = req.params;
  const { diagnosis } = req.body;
  if (!diagnosis) throw httpError("diagnosis is required");
  const { rows } = await pool.query(
    `UPDATE maintenance_work_orders SET diagnosis = $1, status = 'diagnosis',
       started_at = COALESCE(started_at, now())
     WHERE id = $2 RETURNING *`,
    [diagnosis, id]
  );
  if (!rows[0]) throw httpError("Work order not found", 404);
  res.json({ workOrder: rows[0] });
}

// Generic status update — moves the order through in_progress /
// awaiting_parts / testing without requiring a dedicated endpoint each.
export async function updateWorkOrderStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ["open", "assigned", "diagnosis", "in_progress", "awaiting_parts", "testing", "cancelled"];
  if (!allowed.includes(status)) throw httpError(`status must be one of: ${allowed.join(", ")}`);
  const { rows } = await pool.query(
    `UPDATE maintenance_work_orders SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  if (!rows[0]) throw httpError("Work order not found", 404);
  res.json({ workOrder: rows[0] });
}

// Step 7: Repair / Parts Used — logs a part against the order and
// deducts it from inventory in the same transaction.
export async function addWorkOrderPart(req, res) {
  const { id } = req.params;
  const { partId, quantity } = req.body;
  const qty = Number(quantity);
  if (!partId || !qty || qty <= 0) throw httpError("partId and a positive quantity are required");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: partRows } = await client.query(
      `UPDATE maintenance_parts SET quantity_on_hand = quantity_on_hand - $1 WHERE id = $2 RETURNING *`,
      [qty, partId]
    );
    if (!partRows[0]) throw httpError("Part not found", 404);
    if (Number(partRows[0].quantity_on_hand) < 0) throw httpError("Not enough stock for that quantity");

    const { rows: lineRows } = await client.query(
      `INSERT INTO maintenance_work_order_parts (work_order_id, part_id, quantity, unit_cost)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, partId, qty, partRows[0].unit_cost]
    );
    await client.query(
      `INSERT INTO maintenance_part_movements (part_id, direction, quantity, reason, work_order_id, recorded_by)
       VALUES ($1,'out',$2,'used_in_work_order',$3,$4)`,
      [partId, qty, id, req.user.id]
    );
    await client.query("COMMIT");
    res.status(201).json({ line: lineRows[0], part: partRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Step 8: Inspection / Testing.
export async function addInspection(req, res) {
  const { id } = req.params;
  const { inspectionType, result, notes } = req.body;
  if (!result) throw httpError("result is required");
  const { rows: woRows } = await pool.query(`SELECT asset_id FROM maintenance_work_orders WHERE id = $1`, [id]);
  if (!woRows[0]) throw httpError("Work order not found", 404);

  const { rows } = await pool.query(
    `INSERT INTO maintenance_inspections (work_order_id, asset_id, inspection_type, result, notes, inspected_by)
     VALUES ($1,$2,COALESCE($3,'post_repair'),$4,$5,$6) RETURNING *`,
    [id, woRows[0].asset_id, inspectionType, result, notes || null, req.user.id]
  );

  if (result === "pass") {
    await pool.query(`UPDATE maintenance_work_orders SET status = 'testing' WHERE id = $1 AND status != 'completed'`, [id]);
  }
  res.status(201).json({ inspection: rows[0] });
}

// Step 9-10: Work Completed + Cost Recorded, in one action — closes the
// order, marks the asset serviced, and optionally logs a labor/other cost
// line so completion and its cost land together.
export async function completeWorkOrder(req, res) {
  const { id } = req.params;
  const { workPerformed, laborCost, laborDescription } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE maintenance_work_orders SET status = 'completed', completed_at = now(),
         work_performed = COALESCE($1, work_performed)
       WHERE id = $2 AND status != 'completed' RETURNING *`,
      [workPerformed || null, id]
    );
    if (!rows[0]) throw httpError("Work order not found or already completed", 400);
    const workOrder = rows[0];

    if (workOrder.asset_id) {
      await client.query(
        `UPDATE maintenance_assets SET status = 'good', last_serviced = CURRENT_DATE WHERE id = $1`,
        [workOrder.asset_id]
      );
    }
    if (workOrder.schedule_id) {
      const { rows: schedRows } = await client.query(
        `SELECT * FROM maintenance_schedules WHERE id = $1`,
        [workOrder.schedule_id]
      );
      if (schedRows[0]) {
        const s = schedRows[0];
        const nextDue = addInterval(new Date(), s.frequency_type, s.frequency_value);
        await client.query(
          `UPDATE maintenance_schedules SET last_completed_date = CURRENT_DATE, next_due_date = $1, reminder_sent_at = NULL WHERE id = $2`,
          [nextDue, s.id]
        );
      }
    }

    let expense = null;
    if (laborCost) {
      const reference = generateReference(REF_PREFIX.maintenanceExpense);
      const { rows: expRows } = await client.query(
        `INSERT INTO maintenance_expenses (reference, work_order_id, category, description, amount, recorded_by)
         VALUES ($1,$2,'labor',$3,$4,$5) RETURNING *`,
        [reference, id, laborDescription || "Labor cost", laborCost, req.user.id]
      );
      expense = expRows[0];
    }

    await client.query("COMMIT");
    res.json({ workOrder, expense });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =======================================================================
// Expenses
// =======================================================================

export async function listExpenses(req, res) {
  const { rows } = await pool.query(
    `SELECT e.*, w.reference AS work_order_reference, w.title AS work_order_title
     FROM maintenance_expenses e
     LEFT JOIN maintenance_work_orders w ON w.id = e.work_order_id
     ORDER BY e.expense_date DESC, e.created_at DESC`
  );
  res.json({ expenses: rows });
}

export async function createExpense(req, res) {
  const { workOrderId, category, description, amount, vendor, expenseDate } = req.body;
  if (!category || !amount) throw httpError("category and amount are required");
  const reference = generateReference(REF_PREFIX.maintenanceExpense);
  const { rows } = await pool.query(
    `INSERT INTO maintenance_expenses (reference, work_order_id, category, description, amount, vendor, expense_date, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,CURRENT_DATE),$8) RETURNING *`,
    [reference, workOrderId || null, category, description || null, amount, vendor || null, expenseDate || null, req.user.id]
  );
  res.status(201).json({ expense: rows[0] });
}

// =======================================================================
// Inspections (standalone listing — routine/safety inspections not tied
// to closing out a specific work order still get logged via addInspection
// above with work_order_id omitted... but that requires a work order id.
// Provide a direct route for asset-only routine/safety checks too.)
// =======================================================================

export async function listInspections(req, res) {
  const { rows } = await pool.query(
    `SELECT i.*, a.name AS asset_name, w.reference AS work_order_reference, u.name AS inspected_by_name
     FROM maintenance_inspections i
     LEFT JOIN maintenance_assets a ON a.id = i.asset_id
     LEFT JOIN maintenance_work_orders w ON w.id = i.work_order_id
     LEFT JOIN users u ON u.id = i.inspected_by
     ORDER BY i.inspected_at DESC`
  );
  res.json({ inspections: rows });
}

export async function createStandaloneInspection(req, res) {
  const { assetId, inspectionType, result, notes } = req.body;
  if (!assetId || !result) throw httpError("assetId and result are required");
  const { rows } = await pool.query(
    `INSERT INTO maintenance_inspections (asset_id, inspection_type, result, notes, inspected_by)
     VALUES ($1,COALESCE($2,'routine'),$3,$4,$5) RETURNING *`,
    [assetId, inspectionType, result, notes || null, req.user.id]
  );
  res.status(201).json({ inspection: rows[0] });
}

// =======================================================================
// Maintenance History — derived view of completed work, not its own
// table: every step of the workflow already lands somewhere (work order,
// parts used, inspections, expenses), so History joins them together
// rather than duplicating the data.
// =======================================================================

export async function maintenanceHistory(req, res) {
  const { rows: orders } = await pool.query(
    `SELECT w.*, a.name AS asset_name, t.name AS technician_name, c.company_name AS contractor_name,
            COALESCE(SUM(e.amount), 0)::numeric AS total_cost
     FROM maintenance_work_orders w
     LEFT JOIN maintenance_assets a ON a.id = w.asset_id
     LEFT JOIN maintenance_technicians t ON t.id = w.assigned_technician_id
     LEFT JOIN maintenance_contractors c ON c.id = w.assigned_contractor_id
     LEFT JOIN maintenance_expenses e ON e.work_order_id = w.id
     WHERE w.status = 'completed'
     GROUP BY w.id, a.name, t.name, c.name, c.company_name
     ORDER BY w.completed_at DESC`
  );
  res.json({ history: await attachWorkOrderExtras(orders) });
}

// =======================================================================
// Reports — aggregate rollups, computed on demand rather than stored.
// =======================================================================

export async function reports(req, res) {
  const [
    { rows: expenseByCategory },
    { rows: expenseByMonth },
    { rows: workOrdersByAsset },
    { rows: avgCompletionDays },
    { rows: technicianLoad },
  ] = await Promise.all([
    pool.query(`SELECT category, COALESCE(SUM(amount),0)::numeric AS total FROM maintenance_expenses GROUP BY category`),
    pool.query(
      `SELECT to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month, COALESCE(SUM(amount),0)::numeric AS total
       FROM maintenance_expenses GROUP BY 1 ORDER BY 1 DESC LIMIT 12`
    ),
    pool.query(
      `SELECT a.name AS asset_name, COUNT(w.id)::int AS work_order_count
       FROM maintenance_work_orders w JOIN maintenance_assets a ON a.id = w.asset_id
       GROUP BY a.name ORDER BY work_order_count DESC LIMIT 10`
    ),
    pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400)::numeric AS avg_days
       FROM maintenance_work_orders WHERE status = 'completed' AND completed_at IS NOT NULL`
    ),
    pool.query(
      `SELECT t.name, COUNT(w.id)::int AS completed_count
       FROM maintenance_technicians t
       LEFT JOIN maintenance_work_orders w ON w.assigned_technician_id = t.id AND w.status = 'completed'
       GROUP BY t.name ORDER BY completed_count DESC`
    ),
  ]);

  res.json({
    expenseByCategory,
    expenseByMonth,
    workOrdersByAsset,
    avgCompletionDays: avgCompletionDays[0]?.avg_days ? Number(avgCompletionDays[0].avg_days) : null,
    technicianLoad,
  });
}

// =======================================================================
// Preventive Maintenance — Asset -> Schedule -> due date -> reminder ->
// Work Order -> Maintenance -> next due date. Deliberately separate
// screen/flow from the reactive request/work-order pipeline above.
// =======================================================================

export async function listSchedules(req, res) {
  const { rows } = await pool.query(
    `SELECT s.*, a.name AS asset_name, t.name AS technician_name,
            (s.next_due_date <= CURRENT_DATE + INTERVAL '7 days') AS due_soon,
            (s.next_due_date < CURRENT_DATE) AS overdue
     FROM maintenance_schedules s
     JOIN maintenance_assets a ON a.id = s.asset_id
     LEFT JOIN maintenance_technicians t ON t.id = s.assigned_technician_id
     ORDER BY s.next_due_date ASC`
  );
  res.json({ schedules: rows });
}

export async function createSchedule(req, res) {
  const { assetId, taskName, frequencyType, frequencyValue, startDate, assignedTechnicianId, notes } = req.body;
  if (!assetId || !taskName) throw httpError("assetId and taskName are required");
  const freqType = ["days", "weeks", "months"].includes(frequencyType) ? frequencyType : "months";
  const freqValue = Number(frequencyValue) > 0 ? Number(frequencyValue) : 1;
  const nextDue = startDate || addInterval(new Date(), freqType, freqValue);

  const { rows } = await pool.query(
    `INSERT INTO maintenance_schedules (asset_id, task_name, frequency_type, frequency_value, next_due_date, assigned_technician_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [assetId, taskName, freqType, freqValue, nextDue, assignedTechnicianId || null, notes || null]
  );
  res.status(201).json({ schedule: rows[0] });
}

export async function updateSchedule(req, res) {
  const { id } = req.params;
  const { taskName, frequencyType, frequencyValue, assignedTechnicianId, status, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE maintenance_schedules SET
       task_name = COALESCE($1, task_name), frequency_type = COALESCE($2, frequency_type),
       frequency_value = COALESCE($3, frequency_value), assigned_technician_id = COALESCE($4, assigned_technician_id),
       status = COALESCE($5, status), notes = COALESCE($6, notes)
     WHERE id = $7 RETURNING *`,
    [taskName, frequencyType, frequencyValue, assignedTechnicianId, status, notes, id]
  );
  if (!rows[0]) throw httpError("Schedule not found", 404);
  res.json({ schedule: rows[0] });
}

// Automatic Reminder — the HOD portal calls this on load (or a cron could
// later); it just flags schedules due within 7 days as reminded, it
// doesn't need to actually send email/SMS to be useful as an in-app flag.
export async function runReminderCheck(req, res) {
  const { rows } = await pool.query(
    `UPDATE maintenance_schedules SET reminder_sent_at = now()
     WHERE status = 'active' AND next_due_date <= CURRENT_DATE + INTERVAL '7 days' AND reminder_sent_at IS NULL
     RETURNING *`
  );
  res.json({ remindersSent: rows.length, schedules: rows });
}

// Generates the Work Order for a due schedule — the flow's "-> Work
// Order" step. next_due_date only rolls forward once that order is
// completed (see completeWorkOrder above), not at generation time.
export async function generateWorkOrderFromSchedule(req, res) {
  const { id } = req.params;
  const { priority } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: schedRows } = await client.query(
      `SELECT s.*, a.name AS asset_name FROM maintenance_schedules s
       JOIN maintenance_assets a ON a.id = s.asset_id WHERE s.id = $1`,
      [id]
    );
    if (!schedRows[0]) throw httpError("Schedule not found", 404);
    const schedule = schedRows[0];

    const reference = generateReference(REF_PREFIX.workOrder);
    const { rows: woRows } = await client.query(
      `INSERT INTO maintenance_work_orders
         (reference, asset_id, schedule_id, source, title, description, priority, assigned_technician_id, created_by)
       VALUES ($1,$2,$3,'preventive',$4,$5,COALESCE($6,'medium'),$7,$8) RETURNING *`,
      [
        reference,
        schedule.asset_id,
        schedule.id,
        `Preventive maintenance: ${schedule.task_name}`,
        `Scheduled preventive task for ${schedule.asset_name}.`,
        priority,
        schedule.assigned_technician_id,
        req.user.id,
      ]
    );
    await client.query("COMMIT");
    res.status(201).json({ workOrder: woRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
