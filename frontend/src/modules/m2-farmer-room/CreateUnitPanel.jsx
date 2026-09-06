import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";
import { wardsForLga } from "../../data/nigeriaWards.js";

const STATUS_LABEL = {
  pending: "Pending admin review",
  approved: "Approved — now a company unit",
  rejected: "Rejected",
};

export default function CreateUnitPanel() {
  const { session } = useAuth();
  const [units, setUnits] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    state: session?.user?.state || "",
    lga: "",
    ward: "",
    note: "",
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function loadUnits() {
    try {
      const { units: mine } = await apiFetch("/units/mine");
      setUnits(mine);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadUnits();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/units", { method: "POST", body: form });
      setForm({ name: "", state: session?.user?.state || "", lga: "", ward: "", note: "" });
      await loadUnits();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const lgas = form.state ? lgasForState(form.state) : [];
  const wards = form.state && form.lga ? wardsForLga(form.state, form.lga) : [];

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Create a unit</p>
      <p className="mt-1 text-xs text-ink-600">
        Once a nearby community's group is strong and consistent, propose it here. It goes to admin for approval and
        becomes an official company unit once approved. It stays listed below either way.
      </p>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-ink-600">Unit name</label>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-ink-600">State</label>
          <select
            required
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
            className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
          >
            <option value="">Select state</option>
            {NIGERIA_STATE_NAMES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-600">LGA</label>
          <select
            required
            value={form.lga}
            onChange={(e) => set("lga", e.target.value)}
            disabled={!form.state}
            className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
          >
            <option value="">Select LGA</option>
            {lgas.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-600">Ward</label>
          <select
            required
            value={form.ward}
            onChange={(e) => set("ward", e.target.value)}
            disabled={!form.lga}
            className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
          >
            <option value="">Select ward</option>
            {wards.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-ink-600">Note (optional)</label>
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
            placeholder="Why this community is ready to be a unit"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-card bg-canopy-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-2">
        <p className="text-xs text-ink-600">Units you've proposed</p>
        {units.length === 0 && <p className="text-sm text-ink-600">None yet.</p>}
        {units.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-ink-900">{u.name}</p>
              <p className="text-xs text-ink-600">{u.ward}, {u.lga}, {u.state}</p>
            </div>
            <p className="text-xs text-ink-600">{STATUS_LABEL[u.status]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
