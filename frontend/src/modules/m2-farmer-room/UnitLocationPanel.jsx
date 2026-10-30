import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { GpsPin } from "./IdentityParts.jsx";

// A Unit Leader pins their own unit and lists the communities / streets it covers. Farmers are placed in
// the closest unit by this pin, or by these names when they give no pin.
export default function UnitLocationPanel() {
  const [unit, setUnit] = useState(null);
  const [communities, setCommunities] = useState("");
  const [pin, setPin] = useState({ lat: null, lng: null });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/units/mine/location").then(({ unit: u }) => {
      setUnit(u);
      if (u) { setCommunities((u.communities || []).join(", ")); setPin({ lat: u.lat, lng: u.lng }); }
    }).catch((e) => setErr(e.message));
  }, []);

  async function save() {
    setErr(""); setMsg("");
    try {
      await apiFetch("/units/mine/location", { method: "PUT", body: { communities, ...(pin.lat !== null ? { lat: pin.lat, lng: pin.lng } : {}) } });
      setMsg("Saved. New members near this pin, or in these communities, will join your unit automatically.");
    } catch (e) { setErr(e.message); }
  }
  if (!unit) return err ? <p className="text-sm text-red-700">{err}</p> : null;
  return (
    <div className="card field space-y-3">
      <p className="text-sm font-medium text-ink-900">My unit location: {unit.name}</p>
      <p className="text-xs text-ink-600">Stand at the centre of your unit and use the button, then list the communities and streets it covers.</p>
      <GpsPin lat={pin.lat} lng={pin.lng} onChange={(la, ln) => setPin({ lat: la, lng: ln })} />
      <div><label>Communities / streets in my unit (separate with commas)</label><input value={communities} onChange={(e) => setCommunities(e.target.value)} placeholder="Kasuwa, Tudun Wada, Zaria Road" /></div>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {msg && <p className="text-xs text-canopy-800" role="status">{msg}</p>}
      <button type="button" className="btn-primary" onClick={save}>Save unit location</button>
    </div>
  );
}
