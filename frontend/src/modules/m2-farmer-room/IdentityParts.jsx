import { useState } from "react";
import { apiFetch } from "../../api/client.js";

// Asks for the NIN and the consent, calls the verification endpoint, and hands the response to onVerified.
export function NinVerifyBox({ endpoint, auth = true, onVerified, submitLabel = "Verify my NIN" }) {
  const [nin, setNin] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!/^\d{11}$/.test(nin)) { setError("Enter your 11-digit NIN."); return; }
    if (!consent) { setError("Please tick the box to agree that EPHAAG may check your NIN with NIMC."); return; }
    setBusy(true);
    try {
      const r = await apiFetch(endpoint, { method: "POST", auth, body: { nin, consent: true } });
      setNin("");
      onVerified(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-card border border-soil-200 p-3">
      <div className="field">
        <label htmlFor="nin-input">National Identification Number (NIN)</label>
        <input id="nin-input" inputMode="numeric" maxLength={11} value={nin} onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))} placeholder="11 digits" />
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-700">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I agree that EPHAAG may check my NIN with NIMC and use my name, date of birth, gender and permanent address from it. My NIN is not stored.</span>
      </label>
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Checking with NIMC…" : submitLabel}</button>
    </div>
  );
}

// "Use my current location" pin, kept as numbers. Optional: the community and street names also work.
export function GpsPin({ lat, lng, onChange }) {
  const [state, setState] = useState("");
  function capture() {
    if (!navigator.geolocation) { setState("Your phone or browser cannot share a location."); return; }
    setState("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { onChange(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))); setState(""); },
      () => setState("We could not get your location. You can still continue with your community and street."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  return (
    <div className="space-y-1">
      <button type="button" className="btn-outline text-xs" onClick={capture}>Use my current location</button>
      {lat !== null && lat !== undefined && lat !== "" && (
        <p className="text-xs text-canopy-800">Location saved ({Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}). <button type="button" className="underline" onClick={() => onChange(null, null)}>Clear</button></p>
      )}
      {state && <p className="text-xs text-ink-600">{state}</p>}
    </div>
  );
}
