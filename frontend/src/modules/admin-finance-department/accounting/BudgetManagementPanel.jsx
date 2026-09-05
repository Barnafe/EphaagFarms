import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const emptyForm = { budgetType: "department", name: "", department: "", projectRef: "", periodStart: "", periodEnd: "", allocatedAmount: "" };

export default function BudgetManagementPanel() {
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { budgets } = await apiFetch("/finance-department/budgets");
      setBudgets(budgets);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.periodStart || !form.periodEnd) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/budgets", { method: "POST", body: { ...form, allocatedAmount: Number(form.allocatedAmount || 0) } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjust(id) {
    const amount = Number(prompt("Adjustment amount (use a negative number to claw back):") || "0");
    if (!amount) return;
    const reason = prompt("Reason for adjustment:") || "";
    if (!reason) return;
    try {
      await apiFetch(`/finance-department/budgets/${id}/adjust`, { method: "POST", body: { amount, reason } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Company, department, project, operational and capital budgets.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ New budget</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <input className="sm:col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Budget name" required />
          <select value={form.budgetType} onChange={(e) => setForm({ ...form, budgetType: e.target.value })}>
            <option value="company">Company</option>
            <option value="department">Department</option>
            <option value="project">Project</option>
            <option value="operational">Operational</option>
            <option value="capital">Capital expenditure</option>
          </select>
          <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Department (optional)" />
          <input value={form.projectRef} onChange={(e) => setForm({ ...form, projectRef: e.target.value })} placeholder="Project ref (optional)" />
          <input type="number" min="0" step="0.01" value={form.allocatedAmount} onChange={(e) => setForm({ ...form, allocatedAmount: e.target.value })} placeholder="Allocated amount" />
          <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required />
          <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create budget"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {budgets.length === 0 && <p className="text-sm text-ink-600">No budgets yet.</p>}
        {budgets.map((b) => {
          const pct = b.allocated_amount > 0 ? Math.min(100, Math.round((b.spent_amount / b.allocated_amount) * 100)) : 0;
          return (
            <div key={b.id} className="rounded-card border border-soil-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">{b.name}</p>
                  <p className="text-xs text-ink-600">
                    {b.reference} · {b.budget_type} {b.department ? `· ${b.department}` : ""} · {b.period_start?.slice(0, 10)} – {b.period_end?.slice(0, 10)}
                  </p>
                </div>
                <button className="btn-outline text-xs" type="button" onClick={() => handleAdjust(b.id)}>Adjust</button>
              </div>
              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-soil-100">
                  <div className={`h-full ${pct >= 100 ? "bg-red-500" : "bg-canopy-600"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-ink-600">
                  ₦{Number(b.spent_amount).toLocaleString()} of ₦{Number(b.allocated_amount).toLocaleString()} spent ({pct}%)
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
