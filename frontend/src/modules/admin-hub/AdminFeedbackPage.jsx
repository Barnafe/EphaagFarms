import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const categoryLabels = {
  challenge: "A challenge",
  maltreatment: "Maltreatment from leadership",
  suspicious_activity: "Suspicious activity",
  recommendation: "A recommendation",
  other: "Something else",
};

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { feedback: f } = await apiFetch("/farmers/admin/feedback");
      setFeedback(f);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReview(id) {
    try {
      await apiFetch(`/farmers/admin/feedback/${id}/review`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Feedback</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Direct from farmers — challenges, leadership concerns, suspicious activity, and recommendations.
          </p>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="card">
          {loading ? (
            <p className="text-sm text-ink-600">Loading…</p>
          ) : feedback.length === 0 ? (
            <p className="text-sm text-ink-600">Nothing submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {feedback.map((f) => (
                <div key={f.id} className="rounded-card border border-soil-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-canopy-800">
                      {categoryLabels[f.category] || f.category} — {f.farmerName}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        f.status === "reviewed" ? "bg-canopy-50 text-canopy-800" : "bg-harvest-50 text-harvest-600"
                      }`}
                    >
                      {f.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-900">{f.message}</p>
                  {f.status !== "reviewed" && (
                    <button className="btn-outline mt-2" type="button" onClick={() => handleReview(f.id)}>
                      Mark reviewed
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
