import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// Posts a ledger row and keeps finance_accounts.current_balance in sync.
// Runs inside the caller's own client/transaction when one is passed
// (transfers need that — two account balances must move together);
// otherwise runs its own single-statement writes against the pool,
// matching the rest of this codebase's convention of only reaching for
// an explicit BEGIN/COMMIT when more than one write must be atomic.
async function postTransaction(runner, { txnType, amount, accountId, transferToAccountId, department, description, relatedTable, relatedId, recordedBy }) {
  const reference = generateReference(REF_PREFIX.financeTransaction);
  const { rows } = await runner.query(
    `INSERT INTO finance_transactions
       (reference, txn_type, amount, account_id, transfer_to_account_id, department, description, related_table, related_id, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [reference, txnType, amount, accountId || null, transferToAccountId || null, department || null, description || null, relatedTable || null, relatedId || null, recordedBy || null]
  );

  if (accountId) {
    const delta = txnType === "expense" || txnType === "payment" ? -amount : amount;
    await runner.query(`UPDATE finance_accounts SET current_balance = current_balance + $1 WHERE id = $2`, [delta, accountId]);
  }
  if (txnType === "transfer" && transferToAccountId) {
    await runner.query(`UPDATE finance_accounts SET current_balance = current_balance + $1 WHERE id = $2`, [amount, transferToAccountId]);
  }
  return rows[0];
}

// =======================================================================
// 1. Finance Dashboard
// =======================================================================

export async function dashboardSummary(req, res) {
  const [
    { rows: cash },
    { rows: revenue },
    { rows: expenseTotal },
    { rows: receivableTotal },
    { rows: payableTotal },
    { rows: pendingRequests },
    { rows: pendingPayments },
    { rows: budgets },
    { rows: deptSpend },
    { rows: recentTxns },
    { rows: alerts },
  ] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(current_balance),0)::numeric AS total FROM finance_accounts WHERE status = 'active'`),
    pool.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM finance_income WHERE date_trunc('month', received_at) = date_trunc('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM finance_expenses WHERE date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(amount - amount_received),0)::numeric AS total FROM finance_receivables WHERE status != 'paid'`),
    pool.query(`SELECT COALESCE(SUM(amount - amount_paid),0)::numeric AS total FROM finance_payables WHERE status != 'paid'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM finance_requests WHERE status = 'pending'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM finance_payments WHERE status IN ('requested','verified','authorized','scheduled')`),
    pool.query(`SELECT COALESCE(SUM(allocated_amount),0)::numeric AS allocated, COALESCE(SUM(spent_amount),0)::numeric AS spent FROM finance_budgets WHERE status = 'active'`),
    pool.query(`SELECT department, COALESCE(SUM(amount),0)::numeric AS total FROM finance_expenses WHERE department IS NOT NULL AND date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE) GROUP BY department ORDER BY total DESC`),
    pool.query(`SELECT * FROM finance_transactions ORDER BY transacted_at DESC LIMIT 10`),
    pool.query(`SELECT * FROM finance_alerts WHERE is_read = FALSE ORDER BY created_at DESC LIMIT 10`),
  ]);

  res.json({
    cashPosition: Number(cash[0].total),
    monthToDateRevenue: Number(revenue[0].total),
    monthToDateExpenses: Number(expenseTotal[0].total),
    accountsReceivable: Number(receivableTotal[0].total),
    accountsPayable: Number(payableTotal[0].total),
    pendingRequests: pendingRequests[0].count,
    pendingApprovals: pendingRequests[0].count,
    pendingPayments: pendingPayments[0].count,
    budgetAllocated: Number(budgets[0].allocated),
    budgetSpent: Number(budgets[0].spent),
    budgetUtilization: Number(budgets[0].allocated) > 0 ? Number(budgets[0].spent) / Number(budgets[0].allocated) : 0,
    departmentSpending: deptSpend,
    recentTransactions: recentTxns,
    financialAlerts: alerts,
  });
}

// Scans current data for alert-worthy conditions and files any not
// already open — run on-demand from the Alerts panel rather than a
// background job, to keep this build self-contained.
export async function scanAlerts(req, res) {
  const created = [];

  const { rows: lowAccounts } = await pool.query(
    `SELECT * FROM finance_accounts WHERE status = 'active' AND current_balance < 50000`
  );
  for (const a of lowAccounts) {
    const { rows } = await pool.query(
      `INSERT INTO finance_alerts (alert_type, severity, message, related_table, related_id)
       SELECT 'low_cash_balance','warning',$1,'finance_accounts',$2
       WHERE NOT EXISTS (
         SELECT 1 FROM finance_alerts WHERE alert_type = 'low_cash_balance' AND related_id = $2 AND is_read = FALSE
       ) RETURNING *`,
      [`${a.name} balance is low: ₦${Number(a.current_balance).toLocaleString()}`, a.id]
    );
    created.push(...rows);
  }

  const { rows: overBudgets } = await pool.query(
    `SELECT * FROM finance_budgets WHERE status = 'active' AND spent_amount > allocated_amount`
  );
  for (const b of overBudgets) {
    const { rows } = await pool.query(
      `INSERT INTO finance_alerts (alert_type, severity, message, related_table, related_id)
       SELECT 'budget_exceeded','critical',$1,'finance_budgets',$2
       WHERE NOT EXISTS (
         SELECT 1 FROM finance_alerts WHERE alert_type = 'budget_exceeded' AND related_id = $2 AND is_read = FALSE
       ) RETURNING *`,
      [`Budget "${b.name}" is over allocation (₦${Number(b.spent_amount).toLocaleString()} of ₦${Number(b.allocated_amount).toLocaleString()})`, b.id]
    );
    created.push(...rows);
  }

  const { rows: overdueInvoices } = await pool.query(
    `SELECT * FROM finance_receivables WHERE status != 'paid' AND due_date < CURRENT_DATE`
  );
  for (const r of overdueInvoices) {
    const { rows } = await pool.query(
      `INSERT INTO finance_alerts (alert_type, severity, message, related_table, related_id)
       SELECT 'overdue_invoice','warning',$1,'finance_receivables',$2
       WHERE NOT EXISTS (
         SELECT 1 FROM finance_alerts WHERE alert_type = 'overdue_invoice' AND related_id = $2 AND is_read = FALSE
       ) RETURNING *`,
      [`Invoice ${r.reference} from ${r.customer_name} is overdue`, r.id]
    );
    created.push(...rows);
  }

  res.json({ created: created.length, alerts: created });
}

export async function listAlerts(req, res) {
  const { unreadOnly } = req.query;
  const { rows } = await pool.query(
    `SELECT * FROM finance_alerts ${unreadOnly === "true" ? "WHERE is_read = FALSE" : ""} ORDER BY created_at DESC LIMIT 200`
  );
  res.json({ alerts: rows });
}

export async function markAlertRead(req, res) {
  const { rows } = await pool.query(`UPDATE finance_alerts SET is_read = TRUE WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) throw httpError("Alert not found", 404);
  res.json({ alert: rows[0] });
}

// =======================================================================
// 2. Financial Requests
// =======================================================================

export async function listRequests(req, res) {
  const { status, department, mine } = req.query;
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`fr.status = $${params.length}`); }
  if (department) { params.push(department); clauses.push(`fr.department = $${params.length}`); }
  if (mine === "true") { params.push(req.user.id); clauses.push(`fr.requester_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT fr.*, u.name AS requester_name, b.name AS budget_name
     FROM finance_requests fr
     LEFT JOIN users u ON u.id = fr.requester_id
     LEFT JOIN finance_budgets b ON b.id = fr.budget_id
     ${where} ORDER BY fr.created_at DESC`,
    params
  );
  res.json({ requests: rows });
}

export async function getRequest(req, res) {
  const { id } = req.params;
  const [{ rows: reqRows }, { rows: docs }, { rows: approvals }] = await Promise.all([
    pool.query(
      `SELECT fr.*, u.name AS requester_name, b.name AS budget_name
       FROM finance_requests fr
       LEFT JOIN users u ON u.id = fr.requester_id
       LEFT JOIN finance_budgets b ON b.id = fr.budget_id
       WHERE fr.id = $1`,
      [id]
    ),
    pool.query(`SELECT * FROM finance_request_documents WHERE request_id = $1 ORDER BY created_at DESC`, [id]),
    pool.query(
      `SELECT fa.*, u.name AS approver_name FROM finance_approvals fa
       LEFT JOIN users u ON u.id = fa.approver_id WHERE fa.request_id = $1 ORDER BY fa.decided_at ASC`,
      [id]
    ),
  ]);
  if (!reqRows[0]) throw httpError("Request not found", 404);
  res.json({ request: reqRows[0], documents: docs, approvalHistory: approvals });
}

export async function createRequest(req, res) {
  const { department, category, budgetId, amount, purpose } = req.body;
  if (!department || !amount || !purpose) throw httpError("department, amount and purpose are required");
  const reference = generateReference(REF_PREFIX.financeRequest);
  const { rows } = await pool.query(
    `INSERT INTO finance_requests (reference, requester_id, department, category, budget_id, amount, purpose)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [reference, req.user.id, department, category || null, budgetId || null, amount, purpose]
  );
  res.status(201).json({ request: rows[0] });
}

export async function addRequestDocument(req, res) {
  const { id } = req.params;
  const { filePath, fileName } = req.body;
  if (!filePath || !fileName) throw httpError("filePath and fileName are required");
  const { rows } = await pool.query(
    `INSERT INTO finance_request_documents (request_id, file_path, file_name, uploaded_by)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, filePath, fileName, req.user.id]
  );
  res.status(201).json({ document: rows[0] });
}

// =======================================================================
// 3. Approval Center
// =======================================================================

export async function listPendingApprovals(req, res) {
  const { rows } = await pool.query(
    `SELECT fr.*, u.name AS requester_name FROM finance_requests fr
     LEFT JOIN users u ON u.id = fr.requester_id
     WHERE fr.status = 'pending' ORDER BY fr.created_at ASC`
  );
  res.json({ requests: rows });
}

// decision: approved | rejected | returned | clarification_requested | escalated
export async function decideRequest(req, res) {
  const { id } = req.params;
  const { decision, comment } = req.body;
  const valid = ["approved", "rejected", "returned", "clarification_requested", "escalated"];
  if (!valid.includes(decision)) throw httpError(`decision must be one of: ${valid.join(", ")}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: reqRows } = await client.query(`SELECT * FROM finance_requests WHERE id = $1 FOR UPDATE`, [id]);
    const request = reqRows[0];
    if (!request) throw httpError("Request not found", 404);

    await client.query(
      `INSERT INTO finance_approvals (request_id, approver_id, step_order, decision, comment)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, req.user.id, request.current_step, decision, comment || null]
    );

    let newStatus = request.status;
    let nextStep = request.current_step;
    if (decision === "approved") { newStatus = "approved"; }
    else if (decision === "rejected") { newStatus = "rejected"; }
    else if (decision === "returned") { newStatus = "returned"; }
    else if (decision === "escalated") { nextStep = request.current_step + 1; newStatus = "pending"; }
    // clarification_requested leaves status/step untouched — it's a note, not a state change.

    const { rows: updated } = await client.query(
      `UPDATE finance_requests SET status = $1, current_step = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [newStatus, nextStep, id]
    );

    if (decision === "approved" && request.budget_id) {
      await client.query(`UPDATE finance_budgets SET spent_amount = spent_amount + $1 WHERE id = $2`, [request.amount, request.budget_id]);
    }

    await client.query("COMMIT");
    res.json({ request: updated[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listApprovalHistory(req, res) {
  const { rows } = await pool.query(
    `SELECT fa.*, fr.reference AS request_reference, fr.purpose, u.name AS approver_name
     FROM finance_approvals fa
     JOIN finance_requests fr ON fr.id = fa.request_id
     LEFT JOIN users u ON u.id = fa.approver_id
     ORDER BY fa.decided_at DESC LIMIT 200`
  );
  res.json({ approvals: rows });
}

export async function listApprovalRules(req, res) {
  const { rows } = await pool.query(`SELECT * FROM finance_approval_rules ORDER BY step_order ASC, min_amount ASC`);
  res.json({ rules: rows });
}

export async function createApprovalRule(req, res) {
  const { stepOrder, minAmount, maxAmount, department, requiredRole } = req.body;
  if (!stepOrder || !requiredRole) throw httpError("stepOrder and requiredRole are required");
  const { rows } = await pool.query(
    `INSERT INTO finance_approval_rules (step_order, min_amount, max_amount, department, required_role)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [stepOrder, minAmount || 0, maxAmount || null, department || null, requiredRole]
  );
  res.status(201).json({ rule: rows[0] });
}

// =======================================================================
// 4. Budget Management
// =======================================================================

export async function listBudgets(req, res) {
  const { budgetType, department, status } = req.query;
  const clauses = [];
  const params = [];
  if (budgetType) { params.push(budgetType); clauses.push(`budget_type = $${params.length}`); }
  if (department) { params.push(department); clauses.push(`department = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM finance_budgets ${where} ORDER BY created_at DESC`, params);
  res.json({ budgets: rows });
}

export async function createBudget(req, res) {
  const { budgetType, name, department, projectRef, periodStart, periodEnd, allocatedAmount } = req.body;
  if (!name || !periodStart || !periodEnd) throw httpError("name, periodStart and periodEnd are required");
  const reference = generateReference(REF_PREFIX.financeBudget);
  const { rows } = await pool.query(
    `INSERT INTO finance_budgets (reference, budget_type, name, department, project_ref, period_start, period_end, allocated_amount, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [reference, budgetType || "department", name, department || null, projectRef || null, periodStart, periodEnd, allocatedAmount || 0, req.user.id]
  );
  res.status(201).json({ budget: rows[0] });
}

export async function updateBudget(req, res) {
  const { id } = req.params;
  const { name, status, allocatedAmount, periodEnd } = req.body;
  const { rows } = await pool.query(
    `UPDATE finance_budgets SET
       name = COALESCE($1, name), status = COALESCE($2, status),
       allocated_amount = COALESCE($3, allocated_amount), period_end = COALESCE($4, period_end)
     WHERE id = $5 RETURNING *`,
    [name, status, allocatedAmount, periodEnd, id]
  );
  if (!rows[0]) throw httpError("Budget not found", 404);
  res.json({ budget: rows[0] });
}

export async function adjustBudget(req, res) {
  const { id } = req.params;
  const { amount, reason } = req.body;
  if (!amount || !reason) throw httpError("amount and reason are required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO finance_budget_adjustments (budget_id, amount, reason, adjusted_by) VALUES ($1,$2,$3,$4)`,
      [id, amount, reason, req.user.id]
    );
    const { rows } = await client.query(
      `UPDATE finance_budgets SET allocated_amount = allocated_amount + $1 WHERE id = $2 RETURNING *`,
      [amount, id]
    );
    if (!rows[0]) throw httpError("Budget not found", 404);
    await client.query("COMMIT");
    res.json({ budget: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listBudgetAdjustments(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT ba.*, u.name AS adjusted_by_name FROM finance_budget_adjustments ba
     LEFT JOIN users u ON u.id = ba.adjusted_by WHERE ba.budget_id = $1 ORDER BY ba.created_at DESC`,
    [id]
  );
  res.json({ adjustments: rows });
}

export async function budgetVsActual(req, res) {
  const { rows } = await pool.query(
    `SELECT id, reference, name, budget_type, department, allocated_amount, spent_amount,
            (allocated_amount - spent_amount) AS variance
     FROM finance_budgets WHERE status = 'active' ORDER BY department NULLS LAST, name`
  );
  res.json({ budgets: rows });
}

// =======================================================================
// 5. Income / Revenue
// =======================================================================

export async function listIncome(req, res) {
  const { source, from, to } = req.query;
  const clauses = [];
  const params = [];
  if (source) { params.push(source); clauses.push(`source = $${params.length}`); }
  if (from) { params.push(from); clauses.push(`received_at >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`received_at <= $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM finance_income ${where} ORDER BY received_at DESC`, params);
  res.json({ income: rows });
}

export async function createIncome(req, res) {
  const { source, category, amount, description, receivedFrom, accountId, receivedAt } = req.body;
  if (!amount) throw httpError("amount is required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = generateReference(REF_PREFIX.financeIncome);
    const { rows } = await client.query(
      `INSERT INTO finance_income (reference, source, category, amount, description, received_from, account_id, received_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,CURRENT_DATE),$9) RETURNING *`,
      [reference, source || "other", category || null, amount, description || null, receivedFrom || null, accountId || null, receivedAt || null, req.user.id]
    );
    await postTransaction(client, {
      txnType: "income", amount, accountId, department: null, description: description || `Income ${reference}`,
      relatedTable: "finance_income", relatedId: rows[0].id, recordedBy: req.user.id,
    });
    await client.query("COMMIT");
    res.status(201).json({ income: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =======================================================================
// 6. Expense Management
// =======================================================================

export async function listExpenses(req, res) {
  const { department, category, verified } = req.query;
  const clauses = [];
  const params = [];
  if (department) { params.push(department); clauses.push(`department = $${params.length}`); }
  if (category) { params.push(category); clauses.push(`category = $${params.length}`); }
  if (verified != null) { params.push(verified === "true"); clauses.push(`verified = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM finance_expenses ${where} ORDER BY expense_date DESC`, params);
  res.json({ expenses: rows });
}

export async function createExpense(req, res) {
  const { category, department, description, amount, employeeId, budgetId, requestId, accountId, expenseDate, receiptPath } = req.body;
  if (!description || !amount) throw httpError("description and amount are required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = generateReference(REF_PREFIX.financeExpense);
    const { rows } = await client.query(
      `INSERT INTO finance_expenses (reference, category, department, description, amount, employee_id, budget_id, request_id, account_id, receipt_path, expense_date, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,CURRENT_DATE),$12) RETURNING *`,
      [reference, category || "operational", department || null, description, amount, employeeId || null, budgetId || null, requestId || null, accountId || null, receiptPath || null, expenseDate || null, req.user.id]
    );
    if (budgetId) {
      await client.query(`UPDATE finance_budgets SET spent_amount = spent_amount + $1 WHERE id = $2`, [amount, budgetId]);
    }
    await postTransaction(client, {
      txnType: "expense", amount, accountId, department, description: description,
      relatedTable: "finance_expenses", relatedId: rows[0].id, recordedBy: req.user.id,
    });
    await client.query("COMMIT");
    res.status(201).json({ expense: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyExpense(req, res) {
  const { rows } = await pool.query(`UPDATE finance_expenses SET verified = TRUE WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) throw httpError("Expense not found", 404);
  res.json({ expense: rows[0] });
}

// =======================================================================
// 7. Accounts Payable
// =======================================================================

function payableStatus(amount, amountPaid, dueDate) {
  if (amountPaid >= amount) return "paid";
  if (amountPaid > 0) return "partially_paid";
  if (dueDate && new Date(dueDate) < new Date()) return "overdue";
  return "outstanding";
}

export async function listPayables(req, res) {
  const { status, payeeType } = req.query;
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (payeeType) { params.push(payeeType); clauses.push(`payee_type = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM finance_payables ${where} ORDER BY due_date ASC NULLS LAST`, params);
  res.json({ payables: rows });
}

export async function createPayable(req, res) {
  const { payeeType, payeeName, invoiceNumber, amount, department, dueDate, notes } = req.body;
  if (!payeeName || !amount) throw httpError("payeeName and amount are required");
  const reference = generateReference(REF_PREFIX.payable);
  const { rows } = await pool.query(
    `INSERT INTO finance_payables (reference, payee_type, payee_name, invoice_number, amount, department, due_date, notes, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [reference, payeeType || "supplier", payeeName, invoiceNumber || null, amount, department || null, dueDate || null, notes || null, payableStatus(amount, 0, dueDate), req.user.id]
  );
  res.status(201).json({ payable: rows[0] });
}

export async function recordPayableSettlement(req, res) {
  const { id } = req.params;
  const { amount } = req.body;
  if (!amount) throw httpError("amount is required");
  const { rows: existing } = await pool.query(`SELECT * FROM finance_payables WHERE id = $1`, [id]);
  if (!existing[0]) throw httpError("Payable not found", 404);
  const newPaid = Number(existing[0].amount_paid) + Number(amount);
  const status = payableStatus(Number(existing[0].amount), newPaid, existing[0].due_date);
  const { rows } = await pool.query(
    `UPDATE finance_payables SET amount_paid = $1, status = $2 WHERE id = $3 RETURNING *`,
    [newPaid, status, id]
  );
  res.json({ payable: rows[0] });
}

// =======================================================================
// 8. Accounts Receivable
// =======================================================================

function receivableStatus(amount, amountReceived, dueDate) {
  if (amountReceived >= amount) return "paid";
  if (amountReceived > 0) return "partial";
  if (dueDate && new Date(dueDate) < new Date()) return "overdue";
  return "outstanding";
}

export async function listReceivables(req, res) {
  const { status } = req.query;
  const params = [];
  let where = "";
  if (status) { params.push(status); where = `WHERE status = $1`; }
  const { rows } = await pool.query(`SELECT * FROM finance_receivables ${where} ORDER BY due_date ASC NULLS LAST`, params);
  res.json({ receivables: rows });
}

export async function createReceivable(req, res) {
  const { customerName, invoiceNumber, amount, dueDate, notes } = req.body;
  if (!customerName || !amount) throw httpError("customerName and amount are required");
  const reference = generateReference(REF_PREFIX.receivable);
  const { rows } = await pool.query(
    `INSERT INTO finance_receivables (reference, customer_name, invoice_number, amount, due_date, notes, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [reference, customerName, invoiceNumber || null, amount, dueDate || null, notes || null, receivableStatus(amount, 0, dueDate), req.user.id]
  );
  res.status(201).json({ receivable: rows[0] });
}

export async function recordReceivablePayment(req, res) {
  const { id } = req.params;
  const { amount, accountId } = req.body;
  if (!amount) throw httpError("amount is required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existing } = await client.query(`SELECT * FROM finance_receivables WHERE id = $1 FOR UPDATE`, [id]);
    if (!existing[0]) throw httpError("Receivable not found", 404);
    const newReceived = Number(existing[0].amount_received) + Number(amount);
    const status = receivableStatus(Number(existing[0].amount), newReceived, existing[0].due_date);
    const { rows } = await client.query(
      `UPDATE finance_receivables SET amount_received = $1, status = $2 WHERE id = $3 RETURNING *`,
      [newReceived, status, id]
    );
    await postTransaction(client, {
      txnType: "income", amount, accountId, description: `Receivable payment ${existing[0].reference}`,
      relatedTable: "finance_receivables", relatedId: id, recordedBy: req.user.id,
    });
    await client.query("COMMIT");
    res.json({ receivable: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =======================================================================
// 9. Payment Management
// =======================================================================

export async function listPayments(req, res) {
  const { status, paymentType } = req.query;
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (paymentType) { params.push(paymentType); clauses.push(`payment_type = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM finance_payments ${where} ORDER BY created_at DESC`, params);
  res.json({ payments: rows });
}

export async function createPayment(req, res) {
  const { paymentType, payableId, receivableId, requestId, amount, method, accountId, scheduledDate } = req.body;
  if (!amount) throw httpError("amount is required");
  const reference = generateReference(REF_PREFIX.financePayment);
  const { rows } = await pool.query(
    `INSERT INTO finance_payments (reference, payment_type, payable_id, receivable_id, request_id, amount, method, account_id, scheduled_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [reference, paymentType || "payable", payableId || null, receivableId || null, requestId || null, amount, method || null, accountId || null, scheduledDate || null, req.user.id]
  );
  res.status(201).json({ payment: rows[0] });
}

const PAYMENT_TRANSITIONS = ["requested", "verified", "authorized", "scheduled", "processing", "completed", "failed", "cancelled"];

export async function updatePaymentStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  if (!PAYMENT_TRANSITIONS.includes(status)) throw httpError(`status must be one of: ${PAYMENT_TRANSITIONS.join(", ")}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existing } = await client.query(`SELECT * FROM finance_payments WHERE id = $1 FOR UPDATE`, [id]);
    const payment = existing[0];
    if (!payment) throw httpError("Payment not found", 404);

    const { rows } = await client.query(
      `UPDATE finance_payments SET status = $1, processed_at = CASE WHEN $1 = 'completed' THEN now() ELSE processed_at END WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (status === "completed") {
      await postTransaction(client, {
        txnType: "payment", amount: payment.amount, accountId: payment.account_id,
        description: `Payment ${payment.reference}`, relatedTable: "finance_payments", relatedId: id, recordedBy: req.user.id,
      });
      if (payment.payable_id) {
        const { rows: pRows } = await client.query(`SELECT * FROM finance_payables WHERE id = $1`, [payment.payable_id]);
        if (pRows[0]) {
          const newPaid = Number(pRows[0].amount_paid) + Number(payment.amount);
          await client.query(`UPDATE finance_payables SET amount_paid = $1, status = $2 WHERE id = $3`, [
            newPaid, payableStatus(Number(pRows[0].amount), newPaid, pRows[0].due_date), payment.payable_id,
          ]);
        }
      }
    }

    await client.query("COMMIT");
    res.json({ payment: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =======================================================================
// 10. Bank & Cash Management
// =======================================================================

export async function listAccounts(req, res) {
  const { rows } = await pool.query(`SELECT * FROM finance_accounts ORDER BY created_at DESC`);
  res.json({ accounts: rows });
}

export async function createAccount(req, res) {
  const { name, accountType, accountNumber, bankName, currency, openingBalance } = req.body;
  if (!name) throw httpError("name is required");
  const reference = generateReference(REF_PREFIX.financeAccount);
  const opening = Number(openingBalance || 0);
  const { rows } = await pool.query(
    `INSERT INTO finance_accounts (name, account_type, account_number, bank_name, currency, opening_balance, current_balance, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
    [name, accountType || "bank", accountNumber || null, bankName || null, currency || "NGN", opening, req.user.id]
  );
  res.status(201).json({ account: rows[0], reference });
}

export async function depositToAccount(req, res) {
  const { id } = req.params;
  const { amount, description } = req.body;
  if (!amount) throw httpError("amount is required");
  const txn = await postTransaction(pool, {
    txnType: "income", amount, accountId: id, description: description || "Deposit", recordedBy: req.user.id,
  });
  res.status(201).json({ transaction: txn });
}

export async function withdrawFromAccount(req, res) {
  const { id } = req.params;
  const { amount, description } = req.body;
  if (!amount) throw httpError("amount is required");
  const txn = await postTransaction(pool, {
    txnType: "expense", amount, accountId: id, description: description || "Withdrawal", recordedBy: req.user.id,
  });
  res.status(201).json({ transaction: txn });
}

export async function transferBetweenAccounts(req, res) {
  const { fromAccountId, toAccountId, amount, description } = req.body;
  if (!fromAccountId || !toAccountId || !amount) throw httpError("fromAccountId, toAccountId and amount are required");
  if (fromAccountId === toAccountId) throw httpError("fromAccountId and toAccountId must differ");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txn = await postTransaction(client, {
      txnType: "transfer", amount, accountId: fromAccountId, transferToAccountId: toAccountId,
      description: description || "Inter-account transfer", recordedBy: req.user.id,
    });
    await client.query("COMMIT");
    res.status(201).json({ transaction: txn });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =======================================================================
// 11. Department Financial Monitoring
// =======================================================================

export async function departmentMonitoring(req, res) {
  const [{ rows: spending }, { rows: budgets }] = await Promise.all([
    pool.query(
      `SELECT department, COALESCE(SUM(amount),0)::numeric AS total_spent, COUNT(*)::int AS expense_count
       FROM finance_expenses WHERE department IS NOT NULL GROUP BY department ORDER BY total_spent DESC`
    ),
    pool.query(
      `SELECT department, COALESCE(SUM(allocated_amount),0)::numeric AS allocated, COALESCE(SUM(spent_amount),0)::numeric AS spent
       FROM finance_budgets WHERE department IS NOT NULL AND status = 'active' GROUP BY department`
    ),
  ]);
  res.json({ spendingByDepartment: spending, budgetsByDepartment: budgets });
}

// =======================================================================
// 12. Financial Transactions
// =======================================================================

export async function listTransactions(req, res) {
  const { txnType, department, from, to } = req.query;
  const clauses = [];
  const params = [];
  if (txnType) { params.push(txnType); clauses.push(`txn_type = $${params.length}`); }
  if (department) { params.push(department); clauses.push(`department = $${params.length}`); }
  if (from) { params.push(from); clauses.push(`transacted_at >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`transacted_at <= $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM finance_transactions ${where} ORDER BY transacted_at DESC LIMIT 500`, params);
  res.json({ transactions: rows });
}

export async function verifyTransaction(req, res) {
  const { rows } = await pool.query(`UPDATE finance_transactions SET verified = TRUE WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) throw httpError("Transaction not found", 404);
  res.json({ transaction: rows[0] });
}

// =======================================================================
// 13. Invoices & Documents
// =======================================================================

export async function listDocuments(req, res) {
  const { docType } = req.query;
  const params = [];
  let where = "";
  if (docType) { params.push(docType); where = `WHERE doc_type = $1`; }
  const { rows } = await pool.query(`SELECT * FROM finance_documents ${where} ORDER BY created_at DESC`, params);
  res.json({ documents: rows });
}

export async function createDocument(req, res) {
  const { docType, reference, relatedTable, relatedId, filePath, fileName, amount } = req.body;
  if (!docType || !filePath || !fileName) throw httpError("docType, filePath and fileName are required");
  const { rows } = await pool.query(
    `INSERT INTO finance_documents (doc_type, reference, related_table, related_id, file_path, file_name, amount, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [docType, reference || null, relatedTable || null, relatedId || null, filePath, fileName, amount || null, req.user.id]
  );
  res.status(201).json({ document: rows[0] });
}

// =======================================================================
// 14. Reconciliation
// =======================================================================

export async function listReconciliations(req, res) {
  const { reconType } = req.query;
  const params = [];
  let where = "";
  if (reconType) { params.push(reconType); where = `WHERE recon_type = $1`; }
  const { rows } = await pool.query(`SELECT * FROM finance_reconciliations ${where} ORDER BY created_at DESC`, params);
  res.json({ reconciliations: rows });
}

export async function createReconciliation(req, res) {
  const { reconType, accountId, department, periodStart, periodEnd, statementBalance } = req.body;
  if (!periodStart || !periodEnd) throw httpError("periodStart and periodEnd are required");
  const reference = generateReference(REF_PREFIX.reconciliation);

  let bookBalance = null;
  if (accountId) {
    const { rows } = await pool.query(`SELECT current_balance FROM finance_accounts WHERE id = $1`, [accountId]);
    bookBalance = rows[0] ? Number(rows[0].current_balance) : null;
  }
  const status = statementBalance != null && bookBalance != null
    ? (Number(statementBalance) === bookBalance ? "matched" : "unmatched")
    : "in_progress";

  const { rows } = await pool.query(
    `INSERT INTO finance_reconciliations (reference, recon_type, account_id, department, period_start, period_end, statement_balance, book_balance, status, reconciled_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [reference, reconType || "bank", accountId || null, department || null, periodStart, periodEnd, statementBalance ?? null, bookBalance, status, req.user.id]
  );
  res.status(201).json({ reconciliation: rows[0] });
}

export async function updateReconciliation(req, res) {
  const { id } = req.params;
  const { status, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE finance_reconciliations SET status = COALESCE($1, status), notes = COALESCE($2, notes) WHERE id = $3 RETURNING *`,
    [status, notes, id]
  );
  if (!rows[0]) throw httpError("Reconciliation not found", 404);
  res.json({ reconciliation: rows[0] });
}

// =======================================================================
// 16. Financial Reports
// =======================================================================

export async function incomeStatement(req, res) {
  const { from, to } = req.query;
  const start = from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const end = to || new Date().toISOString().slice(0, 10);
  const [{ rows: income }, { rows: expenses }] = await Promise.all([
    pool.query(`SELECT source, COALESCE(SUM(amount),0)::numeric AS total FROM finance_income WHERE received_at BETWEEN $1 AND $2 GROUP BY source`, [start, end]),
    pool.query(`SELECT category, COALESCE(SUM(amount),0)::numeric AS total FROM finance_expenses WHERE expense_date BETWEEN $1 AND $2 GROUP BY category`, [start, end]),
  ]);
  const totalIncome = income.reduce((s, r) => s + Number(r.total), 0);
  const totalExpense = expenses.reduce((s, r) => s + Number(r.total), 0);
  res.json({ period: { start, end }, income, expenses, totalIncome, totalExpense, netProfit: totalIncome - totalExpense });
}

export async function cashPositionReport(req, res) {
  const { rows } = await pool.query(`SELECT id, name, account_type, currency, current_balance FROM finance_accounts WHERE status = 'active' ORDER BY current_balance DESC`);
  const total = rows.reduce((s, r) => s + Number(r.current_balance), 0);
  res.json({ accounts: rows, totalCash: total });
}

export async function payablesReceivablesReport(req, res) {
  const [{ rows: payables }, { rows: receivables }] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount - amount_paid),0)::numeric AS outstanding FROM finance_payables GROUP BY status`),
    pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount - amount_received),0)::numeric AS outstanding FROM finance_receivables GROUP BY status`),
  ]);
  res.json({ payables, receivables });
}

// =======================================================================
// 17. Audit & Compliance
// =======================================================================

export async function listAuditLog(req, res) {
  const { entityTable } = req.query;
  const params = [];
  let where = "";
  if (entityTable) { params.push(entityTable); where = `WHERE entity_table = $1`; }
  const { rows } = await pool.query(
    `SELECT al.*, u.name AS actor_name FROM finance_audit_log al
     LEFT JOIN users u ON u.id = al.actor_id ${where} ORDER BY al.created_at DESC LIMIT 300`,
    params
  );
  res.json({ auditLog: rows });
}

// =======================================================================
// 19. Finance Settings (also covers 18. approval-side of Users & Permissions,
// since role assignment itself lives in the existing admin-positions module)
// =======================================================================

export async function listSettings(req, res) {
  const { category } = req.query;
  const params = [];
  let where = "";
  if (category) { params.push(category); where = `WHERE category = $1`; }
  const { rows } = await pool.query(`SELECT * FROM finance_settings ${where} ORDER BY category, key`, params);
  res.json({ settings: rows });
}

export async function upsertSetting(req, res) {
  const { category, key, value } = req.body;
  if (!category || !key) throw httpError("category and key are required");
  const { rows } = await pool.query(
    `INSERT INTO finance_settings (category, key, value, updated_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (category, key) DO UPDATE SET value = $3, updated_by = $4, updated_at = now()
     RETURNING *`,
    [category, key, JSON.stringify(value ?? {}), req.user.id]
  );
  res.json({ setting: rows[0] });
}
