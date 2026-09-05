import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

export default function ApprovalCenterPanel() {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    try {
      const [{ requests }, { approvals }] = await Promise.all([
        apiFetch("/finance-department/approvals/pending"),
        apiFetch("/finance-department/approvals/history"),
      ]);
      setPending(requests);
      setHistory(approvals);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id, decision) {
    let comment = "";
    if (["rejected", "returned", "clarification_requested"].includes(decision)) {
      comment = prompt("Add a comment (optional):") || "";
    }
    try {
      await apiFetch(`/finance-department/requests/${id}/decide`, { method: "POST", body: { decision, comment } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-sm text-ink-600">Pending approvals</p>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-3 space-y-2">
          {pending.length === 0 && <p className="text-sm text-ink-600">Nothing waiting on a decision.</p>}
          {pending.map((r) => (
            <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
              <p className="font-medium text-ink-900">{r.purpose}</p>
              <p className="text-xs text-ink-600">
                {r.reference} · {r.department} · ₦{Number(r.amount).toLocaleString()} · by {r.requester_name || "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn-primary" type="button" onClick={() => decide(r.id, "approved")}>Approve</button>
                <button className="btn-outline" type="button" onClick={() => decide(r.id, "rejected")}>Reject</button>
                <button className="btn-outline" type="button" onClick={() => decide(r.id, "returned")}>Return for correction</button>
                <button className="btn-outline" type="button" onClick={() => decide(r.id, "clarification_requested")}>Request clarification</button>
                <button className="btn-outline" type="button" onClick={() => decide(r.id, "escalated")}>Escalate</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">Approval history</p>
          <button className="text-xs text-canopy-700 underline" type="button" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide" : "Show"}
          </button>
        </div>
        {showHistory && (
          <div className="mt-3 space-y-2">
            {history.length === 0 && <p className="text-sm text-ink-600">No decisions recorded yet.</p>}
            {history.map((h) => (
              <div key={h.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
                <p className="text-ink-900">
                  {h.request_reference} — {h.decision.replace(/_/g, " ")} by {h.approver_name || "—"}
                </p>
                <p className="text-xs text-ink-600">{h.purpose}{h.comment ? ` · "${h.comment}"` : ""}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
