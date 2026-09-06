import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

// Unit Leader tool (2026-09-06 spec): a direct, one-time gate — pick a
// farmer from your own jurisdiction BEFORE they've applied for anything,
// give a reason, and their next loan application skips straight past the
// normal pending-review queue. Separate from reviewing an
// already-submitted pending application (that's still done in the
// Loan Office's Unit Leader review screen) — this is proactive.
export default function RecommendationTool({ farmers, onIssued }) {
  const [open, setOpen] = useState(false);
  const [farmerId, setFarmerId] = useState("");
  const [reason, setReason] = useState("");
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadTickets() {
    try {
      const { tickets: t } = await apiFetch("/loans/recommendation-tickets/issued");
      setTickets(t);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!farmerId || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/loans/recommendation-tickets", {
        method: "POST",
        body: { farmerId, reason: reason.trim() },
      });
      setFarmerId("");
      setReason("");
      setOpen(false);
      await loadTickets();
      onIssued?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const unusedFarmerIds = new Set((tickets || []).filter((t) => !t.used_at).map((t) => t.farmer_id));

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink-800">Recommend a farmer</p>
          <p className="mt-0.5 text-xs text-ink-600">
            A one-time free pass for a loan application — skips the normal review queue entirely.
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-canopy-800 underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : "Recommend"}
        </button>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      {open && (
        <form onSubmit={handleSubmit} className="space-y-2 border-t border-soil-100 pt-3">
          <div>
            <label className="text-xs text-ink-600">Farmer</label>
            <select
              className="mt-1 w-full"
              value={farmerId}
              onChange={(e) => setFarmerId(e.target.value)}
              required
            >
              <option value="">Select a farmer under you…</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id} disabled={unusedFarmerIds.has(f.id)}>
                  {f.name}
                  {unusedFarmerIds.has(f.id) ? " (already has an unused ticket)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-ink-600">Reason for recommending</label>
            <textarea
              className="mt-1 w-full"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this farmer deserve to skip the normal review?"
              required
            />
          </div>
          <button type="submit" className="btn-primary text-xs" disabled={submitting}>
            {submitting ? "Submitting…" : "Issue recommendation"}
          </button>
        </form>
      )}

      {tickets && tickets.length > 0 && (
        <div className="border-t border-soil-100 pt-3 space-y-1.5">
          <p className="text-xs font-medium text-ink-700">Tickets you've issued</p>
          {tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs text-ink-600">
              <span>
                {t.farmer_name} — {t.reason}
              </span>
              <span className={t.used_at ? "text-ink-500" : "font-medium text-canopy-800"}>
                {t.used_at ? "Used" : "Unused"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
