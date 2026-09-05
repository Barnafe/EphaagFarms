import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const statusStyles = {
  outstanding: "bg-soil-100 text-ink-600",
  due: "bg-harvest-100 text-harvest-800",
  overdue: "bg-red-100 text-red-700",
  partial: "bg-harvest-100 text-harvest-800",
  paid: "bg-canopy-50 text-canopy-800",
};

const filters = ["", "outstanding", "due", "overdue", "partial", "paid"];
const emptyForm = { customerName: "", invoiceNumber: "", amount: "", dueDate: "" };

export default function ReceivablesPanel() {
  const [receivables, setReceivables] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const { receivables } = await apiFetch(`/finance-department/receivables?${params.toString()}`);
      setReceivables(receivables);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.customerName.trim() || !form.amount) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/receivables", { method: "POST", body: { ...form, amount: Number(form.amount) } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReceive(id, remaining) {
    const amount = Number(prompt(`Amount received (remaining: ₦${remaining.toLocaleString()}):`, remaining) || "0");
    if (!amount) return;
    try {
      await apiFetch(`/finance-department/receivables/${id}/receive`, { method: "POST", body: { amount } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Customer invoices owed to the company.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ New receivable</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f || "all"} type="button" onClick={() => setStatus(f)} className={`rounded-full px-3 py-1 text-xs ${status === f ? "bg-canopy-700 text-white" : "bg-soil-100 text-ink-700"}`}>
            {f || "All"}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Customer name" required />
          <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Invoice number" />
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create receivable"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {receivables.length === 0 && <p className="text-sm text-ink-600">No receivables yet.</p>}
        {receivables.map((r) => {
          const remaining = Number(r.amount) - Number(r.amount_received);
          return (
            <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">{r.customer_name}</p>
                  <p className="text-xs text-ink-600">
                    {r.reference} {r.due_date ? `· due ${r.due_date.slice(0, 10)}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[r.status]}`}>{r.status}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-ink-700">
                  ₦{Number(r.amount_received).toLocaleString()} of ₦{Number(r.amount).toLocaleString()} received
                </p>
                {r.status !== "paid" && (
                  <button className="btn-outline text-xs" type="button" onClick={() => handleReceive(r.id, remaining)}>Record payment</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
