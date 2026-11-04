import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import CostDecision, { BudgetLine } from "../../components/CostDecision.jsx";

const emptyForm = { category: "other", description: "", amount: "", vendor: "", expenseDate: "" };

export default function ExpensesPanel() {
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { expenses, budget } = await apiFetch("/maintenance/expenses");
      setExpenses(expenses);
      setBudget(budget);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount) return;
    setBusy(true);
    try {
      const body = { ...form, amount: Number(form.amount) };
      if (!body.expenseDate) delete body.expenseDate;
      const r = await apiFetch("/maintenance/expenses", { method: "POST", body });
      setNotice(r.waitingForFinance ? "Recorded. It is over the Maintenance budget, so it waits for Finance and does not count yet." : null);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const total = expenses.filter((e) => e.budget_status === "counted").reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Costs counted, total ₦{total.toLocaleString()}</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Record expense</button>
      </div>

      <div className="mt-1"><BudgetLine budget={budget} /></div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-3 text-sm text-canopy-800">{notice}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-4">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="labor">Labor</option>
            <option value="parts">Parts</option>
            <option value="contractor">Contractor</option>
            <option value="other">Other</option>
          </select>
          <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount (₦)" required />
          <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor" />
          <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
          <input className="sm:col-span-4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" />
          <div className="flex gap-2 sm:col-span-4">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Record expense"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {expenses.length === 0 && <p className="text-sm text-ink-600">No expenses recorded yet.</p>}
        {expenses.map((e) => (
          <div key={e.id} className="rounded-card border border-soil-200 px-3 py-2" data-testid="maintenance-cost-row">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink-900">{e.description || e.category}</p>
                <p className="text-xs text-ink-600">
                  {e.reference} · {e.category} · {String(e.expense_date).slice(0, 10)} {e.work_order_reference ? `· ${e.work_order_reference}` : ""}
                  {e.budget_status === "held" ? " · Waiting for Finance" : e.budget_status === "rejected" ? " · Rejected by Finance" : ""}
                </p>
                {e.budget_note && <p className="text-xs text-ink-600">{e.budget_note}</p>}
              </div>
              <span className="font-medium text-ink-900">₦{Number(e.amount).toLocaleString()}</span>
            </div>
            {e.budget_status === "held" && <CostDecision path={`/maintenance/expenses/${e.id}/budget-decision`} onDone={load} />}
          </div>
        ))}
      </div>
    </div>
  );
}
