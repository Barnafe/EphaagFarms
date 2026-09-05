import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const statusStyles = {
  pending: "bg-harvest-100 text-harvest-800",
  approved: "bg-canopy-50 text-canopy-800",
  rejected: "bg-red-100 text-red-700",
  returned: "bg-soil-100 text-ink-600",
};

const filters = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "returned", label: "Returned" },
];

const emptyForm = { department: "", category: "", amount: "", purpose: "" };

export default function FinancialRequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (mineOnly) params.set("mine", "true");
      const { requests } = await apiFetch(`/finance-department/requests?${params.toString()}`);
      setRequests(requests);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mineOnly]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.department.trim() || !form.amount || !form.purpose.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/finance-department/requests", { method: "POST", body: { ...form, amount: Number(form.amount) } });
      setForm(emptyForm);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Requests raised against a budget, moving through approval.</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>
          + New request
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={`rounded-full px-3 py-1 text-xs ${status === f.key ? "bg-canopy-700 text-white" : "bg-soil-100 text-ink-700"}`}
          >
            {f.label}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-ink-600">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My requests only
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <input className="sm:col-span-2" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Department" required />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (optional)" />
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
          <textarea className="sm:col-span-2" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Purpose" rows={2} required />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {requests.length === 0 && <p className="text-sm text-ink-600">No requests yet.</p>}
        {requests.map((r) => (
          <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{r.purpose}</p>
                <p className="text-xs text-ink-600">
                  {r.reference} · {r.department} · ₦{Number(r.amount).toLocaleString()} · by {r.requester_name || "—"}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[r.status]}`}>{r.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
