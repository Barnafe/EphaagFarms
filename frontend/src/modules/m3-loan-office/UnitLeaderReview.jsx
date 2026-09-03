import { useState } from "react";
import { apiFetch } from "../../api/client.js";

function ApplicantIndices({ loanId }) {
  const [indices, setIndices] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const data = await apiFetch(`/loans/${loanId}/applicant-indices`);
      setIndices(data);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!indices) {
    return (
      <button type="button" className="text-xs text-canopy-800 underline" onClick={load}>
        View raw grading points
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1 border-t border-soil-200 pt-2 text-xs">
      {error && <p className="text-red-700">{error}</p>}
      {indices.indices.map((idx) => (
        <div key={idx.key} className="flex justify-between text-ink-600">
          <span>{idx.label}</span>
          <span className="font-medium text-ink-900">
            {idx.points == null ? (idx.recommended ? "Recommended" : "Not yet") : `${idx.points} / ${idx.maxPoints}`}
          </span>
        </div>
      ))}
      <p className="pt-1 text-ink-600">
        Subtotal: {indices.subtotal} / {indices.subtotalMax}
      </p>
    </div>
  );
}

export default function UnitLeaderReview({ applications, onRecommend }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">
        Pending applications <span className="text-xs">(Unit Leader review)</span>
      </p>
      <div className="mt-3 space-y-3">
        {applications.length === 0 && (
          <p className="text-sm text-ink-600">Nothing pending in your unit.</p>
        )}
        {applications.map((app) => (
          <div key={app.id} className="rounded-card border border-soil-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{app.farmerName}</p>
                <p className="text-xs text-ink-600">
                  {{ aided: "Aided loan", boost_cash: "Boost Cash", business_fast_cash: "Business fast cash" }[app.loanType] || app.loanType} · ₦{app.amount.toLocaleString()}
                </p>
                <p className="text-xs text-ink-600">
                  Attendance {app.attendancePct}% · Courses {app.coursePct}%
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  onClick={() => onRecommend(app.id, "recommended")}
                >
                  Recommend
                </button>
                <button
                  className="btn-outline"
                  onClick={() => onRecommend(app.id, "rejected")}
                >
                  Decline
                </button>
              </div>
            </div>
            <ApplicantIndices loanId={app.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
