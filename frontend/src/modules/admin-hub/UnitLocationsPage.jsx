import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const btn = "rounded-card border border-soil-200 px-3 py-1 text-xs text-ink-800 hover:bg-soil-50";

function UnitRow({ u, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ lat: u.lat ?? "", lng: u.lng ?? "", communities: (u.communities || []).join(", ") });
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try {
      await apiFetch(`/units/catalog/${u.id}`, { method: "PUT", body: { lat: f.lat === "" ? null : f.lat, lng: f.lng === "" ? null : f.lng, communities: f.communities } });
      setEdit(false); onSaved();
    } catch (e) { setErr(e.message); }
  }
  async function toggle() { await apiFetch(`/units/catalog/${u.id}`, { method: "PUT", body: { active: !u.active } }); onSaved(); }
  return (
    <li className="rounded-card border border-soil-200 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink-900">{u.name} {!u.active && <span className="text-xs text-red-700">(switched off)</span>}</p>
          <p className="text-xs text-ink-600">{u.ward}, {u.lga}, {u.state} · {u.members} member{u.members === 1 ? "" : "s"}</p>
          <p className="text-xs text-ink-500">{u.lat !== null ? `Pin ${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}` : "No pin yet"} · {u.communities.length ? u.communities.join(", ") : "no communities listed"}</p>
        </div>
        <div className="flex gap-2"><button className={btn} onClick={() => setEdit(!edit)}>{edit ? "Close" : "Edit"}</button><button className={btn} onClick={toggle}>{u.active ? "Switch off" : "Switch on"}</button></div>
      </div>
      {edit && (
        <div className="field mt-2 grid grid-cols-2 gap-3">
          <div><label>Latitude</label><input value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></div>
          <div><label>Longitude</label><input value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} /></div>
          <div className="col-span-2"><label>Communities / streets (commas)</label><input value={f.communities} onChange={(e) => setF({ ...f, communities: e.target.value })} /></div>
          {err && <p className="col-span-2 text-xs text-red-700">{err}</p>}
          <div className="col-span-2"><button className="btn-primary" onClick={save}>Save</button></div>
        </div>
      )}
    </li>
  );
}

export default function UnitLocationsPage() {
  const [units, setUnits] = useState(null);
  const [settings, setSettings] = useState(null);
  const [err, setErr] = useState("");
  const [nu, setNu] = useState({ name: "", state: "", lga: "", ward: "", lat: "", lng: "", communities: "" });
  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([apiFetch("/units/catalog"), apiFetch("/farmers/admin/identity-settings")]);
      setUnits(c.units); setSettings(s); setErr("");
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setting(body) {
    try { setSettings(await apiFetch("/farmers/admin/identity-settings", { method: "PUT", body })); setErr(""); } catch (e) { setErr(e.message); }
  }
  async function create() {
    setErr("");
    try {
      const body = { ...nu }; Object.keys(body).forEach((k) => { if (body[k] === "") delete body[k]; });
      await apiFetch("/units/catalog", { method: "POST", body });
      setNu({ name: "", state: "", lga: "", ward: "", lat: "", lng: "", communities: "" }); load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl space-y-4">
        <div className="card space-y-3">
          <div className="flex items-center gap-2"><MapPin size={18} className="text-canopy-700" /><p className="text-sm font-medium text-ink-900">Farmer identity and unit locations</p></div>
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          {settings && (
            <div className="space-y-2 text-sm text-ink-900">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={settings.gateEnabled} onChange={(e) => setting({ gateEnabled: e.target.checked })} />
                <span>Require a verified NIN and a complete profile for loans, savings withdrawals and farm shares. {settings.unverified} of {settings.farmers} farmers have not verified their NIN yet.</span>
              </label>
              <label className="field block max-w-xs text-xs text-ink-600">Furthest distance for placing a farmer in a unit (km)
                <input type="number" min="1" max="100" defaultValue={settings.unitMatchMaxKm} onBlur={(e) => Number(e.target.value) !== settings.unitMatchMaxKm && setting({ unitMatchMaxKm: Number(e.target.value) })} />
              </label>
            </div>
          )}
        </div>
        <div className="card field space-y-2">
          <p className="text-sm font-medium text-ink-900">Add an official unit</p>
          <div className="grid grid-cols-2 gap-3">
            {[["name", "Unit name"], ["state", "State"], ["lga", "LGA"], ["ward", "Ward"], ["lat", "Latitude (optional)"], ["lng", "Longitude (optional)"]].map(([k, l]) => (
              <div key={k}><label>{l}</label><input value={nu[k]} onChange={(e) => setNu({ ...nu, [k]: e.target.value })} /></div>
            ))}
            <div className="col-span-2"><label>Communities / streets (commas)</label><input value={nu.communities} onChange={(e) => setNu({ ...nu, communities: e.target.value })} /></div>
          </div>
          <button className="btn-primary" onClick={create}>Add unit</button>
        </div>
        <div className="card space-y-2">
          <p className="text-sm font-medium text-ink-900">Official units</p>
          {!units && <p className="text-sm text-ink-600">Loading…</p>}
          {units && !units.length && <p className="text-sm text-ink-600">No units yet. Units with a Unit Leader appear here automatically.</p>}
          {units && <ul className="space-y-2">{units.map((u) => <UnitRow key={u.id} u={u} onSaved={load} />)}</ul>}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
