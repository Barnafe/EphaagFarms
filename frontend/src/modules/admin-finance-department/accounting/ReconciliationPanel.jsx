import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const statusStyles = {
  in_progress: "bg-harvest-100 text-harvest-800",
  matched: "bg-canopy-50 text-canopy-800",
  unmatched: "bg-red-100 text-red-700",
  completed: "bg-canopy-50 text-canopy-800",
};

const reconTypes = ["", "bank", "cash", "supplier", "customer", "department"];
const emptyForm = { reconType: "bank", accountId: "", department: "", periodStart: "", periodEnd: "", statementBalance: "" };

export default function ReconciliationPanel() {
  const [reconciliations, setReconciliations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [reconType, setReconType] = useState("");
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (reconType) params.set("reconType", reconType);
      const [{ reconciliations }, { accounts }] = await Promise.all([
        apiFetch(`/finance-department/reconciliations?${params.toString()}`),
        apiFetch("/finance-department/accounts"),
      ]);
      setReconciliations(reconciliations);
      setAccounts(accounts);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconType]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.periodStart || !form.periodEnd) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/reconciliations", {
        method: "POST",
        body: { ...form, accountId: form.accountId || null, statementBalance: form.statementBalance ? Number(form.statementBalance) : null },
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(id) {
    try {
      await apiFetch(`/finance-department/reconciliations/${id}`, { method: "PATCH", body: { status: "completed" } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Bank, cash, supplier, customer and department reconciliation runs.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ New reconciliation</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {reconTypes.map((t) => (
          <button key={t || "all"} type="button" onClick={() => setReconType(t)} className={`rounded-full px-3 py-1 text-xs ${reconType === t ? "bg-canopy-700 text-white" : "bg-soil-100 text-ink-700"}`}>
            {t || "All"}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={form.reconType} onChange={(e) => setForm({ ...form, reconType: e.target.value })}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="supplier">Supplier</option>
            <option value="customer">Customer</option>
            <option value="department">Department</option>
          </select>
          <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            <option value="">No specific account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required />
          <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required />
          <input type="number" step="0.01" value={form.statementBalance} onChange={(e) => setForm({ ...form, statementBalance: e.target.value })} placeholder="Statement balance (optional)" />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Run reconciliation"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {reconciliations.length === 0 && <p className="text-sm text-ink-600">No reconciliations yet.</p>}
        {reconciliations.map((r) => (
          <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{r.reference}</p>
                <p className="text-xs text-ink-600">
                  {r.recon_type} · {r.period_start?.slice(0, 10)} – {r.period_end?.slice(0, 10)}
                </p>
                {r.statement_balance != null && (
                  <p className="text-xs text-ink-600">
                    Statement ₦{Number(r.statement_balance).toLocaleString()} vs Book ₦{Number(r.book_balance).toLocaleString()}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[r.status]}`}>{r.status.replace("_", " ")}</span>
            </div>
            {r.status !== "completed" && (
              <button className="btn-outline mt-2 text-xs" type="button" onClick={() => handleComplete(r.id)}>Mark completed</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
