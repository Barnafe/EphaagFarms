import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";

/** Anyone can apply for consultancy: members and guests with no account. Nothing is paid here. */
export default function ConsultancyApply() {
  const navigate = useNavigate();
  const [offerings, setOfferings] = useState([]);
  const [f, setF] = useState({ name: "", email: "", phone: "", organisation: "", offeringId: "", topic: "", message: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => { apiFetch("/consultancy/offerings").then((d) => setOfferings(d.offerings || [])).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const body = { ...f, offeringId: f.offeringId || undefined };
      const d = await apiFetch("/consultancy/requests", { method: "POST", body });
      navigate(d.trackPath);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card field space-y-3 text-left" data-testid="consultancy-form" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="c-name">Your name</label><input id="c-name" value={f.name} onChange={set("name")} autoComplete="name" /></div>
        <div><label htmlFor="c-org">Organisation (optional)</label><input id="c-org" value={f.organisation} onChange={set("organisation")} /></div>
        <div><label htmlFor="c-email">Email</label><input id="c-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" /></div>
        <div><label htmlFor="c-phone">Phone</label><input id="c-phone" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="0803 000 0000" /></div>
      </div>
      <p className="text-xs text-ink-600">Give an email, a phone number, or both.</p>
      <div>
        <label htmlFor="c-service">What do you need help with?</label>
        <select id="c-service" value={f.offeringId} onChange={set("offeringId")}>
          <option value="">Something else (describe below)</option>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
      </div>
      {!f.offeringId && <div><label htmlFor="c-topic">What is it about?</label><input id="c-topic" value={f.topic} onChange={set("topic")} placeholder="For example: layout for a 500-bird poultry house" /></div>}
      <div><label htmlFor="c-message">Tell us more</label><textarea id="c-message" rows={4} value={f.message} onChange={set("message")} /></div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send my request"}</button>
      <p className="text-xs text-ink-600">Nothing is paid now. If approved, you will get the fee and pay online.</p>
    </form>
  );
}
