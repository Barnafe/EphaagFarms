import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const emptyForm = { companyName: "", contactPerson: "", phone: "", email: "", serviceType: "" };

export default function ContractorsPanel() {
  const [contractors, setContractors] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { contractors } = await apiFetch("/maintenance/contractors");
      setContractors(contractors);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.companyName.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/maintenance/contractors", { method: "POST", body: form });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(c) {
    try {
      await apiFetch(`/maintenance/contractors/${c.id}`, {
        method: "PATCH",
        body: { status: c.status === "active" ? "inactive" : "active" },
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">External service providers</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Add contractor</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-3">
          <input className="sm:col-span-2" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Company name" required />
          <input value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} placeholder="Service type" />
          <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Contact person" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Add contractor"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {contractors.length === 0 && <p className="text-sm text-ink-600">No contractors added yet.</p>}
        {contractors.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{c.company_name}</p>
              <p className="text-xs text-ink-600">
                {c.service_type || "General"} · {c.contact_person || "—"} · {c.phone || "—"}
              </p>
            </div>
            <button
              className={`rounded-full px-2 py-1 text-xs ${c.status === "active" ? "bg-canopy-50 text-canopy-800" : "bg-soil-100 text-ink-600"}`}
              type="button"
              onClick={() => toggleStatus(c)}
            >
              {c.status}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
