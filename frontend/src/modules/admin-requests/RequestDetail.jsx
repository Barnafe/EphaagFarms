import { useState } from "react";
import { getToken, BASE_URL } from "../../api/client.js";

const STEP_TONE = {
  pending: "bg-harvest-50 text-harvest-600",
  approved: "bg-canopy-50 text-canopy-800",
  rejected: "bg-red-50 text-red-700",
  skipped: "bg-soil-100 text-ink-600",
};

async function openAttachment(requestId) {
  const res = await fetch(`${BASE_URL}/requests/${requestId}/attachment`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), "_blank");
}

export default function RequestDetail({ request, currentUserId, onBack, onDecide, onCancel }) {
  const [note, setNote] = useState("");

  const currentStep = request.steps.find((s) => s.status === "pending");
  const canDecide =
    request.status === "pending" &&
    currentStep &&
    (currentStep.approver_id === currentUserId || currentStep.approver_id === null);
  const canCancel = request.status === "pending" && request.requester_id === currentUserId;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button type="button" className="text-sm text-canopy-800" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn-outline" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="card">
        <p className="text-xs font-medium text-canopy-800">{request.reference}</p>
        <p className="mt-1 text-lg font-medium text-ink-900">{request.title}</p>
        <p className="text-sm text-ink-600">{request.department}</p>
        {request.description && <p className="mt-2 text-sm text-ink-700">{request.description}</p>}
        <p className="mt-2 text-xs text-ink-600">
          Requested by {request.requester_name} on {new Date(request.created_at).toLocaleDateString()}
        </p>
        {request.attachment_url && (
          <button
            type="button"
            className="mt-1 inline-block text-sm text-canopy-800 underline print:hidden"
            onClick={() => openAttachment(request.id)}
          >
            View attachment
          </button>
        )}
        <p className="mt-1 text-sm font-medium text-ink-900">Status: {request.status}</p>
      </div>

      <div className="card mt-4">
        <p className="text-sm text-ink-600">Approval trail</p>
        <div className="mt-3 space-y-2">
          {request.steps.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink-900">{s.label}</p>
                <p className="text-xs text-ink-600">
                  {s.approver_name || "Any admin"}
                  {s.decided_by_name ? ` · decided by ${s.decided_by_name}` : ""}
                  {s.decided_at ? ` on ${new Date(s.decided_at).toLocaleString()}` : ""}
                </p>
                {s.note && <p className="text-xs text-ink-600">Note: {s.note}</p>}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STEP_TONE[s.status]}`}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>

      {canDecide && (
        <div className="card mt-4 print:hidden">
          <p className="text-sm text-ink-600">Your decision — {currentStep.label}</p>
          <textarea
            className="mt-2"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
          />
          <div className="mt-3 flex gap-3">
            <button className="btn-outline flex-1" type="button" onClick={() => onDecide(currentStep.id, "rejected", note)}>
              Reject
            </button>
            <button className="btn-primary flex-1" type="button" onClick={() => onDecide(currentStep.id, "approved", note)}>
              Approve
            </button>
          </div>
        </div>
      )}

      {canCancel && (
        <div className="mt-4 print:hidden">
          <button className="btn-outline" type="button" onClick={onCancel}>
            Cancel request
          </button>
        </div>
      )}
    </div>
  );
}
