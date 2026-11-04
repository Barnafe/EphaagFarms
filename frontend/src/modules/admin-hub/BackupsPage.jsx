import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const when = (v) => (v ? new Date(v).toLocaleString() : "never");
const mb = (b) => (b ? `${(Number(b) / 1048576).toFixed(1)} MB` : "");
const STATUS = { ok: ["Saved in both places", "text-canopy-800"], partial: ["Saved in only one place", "text-harvest-600"], failed: ["Failed", "text-red-700"], running: ["Running", "text-ink-600"] };

export default function BackupsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try { setData(await apiFetch("/system/backups")); setErr(""); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setBusy(true); setNote(""); setErr("");
    try {
      const r = await apiFetch("/system/backups/run", { method: "POST", body: {} });
      setNote(r.result?.skipped ? `Nothing was backed up: ${r.result.reason}` : r.status === "ok" ? "Backup finished and saved in both places." : `The backup did not complete: ${r.error || r.status}`);
      setData(r.backups);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const c = data?.configured;
  return (
    <AdminDashboardShell>
      <div className="max-w-4xl space-y-4">
        <div className="card space-y-3">
          <div className="flex items-center gap-2"><DatabaseBackup size={18} className="text-canopy-700" /><p className="text-sm font-medium text-ink-900">Database backups</p></div>
          <p className="text-xs text-ink-600">
            Every night at 02:00 (Lagos) the whole database is saved, encrypted, in two places. Copies are kept for {data?.retentionDays ?? 30} days.
            If a backup fails the admins are emailed and the named person gets an SMS. To restore, follow docs/BACKUP-AND-RESTORE.md.
          </p>
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          {note && <p className="text-xs text-ink-800" role="status">{note}</p>}
          {data && (
            <>
              {data.stale && <p className="rounded-card border border-red-200 bg-red-50 p-2 text-xs text-red-700" data-testid="backup-stale">No successful backup in the last 26 hours{data.lastOk ? ` (the last one was ${when(data.lastOk.started_at)})` : " (none has completed yet)"}.</p>}
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-ink-600">Last good backup</dt><dd className="text-ink-900" data-testid="backup-last-ok">{data.lastOk ? `${when(data.lastOk.started_at)} (${mb(data.lastOk.bytes)})` : "none yet"}</dd></div>
                <div><dt className="text-xs text-ink-600">Backup tool on the server</dt><dd className="text-ink-900">{data.pgDump || "not installed"}</dd></div>
                <div><dt className="text-xs text-ink-600">Place 1</dt><dd className="text-ink-900">{c.primary || "not set up"}</dd></div>
                <div><dt className="text-xs text-ink-600">Place 2</dt><dd className="text-ink-900">{c.secondary || "not set up"}</dd></div>
                <div><dt className="text-xs text-ink-600">Encryption key</dt><dd className="text-ink-900">{c.encryptionKey ? "set" : "missing"}</dd></div>
                <div><dt className="text-xs text-ink-600">Direct database address</dt><dd className="text-ink-900">{c.directDatabaseAddress ? "set" : "using the normal address"}</dd></div>
              </dl>
              <button type="button" className="btn-primary" disabled={busy} onClick={runNow}>{busy ? "Backing up…" : "Back up now"}</button>
            </>
          )}
        </div>

        <div className="card">
          <p className="text-sm font-medium text-ink-900">Recent backups</p>
          <ul className="mt-2 space-y-2" data-testid="backup-runs">
            {(data?.runs || []).length === 0 && <li className="text-sm text-ink-600">No backups yet.</li>}
            {(data?.runs || []).map((r) => {
              const [label, tone] = STATUS[r.status] || [r.status, "text-ink-600"];
              return (
                <li key={r.id} className="rounded-card border border-soil-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink-900">{when(r.started_at)} <span className="text-xs text-ink-600">({r.trigger === "manual" ? "run by an admin" : "nightly"})</span></span>
                    <span className={`text-xs font-medium ${tone}`}>{label}</span>
                  </div>
                  <p className="text-xs text-ink-600">{mb(r.bytes)}{r.object_key ? ` · ${r.object_key}` : ""}{r.deleted_old ? ` · ${r.deleted_old} old copy(ies) removed` : ""}</p>
                  {r.error && <p className="text-xs text-red-700">{r.error}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AdminDashboardShell>
  );
}
