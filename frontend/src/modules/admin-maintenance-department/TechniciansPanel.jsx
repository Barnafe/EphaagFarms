import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const emptyForm = { name: "", phone: "", email: "", specialty: "" };

export default function TechniciansPanel() {
  const [technicians, setTechnicians] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ technicians }, { workload }] = await Promise.all([
        apiFetch("/maintenance/technicians"),
        apiFetch("/maintenance/technicians/workload"),
      ]);
      setTechnicians(technicians);
      setWorkload(workload);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/maintenance/technicians", { method: "POST", body: form });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(t) {
    try {
      await apiFetch(`/maintenance/technicians/${t.id}`, {
        method: "PATCH",
        body: { status: t.status === "active" ? "inactive" : "active" },
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function activeOrders(id) {
    return workload.find((w) => w.id === id)?.active_orders ?? 0;
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">In-house technicians and their current workload</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Add technician</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-4">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" required />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Specialty, e.g. Electrical" />
          <div className="flex gap-2 sm:col-span-4">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Add technician"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {technicians.length === 0 && <p className="text-sm text-ink-600">No technicians added yet.</p>}
        {technicians.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{t.name}</p>
              <p className="text-xs text-ink-600">
                {t.specialty || "General"} · {t.phone || "—"} · {activeOrders(t.id)} active order{activeOrders(t.id) === 1 ? "" : "s"}
              </p>
            </div>
            <button
              className={`rounded-full px-2 py-1 text-xs ${t.status === "active" ? "bg-canopy-50 text-canopy-800" : "bg-soil-100 text-ink-600"}`}
              type="button"
              onClick={() => toggleStatus(t)}
            >
              {t.status}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
