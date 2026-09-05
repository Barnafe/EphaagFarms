import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";

// ---------------------------------------------------------------------
// Procurement Department — "Purchasing" pipeline. See the migration
// comment above the table definitions for how this differs from the
// existing produce-sourcing `/api/procurement` pipeline. One admin role
// performs every step today (no separate department logins exist), so
// each "approval" here is a single admin-actioned transition — same
// pattern as Production/Store depts, not a multi-approver chain like
// Loans. Every transition is logged to `purchase_request_history` inside
// the same transaction as the status change, per the dispute-defense
// audit pattern established for loans.
// ---------------------------------------------------------------------

async function logTransition(client, requestId, fromStatus, toStatus, actorId, note) {
  await client.query(
    `INSERT INTO purchase_request_history (request_id, from_status, to_status, actor_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [requestId, fromStatus || null, toStatus, actorId || null, note || null]
  );
}

async function notifyAdmins(subject, html) {
  const { rows } = await pool.query(`SELECT email FROM users WHERE role_type = 'admin' AND email IS NOT NULL`);
  for (const { email } of rows) {
    sendMail({ to: email, subject, html }).catch(() => {});
  }
}

function assertStatus(request, expected, actionLabel) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(request.status)) {
    throw Object.assign(
      new Error(`Cannot ${actionLabel} — request is currently '${request.status}', expected '${allowed.join("' or '")}'`),
      { status: 400 }
    );
  }
}

// --- Suppliers (external vendor directory) ---------------------------------

export async function listSuppliers(req, res) {
  const { rows } = await pool.query("SELECT * FROM suppliers ORDER BY name ASC");
  res.json({ suppliers: rows });
}

export async function createSupplier(req, res) {
  const { name, contactPerson, phone, email, address, category, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const { rows } = await pool.query(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, category, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, contactPerson || null, phone || null, email || null, address || null, category || "goods", notes || null]
  );
  res.status(201).json({ supplier: rows[0] });
}

export async function updateSupplier(req, res) {
  const { id } = req.params;
  const { name, contactPerson, phone, email, address, category, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE suppliers SET
       name = COALESCE($1, name), contact_person = COALESCE($2, contact_person),
       phone = COALESCE($3, phone), email = COALESCE($4, email),
       address = COALESCE($5, address), category = COALESCE($6, category),
       notes = COALESCE($7, notes)
     WHERE id = $8 RETURNING *`,
    [name, contactPerson, phone, email, address, category, notes, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Supplier not found" });
  res.json({ supplier: rows[0] });
}

// --- Purchase requests: read side -------------------------------------------

async function attachRequestDetail(request) {
  const [items, quotations, po, payments, invoice, history] = await Promise.all([
    pool.query("SELECT * FROM purchase_request_items WHERE request_id = $1 ORDER BY description ASC", [request.id]),
    pool.query(
      `SELECT q.*, s.name AS supplier_name FROM supplier_quotations q
       JOIN suppliers s ON s.id = q.supplier_id WHERE q.request_id = $1 ORDER BY q.amount ASC`,
      [request.id]
    ),
    pool.query(
      `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id WHERE po.request_id = $1`,
      [request.id]
    ),
    pool.query("SELECT * FROM procurement_payments WHERE request_id = $1 ORDER BY created_at ASC", [request.id]),
    pool.query("SELECT * FROM supplier_invoices WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1", [request.id]),
    pool.query(
      `SELECT h.*, u.name AS actor_name FROM purchase_request_history h
       LEFT JOIN users u ON u.id = h.actor_id WHERE h.request_id = $1 ORDER BY h.created_at ASC`,
      [request.id]
    ),
  ]);
  return {
    ...request,
    items: items.rows,
    quotations: quotations.rows,
    purchaseOrder: po.rows[0] || null,
    payments: payments.rows,
    invoice: invoice.rows[0] || null,
    history: history.rows,
  };
}

export async function listRequests(req, res) {
  const { status } = req.query;
  const { rows } = await pool.query(
    status
      ? `SELECT pr.*, u.name AS requester_name FROM purchase_requests pr
         JOIN users u ON u.id = pr.requested_by WHERE pr.status = $1 ORDER BY pr.created_at DESC`
      : `SELECT pr.*, u.name AS requester_name FROM purchase_requests pr
         JOIN users u ON u.id = pr.requested_by ORDER BY pr.created_at DESC`,
    status ? [status] : []
  );
  res.json({ requests: rows });
}

export async function getRequest(req, res) {
  const { rows } = await pool.query(
    `SELECT pr.*, u.name AS requester_name FROM purchase_requests pr
     JOIN users u ON u.id = pr.requested_by WHERE pr.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Purchase request not found" });
  res.json({ request: await attachRequestDetail(rows[0]) });
}

// --- Stage 1: Department raises a Purchase Request --------------------------

export async function createRequest(req, res) {
  const { department, title, justification, neededBy, items } = req.body;
  if (!department || !title) return res.status(400).json({ error: "department and title are required" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array of { description, quantity, unit?, estimatedUnitPrice? }" });
  }
  for (const it of items) {
    if (!it.description || !it.quantity || Number(it.quantity) <= 0) {
      return res.status(400).json({ error: "Each item needs a description and a positive quantity" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = generateReference(REF_PREFIX.purchaseRequest);
    const { rows } = await client.query(
      `INSERT INTO purchase_requests (reference, department, requested_by, title, justification, needed_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [reference, department, req.user.id, title, justification || null, neededBy || null]
    );
    const request = rows[0];
    for (const it of items) {
      await client.query(
        `INSERT INTO purchase_request_items (request_id, description, quantity, unit, estimated_unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [request.id, it.description, it.quantity, it.unit || null, it.estimatedUnitPrice || null]
      );
    }
    await logTransition(client, request.id, null, "pending_approval", req.user.id, "Purchase request submitted");
    await client.query("COMMIT");
    notifyAdmins(
      `Purchase request ${reference} needs verification`,
      `<p>"${request.title}" from ${request.department} is awaiting need verification.</p>`
    );
    res.status(201).json({ request: await attachRequestDetail(request) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not create purchase request" });
  } finally {
    client.release();
  }
}

// --- Stage 2: Approval / need verification ----------------------------------

export async function approveRequest(req, res) {
  await transitionRequest(req, res, {
    fromStatuses: ["pending_approval"],
    toStatus: "approved",
    actionLabel: "verify this request's need",
    extraSql: `approval_note = $2, approved_by = $3, approved_at = now()`,
    extraParams: (note) => [note || null, req.user.id],
  });
}

export async function rejectRequest(req, res) {
  await transitionRequest(req, res, {
    fromStatuses: ["pending_approval"],
    toStatus: "rejected",
    actionLabel: "reject this request",
    extraSql: `approval_note = $2, approved_by = $3, approved_at = now()`,
    extraParams: (note) => [note || null, req.user.id],
  });
}

export async function cancelRequest(req, res) {
  await transitionRequest(req, res, {
    fromStatuses: ["pending_approval", "approved", "sourcing", "po_pending_approval"],
    toStatus: "cancelled",
    actionLabel: "cancel this request",
  });
}

// Generic single-column status transition helper — covers the plain
// stage-advance actions (approve/reject/cancel/mark-delivered) so each
// only has to declare its allowed from-states and the SQL for any extra
// columns it sets.
async function transitionRequest(req, res, { fromStatuses, toStatus, actionLabel, extraSql, extraParams }) {
  const { note } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [
      req.params.id,
    ]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], fromStatuses, actionLabel);

    const extra = extraParams ? extraParams(note) : [];
    const idPlaceholder = `$${extra.length + 2}`;
    const params = [toStatus, ...extra, req.params.id];
    const { rows } = await client.query(
      `UPDATE purchase_requests SET status = $1${extraSql ? ", " + extraSql : ""} WHERE id = ${idPlaceholder} RETURNING *`,
      params
    );
    await logTransition(client, req.params.id, current[0].status, toStatus, req.user.id, note);
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not update purchase request" });
  } finally {
    client.release();
  }
}

// --- Stage 3: Supplier sourcing / RFQ / quotations ---------------------------

export async function addQuotation(req, res) {
  const { id } = req.params;
  const { supplierId, amount, validUntil, notes } = req.body;
  if (!supplierId || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "supplierId and a positive amount are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["approved", "sourcing"], "record a quotation for");

    const { rows: quoteRows } = await client.query(
      `INSERT INTO supplier_quotations (request_id, supplier_id, amount, valid_until, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, supplierId, amount, validUntil || null, notes || null, req.user.id]
    );

    if (current[0].status === "approved") {
      await client.query("UPDATE purchase_requests SET status = 'sourcing' WHERE id = $1", [id]);
      await logTransition(client, id, "approved", "sourcing", req.user.id, "First quotation received");
    }

    await client.query("COMMIT");
    res.status(201).json({ quotation: quoteRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not record quotation" });
  } finally {
    client.release();
  }
}

// --- Stage 4/5: Quotation comparison -> Supplier selection -> Purchase Order

export async function selectSupplier(req, res) {
  const { id } = req.params;
  const { quotationId } = req.body;
  if (!quotationId) return res.status(400).json({ error: "quotationId is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["sourcing"], "select a supplier for");

    const { rows: quoteRows } = await client.query(
      "SELECT * FROM supplier_quotations WHERE id = $1 AND request_id = $2",
      [quotationId, id]
    );
    if (!quoteRows[0]) throw Object.assign(new Error("Quotation not found for this request"), { status: 400 });

    await client.query("UPDATE supplier_quotations SET status = 'selected' WHERE id = $1", [quotationId]);
    await client.query(
      "UPDATE supplier_quotations SET status = 'rejected' WHERE request_id = $1 AND id != $2 AND status = 'received'",
      [id, quotationId]
    );
    const { rows } = await client.query(
      `UPDATE purchase_requests SET selected_supplier_id = $1, selected_quotation_id = $2 WHERE id = $3 RETURNING *`,
      [quoteRows[0].supplier_id, quotationId, id]
    );
    await logTransition(client, id, "sourcing", "sourcing", req.user.id, "Supplier selected from quotations");
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not select supplier" });
  } finally {
    client.release();
  }
}

export async function createPurchaseOrder(req, res) {
  const { id } = req.params;
  const { items } = req.body; // [{ description, quantity, unit, unitPrice }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array of { description, quantity, unitPrice }" });
  }
  let totalAmount = 0;
  const lineItems = items.map((it) => {
    const qty = Number(it.quantity);
    const unitPrice = Number(it.unitPrice);
    if (!it.description || !qty || qty <= 0 || unitPrice == null || unitPrice < 0) {
      throw Object.assign(new Error("Each PO item needs description, positive quantity, and a unitPrice"), { status: 400 });
    }
    const lineTotal = qty * unitPrice;
    totalAmount += lineTotal;
    return { description: it.description, quantity: qty, unit: it.unit || null, unitPrice, lineTotal };
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["sourcing"], "raise a purchase order for");
    if (!current[0].selected_supplier_id) {
      throw Object.assign(new Error("Select a supplier before raising a purchase order"), { status: 400 });
    }

    const poReference = generateReference(REF_PREFIX.purchaseOrder);
    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders (request_id, po_reference, supplier_id, quotation_id, items, total_amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, poReference, current[0].selected_supplier_id, current[0].selected_quotation_id, JSON.stringify(lineItems), totalAmount, req.user.id]
    );
    const { rows } = await client.query(
      "UPDATE purchase_requests SET status = 'po_pending_approval' WHERE id = $1 RETURNING *",
      [id]
    );
    await logTransition(client, id, "sourcing", "po_pending_approval", req.user.id, `Purchase order ${poReference} raised`);
    await client.query("COMMIT");
    notifyAdmins(
      `Purchase order ${poReference} awaiting approval`,
      `<p>PO for "${current[0].title}" (₦${totalAmount.toLocaleString()}) is awaiting approval.</p>`
    );
    res.status(201).json({ request: await attachRequestDetail(rows[0]), purchaseOrder: poRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not raise purchase order" });
  } finally {
    client.release();
  }
}

// --- Stage 6: PO approval ----------------------------------------------------

export async function decidePurchaseOrder(req, res) {
  const { id } = req.params; // purchase order id
  const { decision, note } = req.body; // 'approve' | 'reject'
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: poRows } = await client.query("SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE", [id]);
    if (!poRows[0]) throw Object.assign(new Error("Purchase order not found"), { status: 404 });
    if (poRows[0].status !== "pending_approval") {
      throw Object.assign(new Error(`Purchase order already ${poRows[0].status}`), { status: 400 });
    }

    const poStatus = decision === "approve" ? "approved" : "rejected";
    await client.query(
      "UPDATE purchase_orders SET status = $1, approved_by = $2, approved_at = now() WHERE id = $3",
      [poStatus, req.user.id, id]
    );

    const requestStatus = decision === "approve" ? "po_approved" : "sourcing";
    const { rows } = await client.query(
      "UPDATE purchase_requests SET status = $1 WHERE id = $2 RETURNING *",
      [requestStatus, poRows[0].request_id]
    );
    await logTransition(
      client,
      poRows[0].request_id,
      "po_pending_approval",
      requestStatus,
      req.user.id,
      note || `Purchase order ${decision}d`
    );
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not decide on purchase order" });
  } finally {
    client.release();
  }
}

// --- Stage 7: Finance — payment / financial authorization -------------------

export async function authorizeInitialPayment(req, res) {
  await recordPayment(req, res, {
    type: "initial",
    fromStatus: "po_approved",
    toStatus: "awaiting_delivery",
    label: "Initial payment / financial authorization released",
  });
}

// --- Stage 9: Final payment (after invoice verification) --------------------

export async function recordFinalPayment(req, res) {
  await recordPayment(req, res, {
    type: "final",
    fromStatus: "final_payment_pending",
    toStatus: "completed",
    label: "Final payment recorded — procurement completed",
    onComplete: (client, id) => client.query("UPDATE purchase_requests SET completed_at = now() WHERE id = $1", [id]),
  });
}

async function recordPayment(req, res, { type, fromStatus, toStatus, label, onComplete }) {
  const { id } = req.params;
  const { amount, reference, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "A positive amount is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], [fromStatus], `record a ${type} payment for`);

    const { rows: poRows } = await client.query("SELECT id FROM purchase_orders WHERE request_id = $1", [id]);
    const { rows: paymentRows } = await client.query(
      `INSERT INTO procurement_payments (request_id, po_id, type, amount, status, reference, notes, paid_by, paid_at)
       VALUES ($1,$2,$3,$4,'paid',$5,$6,$7, now()) RETURNING *`,
      [id, poRows[0]?.id || null, type, amount, reference || null, notes || null, req.user.id]
    );

    await client.query("UPDATE purchase_requests SET status = $1 WHERE id = $2", [toStatus, id]);
    if (onComplete) await onComplete(client, id);
    const { rows } = await client.query("SELECT * FROM purchase_requests WHERE id = $1", [id]);
    await logTransition(client, id, fromStatus, toStatus, req.user.id, notes || label);
    await client.query("COMMIT");
    res.status(201).json({ request: await attachRequestDetail(rows[0]), payment: paymentRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not record payment" });
  } finally {
    client.release();
  }
}

// --- Stage 8: Supplier delivery ---------------------------------------------

export async function markDelivered(req, res) {
  await transitionRequest(req, res, {
    fromStatuses: ["awaiting_delivery"],
    toStatus: "delivered",
    actionLabel: "mark this request as delivered",
    extraSql: `delivered_at = now()`,
  });
}

// --- Stage 8b: Goods / service verification, with the dispute branch --------

export async function verifyGoods(req, res) {
  const { id } = req.params;
  const { result, note } = req.body; // 'correct' | 'wrong' | 'damaged' | 'incomplete'
  if (!["correct", "wrong", "damaged", "incomplete"].includes(result)) {
    return res.status(400).json({ error: "result must be one of correct, wrong, damaged, incomplete" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["delivered"], "verify goods for");

    const toStatus = result === "correct" ? "goods_received" : "goods_disputed";
    const { rows } = await client.query(
      `UPDATE purchase_requests SET
         status = $1, goods_verified_by = $2, goods_verified_at = now(),
         goods_verification_result = $3, verification_note = $4,
         dispute_reason = $5,
         goods_received_at = CASE WHEN $1 = 'goods_received' THEN now() ELSE goods_received_at END
       WHERE id = $6 RETURNING *`,
      [toStatus, req.user.id, result, note || null, result !== "correct" ? note || result : null, id]
    );
    await logTransition(client, id, "delivered", toStatus, req.user.id, note || `Goods verification: ${result}`);
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not record goods verification" });
  } finally {
    client.release();
  }
}

// --- Return / Dispute resolution (loops back to delivery, or cancels) -------

export async function resolveDispute(req, res) {
  const { id } = req.params;
  const { action, note } = req.body; // 'redeliver' | 'cancel'
  if (!["redeliver", "cancel"].includes(action)) {
    return res.status(400).json({ error: "action must be 'redeliver' or 'cancel'" });
  }
  await transitionRequest(req, res, {
    fromStatuses: ["goods_disputed"],
    toStatus: action === "redeliver" ? "awaiting_delivery" : "cancelled",
    actionLabel: "resolve this dispute",
  });
}

// --- Stage: Invoice verification --------------------------------------------

export async function recordInvoice(req, res) {
  const { id } = req.params;
  const { invoiceNumber, amount, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "A positive amount is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["goods_received"], "record a supplier invoice for");

    const { rows: poRows } = await client.query("SELECT id FROM purchase_orders WHERE request_id = $1", [id]);
    const { rows: invoiceRows } = await client.query(
      `INSERT INTO supplier_invoices (request_id, po_id, invoice_number, amount)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, poRows[0]?.id || null, invoiceNumber || null, amount]
    );
    const { rows } = await client.query(
      "UPDATE purchase_requests SET status = 'invoice_verification' WHERE id = $1 RETURNING *",
      [id]
    );
    await logTransition(client, id, "goods_received", "invoice_verification", req.user.id, notes || "Supplier invoice recorded");
    await client.query("COMMIT");
    res.status(201).json({ request: await attachRequestDetail(rows[0]), invoice: invoiceRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not record invoice" });
  } finally {
    client.release();
  }
}

export async function verifyInvoice(req, res) {
  const { id } = req.params; // request id
  const { note } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["invoice_verification"], "verify the invoice for");

    const { rows: invoiceRows } = await client.query(
      "SELECT * FROM supplier_invoices WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [id]
    );
    if (!invoiceRows[0]) throw Object.assign(new Error("No invoice recorded for this request yet"), { status: 400 });
    await client.query(
      "UPDATE supplier_invoices SET verified = TRUE, verified_by = $1, verified_at = now(), verification_note = $2 WHERE id = $3",
      [req.user.id, note || null, invoiceRows[0].id]
    );
    const { rows } = await client.query(
      "UPDATE purchase_requests SET status = 'final_payment_pending' WHERE id = $1 RETURNING *",
      [id]
    );
    await logTransition(client, id, "invoice_verification", "final_payment_pending", req.user.id, note || "Invoice verified");
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not verify invoice" });
  } finally {
    client.release();
  }
}
