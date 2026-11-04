import { useState } from "react";
import { apiFetch } from "../../api/client.js";

// Shown on every page of the Corps room to a member who has not yet agreed to share their details with
// NYSC AGROALLIED SAED (members who registered before it was required). Their certificate is held until they tick.
export default function ConsentBanner({ onDone }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/corpers/consent", { method: "POST", body: { consentData: true } });
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-card border border-[#dba532] bg-[#fbf1dd] p-4" role="region" aria-label="Consent needed" data-testid="consent-banner">
      <p className="text-sm font-semibold text-ink-900">Your consent is needed</p>
      <p className="mt-1 text-sm text-ink-800">
        Every member must agree to share their details with NYSC AGROALLIED SAED. Until you do, your certificate will not be released.
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm text-ink-900">
        <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I consent to my details being shared with NYSC AGROALLIED SAED for certification.</span>
      </label>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      <button type="button" className="mt-3 h-11 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={!agree || busy} onClick={submit}>
        {busy ? "Saving…" : "Give my consent"}
      </button>
    </div>
  );
}
