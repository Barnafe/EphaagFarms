import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const statusStyles = {
  requested: "bg-soil-100 text-ink-600",
  verified: "bg-harvest-100 text-harvest-800",
  authorized: "bg-harvest-100 text-harvest-800",
  scheduled: "bg-harvest-100 text-harvest-800",
  processing: "bg-harvest-100 text-harvest-800",
  completed: "bg-canopy-50 text-canopy-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

// The lifecycle each payment moves through, in order — the panel offers
// the next logical step plus "Failed"/"Cancelled" as exits from any
// non-final state.
const NEXT_STEP = {
  requested: "verified",
  verified: "authorized",
  authorized: "scheduled",
  scheduled: "processing",
  processing: "completed",
};

const emptyForm = { paymentType: "payable", amount: "", method: "", accountId: "" };

export default function PaymentManagementPanel() {
  const [payments, setPayments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ payments }, { accounts }] = await Promise.all([
        apiFetch("/finance-department/payments"),
        apiFetch("/finance-department/accounts"),
      ]);
      setPayments(payments);
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
      await apiFetch("/finance-department/payments", { method: "POST", body: { ...form, amount: Number(form.amount), accountId: form.accountId || null } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id, status) {
    try {
      await apiFetch(`/finance-department/payments/${id}/status`, { method: "PATCH", body: { status } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Payment requests, verification, authorization, scheduling and processing.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ New payment</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })}>
            <option value="payable">Against a payable</option>
            <option value="receivable">Against a receivable</option>
            <option value="request">Against a request</option>
            <option value="other">Other</option>
          </select>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
          <input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="Method (transfer, cheque, cash…)" />
          <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            <option value="">Choose account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create payment"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {payments.length === 0 && <p className="text-sm text-ink-600">No payments yet.</p>}
        {payments.map((p) => (
          <div key={p.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{p.reference}</p>
                <p className="text-xs text-ink-600">{p.payment_type} · ₦{Number(p.amount).toLocaleString()} {p.method ? `· ${p.method}` : ""}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[p.status]}`}>{p.status}</span>
            </div>
            {!["completed", "failed", "cancelled"].includes(p.status) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {NEXT_STEP[p.status] && (
                  <button className="btn-primary text-xs" type="button" onClick={() => setStatus(p.id, NEXT_STEP[p.status])}>
                    Mark {NEXT_STEP[p.status]}
                  </button>
                )}
                <button className="btn-outline text-xs" type="button" onClick={() => setStatus(p.id, "failed")}>Failed</button>
                <button className="btn-outline text-xs" type="button" onClick={() => setStatus(p.id, "cancelled")}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
