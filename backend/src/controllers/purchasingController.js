import { pool, detached } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendFileRef, discardFileRef } from "../utils/fileRefs.js";
import { PURCHASE_DEPARTMENTS, budgetStatus, wouldExceed, checkBudgetAlerts, notifyRole } from "../services/budgets.js";
import { WAITING_FOR, roleOf } from "../middleware/purchasingRoles.js";

// ---------------------------------------------------------------------
// Procurement Department, "Purchasing" pipeline. See the migration
// comment above the table definitions for how this differs from the
// existing produce-sourcing `/api/procurement` pipeline. One admin role
// performs every step today (no separate department logins exist), so
// each "approval" here is a single admin-actioned transition, same
// pattern as Production/Store depts, not a multi-approver chain like
// Loans. Every transition is logged to `purchase_request_history` inside
// the same transaction as the status change, per the dispute-defense
// audit pattern established for loans.
// ---------------------------------------------------------------------

async function logTransition(client, requestId, fromStatus, toStatus, actorId, note, actorRole) {
  await client.query(
    `INSERT INTO purchase_request_history (request_id, from_status, to_status, actor_id, note, actor_role)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [requestId, fromStatus || null, toStatus, actorId || null, note || null, actorRole || null]
  );
}

// Tell the right role (not every admin) that something is waiting for them.
const WHAT = {
  Procurement: "Verify the need, collect quotations, or handle the delivery.",
  Finance: "Authorise a payment, check an invoice, or decide on a budget.",
  CEO: "Approve or reject the purchase order.",
};
// Background work (messages, budget alerts) runs outside the request's connection tracking: it must never wait on, or
// be counted against, the database connection a request still holds.
const bg = (fn) => detached(() => Promise.resolve().then(fn).catch((e) => console.error("[purchasing] background task failed:", e.message)));
function tellRole(role, request, what) {
  bg(() => notifyRole(role, "purchase_awaiting", {
    reference: request.reference, title: request.title, department: request.department, role, what: what || WHAT[role],
  }));
}
const withoutFile = (row) => { const { file_url, ...rest } = row; return { ...rest, hasFile: !!file_url, fileName: row.file_name || null }; };

function assertStatus(request, expected, actionLabel) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(request.status)) {
    throw Object.assign(
      new Error(`Cannot ${actionLabel}, request is currently '${request.status}', expected '${allowed.join("' or '")}'`),
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

async function attachRequestDetail(request, runner = pool) {
  // One after another: a single connection (a held `client`) can only run one query at a time.
  const items = await runner.query("SELECT * FROM purchase_request_items WHERE request_id = $1 ORDER BY description ASC", [request.id]);
  const quotations = await runner.query(
    `SELECT q.*, s.name AS supplier_name FROM supplier_quotations q
     JOIN suppliers s ON s.id = q.supplier_id WHERE q.request_id = $1 ORDER BY q.amount ASC`, [request.id]);
  const po = await runner.query(
    `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id WHERE po.request_id = $1 ORDER BY po.created_at DESC LIMIT 1`, [request.id]);
  const payments = await runner.query("SELECT * FROM procurement_payments WHERE request_id = $1 ORDER BY created_at ASC", [request.id]);
  const invoice = await runner.query("SELECT * FROM supplier_invoices WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1", [request.id]);
  const history = await runner.query(
    `SELECT h.*, u.name AS actor_name FROM purchase_request_history h
     LEFT JOIN users u ON u.id = h.actor_id WHERE h.request_id = $1 ORDER BY h.created_at ASC`, [request.id]);
  return {
    ...request,
    items: items.rows,
    quotations: quotations.rows.map(withoutFile),
    purchaseOrder: po.rows[0] || null,
    payments: payments.rows,
    invoice: invoice.rows[0] ? withoutFile(invoice.rows[0]) : null,
    waitingFor: WAITING_FOR[request.status] || null,
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
  res.json({ requests: rows.map((r) => ({ ...r, waitingFor: WAITING_FOR[r.status] || null })) });
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
  if (!PURCHASE_DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: `department must be one of: ${PURCHASE_DEPARTMENTS.join(", ")}` });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array of { description, quantity, unit?, estimatedUnitPrice? }" });
  }
  for (const it of items) {
    if (!it.description || !it.quantity || Number(it.quantity) <= 0) {
      return res.status(400).json({ error: "Each item needs a description and a positive quantity" });
    }
  }

  const who = await roleOf(req.user.id);
  req.purchasingRole = who.isMain ? "Main admin" : who.role || "Admin";
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
    await logTransition(client, request.id, null, "pending_approval", req.user.id, "Purchase request submitted", req.purchasingRole);
    await client.query("COMMIT");
    tellRole("Procurement", request, "Verify that the need is real, then approve or reject it.");
    res.status(201).json({ request: await attachRequestDetail(request, client) });
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

// Generic single-column status transition helper, covers the plain
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
    await logTransition(client, req.params.id, current[0].status, toStatus, req.user.id, note, req.purchasingRole);
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0], client) });
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
  const dropFile = () => { if (req.file) discardFileRef(req.file.filename); };
  if (!supplierId || !amount || Number(amount) <= 0) {
    dropFile();
    return res.status(400).json({ error: "supplierId and a positive amount are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["approved", "sourcing"], "record a quotation for");

    const { rows: quoteRows } = await client.query(
      `INSERT INTO supplier_quotations (request_id, supplier_id, amount, valid_until, notes, created_by, file_url, file_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, supplierId, amount, validUntil || null, notes || null, req.user.id, req.file?.filename || null, req.file?.originalname || null]
    );

    if (current[0].status === "approved") {
      await client.query("UPDATE purchase_requests SET status = 'sourcing' WHERE id = $1", [id]);
      await logTransition(client, id, "approved", "sourcing", req.user.id, "First quotation received", req.purchasingRole);
    }

    await client.query("COMMIT");
    res.status(201).json({ quotation: withoutFile(quoteRows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    dropFile();
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
    if (!quoteRows[0].file_url) {
      throw Object.assign(new Error("Attach the supplier's quotation document before selecting this supplier."), { status: 400, code: "ATTACHMENT_REQUIRED" });
    }

    await client.query("UPDATE supplier_quotations SET status = 'selected' WHERE id = $1", [quotationId]);
    await client.query(
      "UPDATE supplier_quotations SET status = 'rejected' WHERE request_id = $1 AND id != $2 AND status = 'received'",
      [id, quotationId]
    );
    const { rows } = await client.query(
      `UPDATE purchase_requests SET selected_supplier_id = $1, selected_quotation_id = $2 WHERE id = $3 RETURNING *`,
      [quoteRows[0].supplier_id, quotationId, id]
    );
    await logTransition(client, id, "sourcing", "sourcing", req.user.id, "Supplier selected from quotations", req.purchasingRole);
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0], client) });
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

    // Budget gate: when this department's annual budget is used up (or this purchase would overrun it), the
    // purchase order waits for Finance's approval before it can go to the CEO.
    const budget = await wouldExceed(current[0].department, totalAmount, new Date().getUTCFullYear(), client);
    const held = budget.exceeds;
    const poReference = generateReference(REF_PREFIX.purchaseOrder);
    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders (request_id, po_reference, supplier_id, quotation_id, items, total_amount, created_by, budget_exceeded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, poReference, current[0].selected_supplier_id, current[0].selected_quotation_id, JSON.stringify(lineItems), totalAmount, req.user.id, held]
    );
    const nextStatus = held ? "budget_approval_pending" : "po_pending_approval";
    const { rows } = await client.query("UPDATE purchase_requests SET status = $2 WHERE id = $1 RETURNING *", [id, nextStatus]);
    await logTransition(client, id, "sourcing", nextStatus, req.user.id,
      held ? `Purchase order ${poReference} raised; over the ${current[0].department} budget (left: ₦${Math.max(0, budget.remaining).toLocaleString()}), waiting for Finance` : `Purchase order ${poReference} raised`,
      req.purchasingRole);
    await client.query("COMMIT");
    if (held) {
      bg(() => notifyRole("Finance", "purchase_budget_hold", {
        reference: rows[0].reference, title: rows[0].title, department: rows[0].department, total: totalAmount, remaining: Math.max(0, budget.remaining), year: budget.year,
      }));
    } else {
      tellRole("CEO", rows[0]);
    }
    res.status(201).json({ request: await attachRequestDetail(rows[0], client), purchaseOrder: poRows[0], onHold: held });
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
    const { rows: held } = await client.query("SELECT status FROM purchase_requests WHERE id = $1 FOR UPDATE", [poRows[0].request_id]);
    if (held[0].status === "budget_approval_pending") {
      throw Object.assign(new Error("This order is over its department's budget. Finance must decide on the budget first."), { status: 409 });
    }

    if (decision === "approve" && !poRows[0].budget_override_by) {
      // Budgets are checked again here: other orders may have been approved since this one was raised.
      const { rows: reqRows } = await client.query("SELECT department FROM purchase_requests WHERE id = $1", [poRows[0].request_id]);
      const b = await wouldExceed(reqRows[0].department, poRows[0].total_amount, new Date().getUTCFullYear(), client);
      if (b.exceeds) {
        await client.query("UPDATE purchase_orders SET budget_exceeded = TRUE WHERE id = $1", [id]);
        await client.query("UPDATE purchase_requests SET status = 'budget_approval_pending' WHERE id = $1", [poRows[0].request_id]);
        await logTransition(client, poRows[0].request_id, "po_pending_approval", "budget_approval_pending", req.user.id,
          `Over the ${reqRows[0].department} budget at approval time, sent to Finance`, req.purchasingRole);
        await client.query("COMMIT");
        const { rows: r2 } = await client.query("SELECT * FROM purchase_requests WHERE id = $1", [poRows[0].request_id]);
        bg(() => notifyRole("Finance", "purchase_budget_hold", { reference: r2[0].reference, title: r2[0].title, department: r2[0].department, total: Number(poRows[0].total_amount), remaining: Math.max(0, b.remaining), year: b.year }));
        return res.status(409).json({ error: `The ${reqRows[0].department} budget has been used up since this order was raised. It has been sent to Finance for a budget decision first.`, code: "BUDGET_HOLD" });
      }
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
    , req.purchasingRole);
    await client.query("COMMIT");
    if (decision === "approve") {
      bg(() => checkBudgetAlerts(rows[0].department));
      tellRole("Finance", rows[0], "The purchase order is approved: authorise the initial payment.");
    }
    res.json({ request: await attachRequestDetail(rows[0], client) });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* already finished */ }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not decide on purchase order" });
  } finally {
    client.release();
  }
}

// --- Stage 7: Finance, payment / financial authorization -------------------

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
    label: "Final payment recorded, procurement completed",
    requireInvoiceFile: true,
    onComplete: (client, id) => client.query("UPDATE purchase_requests SET completed_at = now() WHERE id = $1", [id]),
  });
}

async function recordPayment(req, res, { type, fromStatus, toStatus, label, onComplete, requireInvoiceFile }) {
  const { id } = req.params;
  const { amount, reference, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "A positive amount is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], [fromStatus], `record a ${type} payment for`);
    if (requireInvoiceFile) {
      const { rows: inv } = await client.query("SELECT file_url FROM supplier_invoices WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1", [id]);
      if (!inv[0]?.file_url) throw Object.assign(new Error("The supplier's invoice document must be attached before the final payment."), { status: 400, code: "ATTACHMENT_REQUIRED" });
    }

    const { rows: poRows } = await client.query("SELECT id FROM purchase_orders WHERE request_id = $1 AND status <> 'rejected' ORDER BY created_at DESC LIMIT 1", [id]);
    const { rows: paymentRows } = await client.query(
      `INSERT INTO procurement_payments (request_id, po_id, type, amount, status, reference, notes, paid_by, paid_at)
       VALUES ($1,$2,$3,$4,'paid',$5,$6,$7, now()) RETURNING *`,
      [id, poRows[0]?.id || null, type, amount, reference || null, notes || null, req.user.id]
    );

    await client.query("UPDATE purchase_requests SET status = $1 WHERE id = $2", [toStatus, id]);
    if (onComplete) await onComplete(client, id);
    const { rows } = await client.query("SELECT * FROM purchase_requests WHERE id = $1", [id]);
    await logTransition(client, id, fromStatus, toStatus, req.user.id, notes || label, req.purchasingRole);
    await client.query("COMMIT");
    res.status(201).json({ request: await attachRequestDetail(rows[0], client), payment: paymentRows[0] });
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
    await logTransition(client, id, "delivered", toStatus, req.user.id, note || `Goods verification: ${result}`, req.purchasingRole);
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0], client) });
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
  const dropFile = () => { if (req.file) discardFileRef(req.file.filename); };
  if (!amount || Number(amount) <= 0) { dropFile(); return res.status(400).json({ error: "A positive amount is required" }); }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(current[0], ["goods_received"], "record a supplier invoice for");

    const { rows: poRows } = await client.query("SELECT id FROM purchase_orders WHERE request_id = $1 AND status <> 'rejected' ORDER BY created_at DESC LIMIT 1", [id]);
    const { rows: invoiceRows } = await client.query(
      `INSERT INTO supplier_invoices (request_id, po_id, invoice_number, amount, file_url, file_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, poRows[0]?.id || null, invoiceNumber || null, amount, req.file?.filename || null, req.file?.originalname || null]
    );
    const { rows } = await client.query(
      "UPDATE purchase_requests SET status = 'invoice_verification' WHERE id = $1 RETURNING *",
      [id]
    );
    await logTransition(client, id, "goods_received", "invoice_verification", req.user.id, notes || "Supplier invoice recorded", req.purchasingRole);
    await client.query("COMMIT");
    res.status(201).json({ request: await attachRequestDetail(rows[0], client), invoice: withoutFile(invoiceRows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    dropFile();
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
    if (!invoiceRows[0].file_url) {
      throw Object.assign(new Error("Attach the supplier's invoice document before verifying it."), { status: 400, code: "ATTACHMENT_REQUIRED" });
    }
    await client.query(
      "UPDATE supplier_invoices SET verified = TRUE, verified_by = $1, verified_at = now(), verification_note = $2 WHERE id = $3",
      [req.user.id, note || null, invoiceRows[0].id]
    );
    const { rows } = await client.query(
      "UPDATE purchase_requests SET status = 'final_payment_pending' WHERE id = $1 RETURNING *",
      [id]
    );
    await logTransition(client, id, "invoice_verification", "final_payment_pending", req.user.id, note || "Invoice verified", req.purchasingRole);
    await client.query("COMMIT");
    res.json({ request: await attachRequestDetail(rows[0], client) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not verify invoice" });
  } finally {
    client.release();
  }
}


// --- Attachments (Phase 10): quotation before selecting a supplier, invoice before final payment ---------------------

async function setFile(req, res, { table, where, whereParams, statuses, label }) {
  const drop = () => { if (req.file) discardFileRef(req.file.filename); };
  if (!req.file) return res.status(400).json({ error: "Attach the document (a PDF or a photo)." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: cur } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!cur[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(cur[0], statuses, `attach a ${label} to`);
    const { rows: old } = await client.query(`SELECT id, file_url FROM ${table} WHERE ${where}`, whereParams(req));
    if (!old[0]) throw Object.assign(new Error(`${label[0].toUpperCase()}${label.slice(1)} not found for this request`), { status: 404 });
    await client.query(`UPDATE ${table} SET file_url = $1, file_name = $2 WHERE id = $3`, [req.file.filename, req.file.originalname || null, old[0].id]);
    await logTransition(client, req.params.id, cur[0].status, cur[0].status, req.user.id, `${label} document attached`, req.purchasingRole);
    await client.query("COMMIT");
    if (old[0].file_url) discardFileRef(old[0].file_url);
    res.json({ request: await attachRequestDetail(cur[0], client) });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* done */ }
    drop();
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not attach the document" });
  } finally { client.release(); }
}

export async function attachQuotationFile(req, res) {
  await setFile(req, res, { table: "supplier_quotations", where: "id = $1 AND request_id = $2", whereParams: (r) => [r.params.qid, r.params.id], statuses: ["approved", "sourcing"], label: "quotation" });
}
export async function attachInvoiceFile(req, res) {
  await setFile(req, res, {
    table: "supplier_invoices", where: "id = (SELECT id FROM supplier_invoices WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1)",
    whereParams: (r) => [r.params.id], statuses: ["invoice_verification"], label: "invoice",
  });
}

async function sendDoc(res, sql, params, fallbackName) {
  const { rows } = await pool.query(sql, params);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (!rows[0].file_url) return res.status(404).json({ error: "No document has been attached yet" });
  await sendFileRef(res, rows[0].file_url, { download: true, filename: rows[0].file_name || fallbackName });
}
export async function downloadQuotationFile(req, res) {
  await sendDoc(res, "SELECT file_url, file_name FROM supplier_quotations WHERE id = $1 AND request_id = $2", [req.params.qid, req.params.id], "quotation");
}
export async function downloadInvoiceFile(req, res) {
  await sendDoc(res, "SELECT file_url, file_name FROM supplier_invoices WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1", [req.params.id], "invoice");
}

// --- Budgets (Phase 10) -------------------------------------------------------------------------------------------------

export async function myPurchasingRole(req, res) {
  const { role, isMain } = await roleOf(req.user.id);
  res.json({ role: isMain ? "Main admin" : role, isMain, canActAs: isMain ? ["Procurement", "Finance", "CEO"] : ["Procurement", "Finance", "CEO"].filter((r) => r === role) });
}

export async function listBudgets(req, res) {
  const y = Number(req.query.year) || new Date().getUTCFullYear();
  const budgets = [];
  for (const d of PURCHASE_DEPARTMENTS) budgets.push(await budgetStatus(d, y));
  res.json({ year: y, budgets });
}

export async function setBudget(req, res) {
  const { department } = req.params;
  if (!PURCHASE_DEPARTMENTS.includes(department)) return res.status(404).json({ error: "Unknown department" });
  const y = Number(req.body?.year) || new Date().getUTCFullYear();
  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  const warn = req.body?.warnAtPercent === undefined || req.body?.warnAtPercent === "" ? 80 : Number(req.body.warnAtPercent);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "The budget must be a number, 0 or more." });
  if (!Number.isInteger(warn) || warn < 1 || warn > 100) return res.status(400).json({ error: "The warning level must be a whole number from 1 to 100 (percent used)." });
  if (y < 2020 || y > 2100) return res.status(400).json({ error: "Choose a valid year." });
  await pool.query(
    `INSERT INTO department_budgets (year, department, amount, warn_at_percent, set_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (year, department) DO UPDATE SET amount = EXCLUDED.amount, warn_at_percent = EXCLUDED.warn_at_percent, set_by = EXCLUDED.set_by, updated_at = now()`,
    [y, department, amount, warn, req.user.id]);
  const status = await checkBudgetAlerts(department, y);
  res.json({ budget: status });
}

// Finance decides on a purchase order that is over its department's budget.
export async function budgetDecision(req, res) {
  const { decision, note } = req.body || {};
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
  if (!String(note || "").trim()) return res.status(400).json({ error: "Write a note explaining your budget decision." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: cur } = await client.query("SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!cur[0]) throw Object.assign(new Error("Purchase request not found"), { status: 404 });
    assertStatus(cur[0], ["budget_approval_pending"], "decide the budget for");
    const { rows: po } = await client.query("SELECT * FROM purchase_orders WHERE request_id = $1 FOR UPDATE", [req.params.id]);
    if (decision === "approve") {
      await client.query("UPDATE purchase_orders SET budget_override_by = $2, budget_override_at = now(), budget_override_note = $3 WHERE id = $1", [po[0].id, req.user.id, note]);
    } else {
      await client.query("UPDATE purchase_orders SET status = 'rejected' WHERE id = $1", [po[0].id]);
    }
    const next = decision === "approve" ? "po_pending_approval" : "sourcing";
    const { rows } = await client.query("UPDATE purchase_requests SET status = $2 WHERE id = $1 RETURNING *", [req.params.id, next]);
    await logTransition(client, req.params.id, "budget_approval_pending", next, req.user.id, `Budget ${decision}d: ${note}`, req.purchasingRole);
    await client.query("COMMIT");
    if (decision === "approve") tellRole("CEO", rows[0]);
    res.json({ request: await attachRequestDetail(rows[0], client) });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* done */ }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not record the budget decision" });
  } finally { client.release(); }
}
