// Phase 12: Finance decides a running cost (a Maintenance cost or a Transport cost) that was held because it would
// overrun the department budget. Approved costs start to count against the budget; rejected ones never do.
import { pool, detached } from "../db/pool.js";
import { checkBudgetAlerts } from "./budgets.js";

const TABLES = { maintenance_expenses: "Maintenance", vehicle_expenses: "Transport" };

const fail = (status, message, clientCode) => Object.assign(new Error(message), { status, clientCode });

export async function decideHeldCost(table, id, { decision, note }, userId, roleLabel) {
  const department = TABLES[table];
  if (!department) throw fail(500, "Unknown cost table");
  if (!["approve", "reject"].includes(decision)) throw fail(400, "decision must be approve or reject");
  const text = String(note || "").trim();
  if (text.length < 5) throw fail(400, "Write a short reason (at least 5 characters) for your decision");
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw fail(404, "Cost not found");
  const { rows } = await pool.query(
    `UPDATE ${table} SET budget_status = $1, budget_note = $2, decided_by = $3, decided_at = now()
      WHERE id = $4 AND budget_status = 'held' RETURNING *`,
    [decision === "approve" ? "counted" : "rejected", `${roleLabel || "Finance"}: ${text}`, userId, id]);
  if (!rows[0]) {
    const exists = await pool.query(`SELECT budget_status FROM ${table} WHERE id = $1`, [id]);
    if (!exists.rows[0]) throw fail(404, "Cost not found");
    throw fail(409, "This cost is not waiting for a budget decision", "NOT_HELD");
  }
  if (decision === "approve") detached(() => checkBudgetAlerts(department).catch(() => {}));
  return rows[0];
}
