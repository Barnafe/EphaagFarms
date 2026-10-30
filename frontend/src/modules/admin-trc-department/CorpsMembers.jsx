import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiDownload } from "../../api/client.js";

const YES_NO = [["", "Any"], ["yes", "Yes"], ["no", "No"]];
const EMAIL_LABEL = { sent: "Emailed", pending: "Email waiting", failed: "Email failed", not_configured: "Not emailed (no SMTP)", no_email: "No email address" };
const day = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

// TRC -> Corps -> Members: the NYSC AGROALLIED SAED table. Filters + a spreadsheet export.
export default function CorpsMembers() {
  const [f, setF] = useState({ year: "", batch: "", stream: "", state: "", paid: "", completed: "", consent: "", q: "" });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [includeNoConsent, setIncludeNoConsent] = useState(false);
  const [busy, setBusy] = useState(null);
  const limit = 25;
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));

  const qs = useCallback(
    (extra = {}) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== "" && v !== undefined) p.set(k, v);
      return p.toString();
    },
    [f]
  );

  useEffect(() => setOffset(0), [f]);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/rtc/admin/corps/members?${qs({ limit, offset })}`);
      setData(d);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [qs, offset]);

  useEffect(() => {
    const t = setTimeout(load, f.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, f.q]);

  async function exportSheet() {
    setBusy("export");
    setError(null);
    try {
      await apiDownload(`/rtc/admin/corps/members/export?${qs(includeNoConsent ? { includeNoConsent: "true" } : {})}`, `nysc-agroallied-saed-members-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function reissue(m) {
    if (!window.confirm(`Reissue ${m.name}'s certificate with their current name? The number stays ${m.certificateNumber}.`)) return;
    setBusy(m.userId);
    setError(null);
    setMessage(null);
    try {
      const r = await apiFetch(`/rtc/admin/corps/members/${m.userId}/certificate/reissue`, { method: "POST", body: {} });
      setMessage(`Certificate ${r.number} reissued (revision ${r.revision}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const select = (label, key, options) => (
    <label className="text-xs text-ink-600">
      {label}
      <select value={f[key]} onChange={(e) => set(key, e.target.value)} className="mt-1 block h-9 w-full rounded-card border border-soil-200 bg-white px-2 text-sm text-ink-900">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  const pages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-white">NYSC AGROALLIED SAED members</h1>
        <p className="mt-1 text-sm text-canopy-100">Filter the NYSC AGROALLIED SAED members and export the spreadsheet for NYSC AGROALLIED SAED.</p>
      </div>

      {error && <div className="card border-red-200 bg-red-50" role="alert"><p className="text-sm text-red-700">{error}</p></div>}
      {message && <div className="card border-canopy-200 bg-canopy-50" role="status"><p className="text-sm text-canopy-800">{message}</p></div>}

      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="text-xs text-ink-600">Year
            <input type="number" value={f.year} onChange={(e) => set("year", e.target.value)} placeholder="2026" className="mt-1 block h-9 w-full rounded-card border border-soil-200 bg-white px-2 text-sm text-ink-900" />
          </label>
          {select("Batch", "batch", [["", "Any"], ["A", "A"], ["B", "B"], ["C", "C"]])}
          {select("Stream", "stream", [["", "Any"], ["I", "I"], ["II", "II"]])}
          {select("State of deployment", "state", [["", "Any"], ...(data?.states || []).map((s) => [s, s])])}
          {select("Paid", "paid", YES_NO)}
          {select("Completed all courses", "completed", YES_NO)}
          {select("Consent to share with NYSC AGROALLIED SAED", "consent", YES_NO)}
          <label className="text-xs text-ink-600">Search
            <input value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Name, email, phone, state code, certificate no." className="mt-1 block h-9 w-full rounded-card border border-soil-200 bg-white px-2 text-sm text-ink-900" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={exportSheet} disabled={busy === "export"} className="h-10 rounded-card bg-canopy-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy === "export" ? "Preparing…" : "Export spreadsheet (.xlsx)"}
          </button>
          <label className="flex items-center gap-2 text-xs text-ink-800">
            <input type="checkbox" className="!w-auto" checked={includeNoConsent} onChange={(e) => setIncludeNoConsent(e.target.checked)} />
            Include members who have not consented to share their details with NYSC AGROALLIED SAED
          </label>
        </div>
        <p className="text-xs text-ink-600">The export uses the filters above. By default only members who consented are included; certificate numbers appear only once released.</p>
      </div>

      <div className="card">
        <p className="text-xs text-ink-600">{data ? `${data.total} member${data.total === 1 ? "" : "s"}` : "Loading…"}</p>
        {data && data.members.length === 0 && <p className="mt-3 text-sm text-ink-600">No NYSC AGROALLIED SAED members match.</p>}
        {data && data.members.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm" data-testid="nysc-members">
              <thead>
                <tr className="text-xs text-ink-600">
                  {["Member", "Batch", "State / PPA", "Paid", "Courses", "Completed", "Consent", "Certificate", ""].map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.userId} className="border-t border-soil-200 align-top text-ink-900" data-testid="nysc-row">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-ink-600">{m.stateCode} · {m.callUpNumber}</p>
                      <p className="text-xs text-ink-600">{m.email || "no email"} · {m.phone || "no phone"}</p>
                    </td>
                    <td className="py-2 pr-3">{m.serviceYear} {m.batch}/{m.stream}</td>
                    <td className="py-2 pr-3"><p>{m.stateOfDeployment}</p><p className="text-xs text-ink-600">{m.ppa}</p></td>
                    <td className="py-2 pr-3">{m.paid ? "Yes" : "No"}</td>
                    <td className="py-2 pr-3">{m.coursesCompleted} of {m.coursesTotal}</td>
                    <td className="py-2 pr-3">{m.completed ? day(m.completionDate) : "—"}</td>
                    <td className="py-2 pr-3">{m.consent ? "Yes" : <span className="text-red-700">No</span>}</td>
                    <td className="py-2 pr-3">
                      {m.certificateNumber ? (
                        <>
                          <p className="font-mono text-xs">{m.certificateNumber}</p>
                          <p className="text-xs text-ink-600">{m.certificateStatus === "released" ? `Released · ${EMAIL_LABEL[m.emailStatus] || ""}` : "Hidden"}</p>
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-2">
                      {m.certificateNumber && (
                        <button type="button" disabled={busy === m.userId} onClick={() => reissue(m)} className="rounded-card border border-soil-200 px-2 py-1 text-xs text-ink-900 disabled:opacity-50">Reissue</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded-card border border-soil-200 px-3 py-1 text-ink-900 disabled:opacity-50">Previous</button>
            <span className="text-xs text-ink-600">Page {Math.floor(offset / limit) + 1} of {pages}</span>
            <button type="button" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)} className="rounded-card border border-soil-200 px-3 py-1 text-ink-900 disabled:opacity-50">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
