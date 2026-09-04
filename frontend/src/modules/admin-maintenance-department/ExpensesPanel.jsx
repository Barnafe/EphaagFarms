import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const emptyForm = { category: "other", description: "", amount: "", vendor: "", expenseDate: "" };

export default function ExpensesPanel() {
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { expenses } = await apiFetch("/maintenance/expenses");
      setExpenses(expenses);
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
      await apiFetch("/maintenance/expenses", { method: "POST", body: { ...form, amount: Number(form.amount) } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Every cost recorded — total ₦{total.toLocaleString()}</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Record expense</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

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
          <div key={e.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{e.description || e.category}</p>
              <p className="text-xs text-ink-600">
                {e.reference} · {e.category} · {e.expense_date} {e.work_order_reference ? `· ${e.work_order_reference}` : ""}
              </p>
            </div>
            <span className="font-medium text-ink-900">₦{Number(e.amount).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
