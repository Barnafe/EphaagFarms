import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const emptyForm = { category: "operational", department: "", description: "", amount: "" };

export default function ExpensePanel() {
  const [expenses, setExpenses] = useState([]);
  const [department, setDepartment] = useState("");
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      const { expenses } = await apiFetch(`/finance-department/expenses?${params.toString()}`);
      setExpenses(expenses);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/expenses", { method: "POST", body: { ...form, amount: Number(form.amount) } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(id) {
    try {
      await apiFetch(`/finance-department/expenses/${id}/verify`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Department, employee, operational and capital expenses.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Record expense</button>
      </div>

      <input className="mt-3 max-w-xs" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Filter by department…" />

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="department">Department</option>
            <option value="employee">Employee</option>
            <option value="operational">Operational</option>
            <option value="capital">Capital</option>
          </select>
          <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Department" />
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
          <textarea className="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} required />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Record expense"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {expenses.length === 0 && <p className="text-sm text-ink-600">No expenses recorded yet.</p>}
        {expenses.map((x) => (
          <div key={x.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-ink-900">{x.description}</p>
                <p className="text-xs text-ink-600">
                  {x.reference} · {x.category} {x.department ? `· ${x.department}` : ""} · {x.expense_date?.slice(0, 10)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-ink-900">₦{Number(x.amount).toLocaleString()}</p>
                {x.verified ? (
                  <span className="text-xs text-canopy-700">Verified</span>
                ) : (
                  <button className="text-xs text-canopy-700 underline" type="button" onClick={() => handleVerify(x.id)}>Verify</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
