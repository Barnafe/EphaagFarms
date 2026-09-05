import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const emptyForm = { source: "sales_revenue", category: "", amount: "", description: "", receivedFrom: "" };

export default function IncomePanel() {
  const [income, setIncome] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, accountId: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ income }, { accounts }] = await Promise.all([
        apiFetch("/finance-department/income"),
        apiFetch("/finance-department/accounts"),
      ]);
      setIncome(income);
      setAccounts(accounts);
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
    if (!form.amount) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/income", { method: "POST", body: { ...form, amount: Number(form.amount), accountId: form.accountId || null } });
      setForm({ ...emptyForm, accountId: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Customer payments, sales revenue, and other income.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Record income</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="customer_payment">Customer payment</option>
            <option value="sales_revenue">Sales revenue</option>
            <option value="other">Other income</option>
          </select>
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (optional)" />
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
          <input value={form.receivedFrom} onChange={(e) => setForm({ ...form, receivedFrom: e.target.value })} placeholder="Received from" />
          <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            <option value="">No account (unbanked)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input className="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Record income"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {income.length === 0 && <p className="text-sm text-ink-600">No income recorded yet.</p>}
        {income.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2 text-sm">
            <div>
              <p className="text-ink-900">{i.description || i.received_from || i.reference}</p>
              <p className="text-xs text-ink-600">{i.reference} · {i.source.replace(/_/g, " ")} · {i.received_at?.slice(0, 10)}</p>
            </div>
            <span className="font-medium text-ink-900">₦{Number(i.amount).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
