import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const statusStyles = {
  outstanding: "bg-soil-100 text-ink-600",
  due: "bg-harvest-100 text-harvest-800",
  overdue: "bg-red-100 text-red-700",
  partially_paid: "bg-harvest-100 text-harvest-800",
  paid: "bg-canopy-50 text-canopy-800",
};

const filters = ["", "outstanding", "due", "overdue", "partially_paid", "paid"];
const emptyForm = { payeeType: "supplier", payeeName: "", invoiceNumber: "", amount: "", department: "", dueDate: "" };

export default function PayablesPanel() {
  const [payables, setPayables] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const { payables } = await apiFetch(`/finance-department/payables?${params.toString()}`);
      setPayables(payables);
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
    if (!form.payeeName.trim() || !form.amount) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/payables", { method: "POST", body: { ...form, amount: Number(form.amount) } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSettle(id, remaining) {
    const amount = Number(prompt(`Amount to settle (remaining: ₦${remaining.toLocaleString()}):`, remaining) || "0");
    if (!amount) return;
    try {
      await apiFetch(`/finance-department/payables/${id}/settle`, { method: "POST", body: { amount } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Supplier invoices and contractor bills owed by the company.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ New payable</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f || "all"} type="button" onClick={() => setStatus(f)} className={`rounded-full px-3 py-1 text-xs ${status === f ? "bg-canopy-700 text-white" : "bg-soil-100 text-ink-700"}`}>
            {f ? f.replace("_", " ") : "All"}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <select value={form.payeeType} onChange={(e) => setForm({ ...form, payeeType: e.target.value })}>
            <option value="supplier">Supplier</option>
            <option value="contractor">Contractor</option>
          </select>
          <input value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} placeholder="Payee name" required />
          <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Invoice number" />
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
          <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Department" />
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create payable"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {payables.length === 0 && <p className="text-sm text-ink-600">No payables yet.</p>}
        {payables.map((p) => {
          const remaining = Number(p.amount) - Number(p.amount_paid);
          return (
            <div key={p.id} className="rounded-card border border-soil-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">{p.payee_name}</p>
                  <p className="text-xs text-ink-600">
                    {p.reference} · {p.payee_type} {p.due_date ? `· due ${p.due_date.slice(0, 10)}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[p.status]}`}>{p.status.replace("_", " ")}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-ink-700">
                  ₦{Number(p.amount_paid).toLocaleString()} of ₦{Number(p.amount).toLocaleString()} paid
                </p>
                {p.status !== "paid" && (
                  <button className="btn-outline text-xs" type="button" onClick={() => handleSettle(p.id, remaining)}>Record settlement</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
