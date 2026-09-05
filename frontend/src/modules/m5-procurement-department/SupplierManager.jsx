import { useState } from "react";

const CATEGORY_LABEL = { goods: "Goods", services: "Services", both: "Goods & services" };

export default function SupplierManager({ suppliers, onCreate, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: "", contactPerson: "", phone: "", email: "", address: "", category: "goods" });
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  function startEdit(s) {
    setEditingId(s.id);
    setDraft({
      name: s.name,
      contactPerson: s.contact_person || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      category: s.category,
    });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setDraft({ name: "", contactPerson: "", phone: "", email: "", address: "", category: "goods" });
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      if (editingId) await onUpdate(editingId, draft);
      else await onCreate(draft);
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">External vendor directory — used for RFQ/quotation sourcing.</p>
        <button type="button" className="btn-primary" onClick={startNew}>
          + Add supplier
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card space-y-3">
          <p className="text-sm font-medium text-ink-900">{editingId ? "Edit supplier" : "New supplier"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="rounded-card border border-soil-200 px-3 py-2 text-sm"
              placeholder="Supplier / company name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              required
            />
            <input
              className="rounded-card border border-soil-200 px-3 py-2 text-sm"
              placeholder="Contact person"
              value={draft.contactPerson}
              onChange={(e) => setDraft((d) => ({ ...d, contactPerson: e.target.value }))}
            />
            <input
              className="rounded-card border border-soil-200 px-3 py-2 text-sm"
              placeholder="Phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
            <input
              className="rounded-card border border-soil-200 px-3 py-2 text-sm"
              placeholder="Email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <input
              className="rounded-card border border-soil-200 px-3 py-2 text-sm sm:col-span-2"
              placeholder="Address"
              value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            />
            <select
              className="rounded-card border border-soil-200 px-3 py-2 text-sm"
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            >
              <option value="goods">Goods</option>
              <option value="services">Services</option>
              <option value="both">Goods & services</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save supplier"}
            </button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {suppliers.length === 0 && <p className="text-sm text-ink-600">No suppliers added yet.</p>}
        {suppliers.map((s) => (
          <div key={s.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-900">{s.name}</p>
              <p className="text-xs text-ink-600">
                {CATEGORY_LABEL[s.category]} · {s.contact_person || "no contact person"} · {s.phone || "no phone"}
              </p>
              {s.address && <p className="text-xs text-ink-600">{s.address}</p>}
            </div>
            <button type="button" className="text-canopy-800 text-sm" onClick={() => startEdit(s)}>
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
