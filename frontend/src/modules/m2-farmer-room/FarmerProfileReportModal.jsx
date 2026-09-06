import { useEffect, useState } from "react";
import { apiFetch, apiUpload } from "../../api/client.js";

export default function FarmerProfileReportModal({ farmerId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    apiFetch(`/farmers/jurisdiction/${farmerId}`)
      .then((res) => setProfile(res.profile))
      .catch((err) => setError(err.message));
  }, [farmerId]);

  async function handleSubmitReport(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("reportedUserId", farmerId);
      formData.append("reason", reason.trim());
      if (proofFile) formData.append("proof", proofFile);
      await apiUpload("/profile-reports", formData);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink-900">Farmer profile</p>
          <button type="button" onClick={onClose} className="text-sm text-ink-600">
            Close
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        {!profile && !error && <p className="mt-3 text-sm text-ink-600">Loading…</p>}

        {profile && !reporting && !submitted && (
          <div className="mt-3 space-y-2 text-sm">
            <p><span className="text-ink-600">Name:</span> {profile.name}</p>
            <p><span className="text-ink-600">Unit:</span> {profile.unit}</p>
            <p><span className="text-ink-600">Rank:</span> {profile.rank}</p>
            <p><span className="text-ink-600">Farm type:</span> {profile.farm_type || "—"}</p>
            <p><span className="text-ink-600">Crops:</span> {(profile.crops || []).join(", ") || "—"}</p>
            <p><span className="text-ink-600">Attendance:</span> {profile.attendance_pct ?? 0}%</p>
            <p><span className="text-ink-600">Course completion:</span> {profile.course_pct ?? 0}%</p>
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="mt-3 rounded-card border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700"
            >
              Report this profile
            </button>
          </div>
        )}

        {profile && reporting && !submitted && (
          <form onSubmit={handleSubmitReport} className="mt-3 space-y-3">
            <div>
              <label className="text-sm text-ink-600">Reason</label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
                placeholder="What's the issue with this profile?"
              />
            </div>
            <div>
              <label className="text-sm text-ink-600">Proof image (optional)</label>
              <input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-card bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
              <button type="button" onClick={() => setReporting(false)} className="text-xs text-ink-600">
                Cancel
              </button>
            </div>
          </form>
        )}

        {submitted && (
          <p className="mt-3 text-sm text-canopy-800">
            Report submitted — it's now pending admin review.
          </p>
        )}
      </div>
    </div>
  );
}
