// Phase 10: annual department budgets for Purchasing. What counts against a budget is the value of purchase orders
// the CEO has approved in that year, for requests that have not been cancelled.
import { pool } from "../db/pool.js";
import { notifyUser, notifyAdmins } from "./messaging.js";
import { registerTemplate, escapeHtml } from "./messageTemplates.js";

export const PURCHASE_DEPARTMENTS = ["Store", "Production", "Maintenance", "Transport", "Finance", "TRC", "Procurement", "Other"];
const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

registerTemplate("budget_low", (d) => ({
  subject: `[Budget] ${d.department} has used ${d.percentUsed}% of its ${d.year} budget`,
  title: "Your department budget is getting low",
  html: `<p>${escapeHtml(d.department)} has used ${d.percentUsed}% of its ${d.year} purchasing budget.</p>
<p>Budget: ${naira(d.amount)}. Committed: ${naira(d.committed)}. Left: ${naira(d.remaining)}.</p>
<p>If you will need more, ask Finance for it through the Requests form before your next purchase.</p>`,
}), { department: "Production", year: 2026, percentUsed: 82, amount: 1000000, committed: 820000, remaining: 180000 });

registerTemplate("budget_exhausted", (d) => ({
  subject: `[Budget] ${d.department} has used all of its ${d.year} budget`,
  title: "Your department budget is used up",
  html: `<p>${escapeHtml(d.department)} has used its whole ${d.year} purchasing budget (${naira(d.amount)}).</p>
<p>The next purchase will wait for Finance's approval before it can go to the CEO. If you need more budget, ask Finance through the Requests form.</p>`,
}), { department: "Production", year: 2026, amount: 1000000 });

registerTemplate("purchase_budget_hold", (d) => ({
  subject: `[Purchasing] ${d.reference} is on hold: it is over the ${d.department} budget`,
  title: "A purchase is waiting for your budget decision",
  html: `<p>${escapeHtml(d.title)} (${escapeHtml(d.reference)}) for ${escapeHtml(d.department)} costs ${naira(d.total)}, but only ${naira(d.remaining)} is left in the ${d.year} budget.</p>
<p>Open Procurement &rarr; Purchasing to approve going over budget, or send it back.</p>`,
}), { reference: "PR-20261101-ABCD", title: "Tractor repair parts", department: "Maintenance", total: 250000, remaining: 100000, year: 2026 });

registerTemplate("purchase_awaiting", (d) => ({
  subject: `[Purchasing] ${d.reference} needs your ${d.role} decision`,
  title: `Purchasing: waiting for the ${d.role}`,
  html: `<p>${escapeHtml(d.title)} (${escapeHtml(d.reference)}) for ${escapeHtml(d.department)} is waiting for the ${escapeHtml(d.role)}.</p><p>${escapeHtml(d.what)}</p><p>Open Procurement &rarr; Purchasing to act on it.</p>`,
}), { reference: "PR-20261101-ABCD", title: "Tractor repair parts", department: "Maintenance", role: "CEO", what: "Approve or reject the purchase order." });

/** Notify the head of a role, or the main admin when nobody holds it yet. */
export async function notifyRole(role, template, data) {
  const { rows } = await pool.query(`SELECT id FROM users WHERE role_type = 'admin' AND department_head_of = $1`, [role]);
  if (rows.length === 0) {
    const main = await pool.query(`SELECT id FROM users WHERE role_type = 'admin' AND is_main_admin`);
    for (const m of main.rows) await notifyUser(m.id, template, data, { allChannels: true }).catch(() => {});
    return;
  }
  for (const r of rows) await notifyUser(r.id, template, data, { allChannels: true }).catch(() => {});
}

const year = () => new Date().getUTCFullYear();

export async function committedFor(department, y = year(), runner = pool) {
  const { rows } = await runner.query(
    `SELECT COALESCE(SUM(po.total_amount), 0) AS n
       FROM purchase_orders po JOIN purchase_requests pr ON pr.id = po.request_id
      WHERE pr.department = $1 AND po.status = 'approved' AND pr.status <> 'cancelled'
        AND EXTRACT(YEAR FROM po.approved_at) = $2`, [department, y]);
  let total = Number(rows[0].n);
  // Phase 12: day to day costs also count. Maintenance costs and Transport costs that are not waiting for Finance
  // (budget_status = 'counted') use up their department's budget, together with approved purchase orders.
  if (department === "Maintenance") {
    const m = await runner.query(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM maintenance_expenses
        WHERE budget_status = 'counted' AND EXTRACT(YEAR FROM expense_date) = $1`, [y]);
    total += Number(m.rows[0].n);
  } else if (department === "Transport") {
    const t = await runner.query(
      `SELECT COALESCE(SUM(amount), 0) AS n FROM vehicle_expenses
        WHERE budget_status = 'counted' AND EXTRACT(YEAR FROM expense_date) = $1`, [y]);
    total += Number(t.rows[0].n);
  }
  return total;
}

export async function budgetStatus(department, y = year(), runner = pool) {
  const { rows } = await runner.query(`SELECT * FROM department_budgets WHERE year = $1 AND department = $2`, [y, department]);
  const b = rows[0];
  const committed = await committedFor(department, y, runner);
  if (!b) return { department, year: y, configured: false, amount: null, committed, remaining: null, percentUsed: null, warnAtPercent: null, low: false, exhausted: false };
  const amount = Number(b.amount);
  const remaining = amount - committed;
  const percentUsed = amount > 0 ? Math.round((committed / amount) * 100) : 100;
  return {
    department, year: y, configured: true, amount, committed, remaining, percentUsed, warnAtPercent: b.warn_at_percent,
    low: percentUsed >= b.warn_at_percent && remaining > 0, exhausted: remaining <= 0,
  };
}

/** Would approving `total` push this department over its budget? No budget set means no limit. */
export async function wouldExceed(department, total, y = year(), runner = pool) {
  const s = await budgetStatus(department, y, runner);
  return { ...s, exceeds: s.configured && s.committed + Number(total) > s.amount };
}

/** Tell the department head (and Finance) as soon as a budget gets low, and again when it is used up. Once per level. */
export async function checkBudgetAlerts(department, y = year()) {
  const s = await budgetStatus(department, y);
  if (!s.configured) return s;
  const { rows } = await pool.query(`SELECT low_notified_at, exhausted_notified_at FROM department_budgets WHERE year = $1 AND department = $2`, [y, department]);
  const b = rows[0];
  const data = { department, year: y, amount: s.amount, committed: s.committed, remaining: Math.max(0, s.remaining), percentUsed: Math.min(100, s.percentUsed) };
  const kind = s.exhausted ? "budget_exhausted" : s.low ? "budget_low" : null;
  if (!kind) {
    // Back under the warning level (a bigger budget): allow alerts again later.
    if (b.low_notified_at || b.exhausted_notified_at) await pool.query(`UPDATE department_budgets SET low_notified_at = NULL, exhausted_notified_at = NULL WHERE year = $1 AND department = $2`, [y, department]);
    return s;
  }
  const col = s.exhausted ? "exhausted_notified_at" : "low_notified_at";
  if (b[col]) return s;
  const claimed = await pool.query(`UPDATE department_budgets SET ${col} = now() WHERE year = $1 AND department = $2 AND ${col} IS NULL RETURNING id`, [y, department]);
  if (!claimed.rows[0]) return s;
  await notifyRole(department, kind, data);          // the department head
  await notifyRole("Finance", kind, data);           // and Finance
  return s;
}

registerTemplate("cost_budget_hold", (d) => ({
  subject: `[Budget] A ${d.department} cost of ${naira(d.amount)} is waiting for Finance`,
  title: "A cost is over the department budget",
  html: `<p>${escapeHtml(d.what)} (${escapeHtml(d.reference)}) costs ${naira(d.amount)}, but only ${naira(d.remaining)} is left in the ${d.year} ${escapeHtml(d.department)} budget.</p>
<p>It does not count against the budget until Finance approves it. Open ${escapeHtml(d.department)} &rarr; Costs to decide.</p>`,
}), { department: "Transport", what: "Fuel for trip TRP-20261101-ABCD", reference: "VEXP-20261101-ABCD", amount: 85000, remaining: 20000, year: 2026 });

/**
 * Decide whether a new running cost fits the department budget. Returns "counted" or "held". When it is held the
 * Finance head (or the main admin) is told; the cost itself is still recorded, because the money is already spent
 * (fuel was bought, parts arrived), but it only counts once Finance approves it.
 */
export async function budgetStatusForCost(department, amount, runner = pool, y = year()) {
  const s = await wouldExceed(department, amount, y, runner);
  return { status: s.exceeds ? "held" : "counted", remaining: s.remaining, year: s.year };
}

export async function announceHeldCost({ department, what, reference, amount, remaining, year: y }) {
  await notifyRole("Finance", "cost_budget_hold", { department, what, reference, amount, remaining: Math.max(0, remaining ?? 0), year: y });
}
