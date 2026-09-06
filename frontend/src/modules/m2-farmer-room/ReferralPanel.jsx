import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function ReferralPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/referrals/me")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-ink-600">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-sm text-ink-600">Your referral code</p>
        <p className="mt-1 text-lg font-medium text-canopy-800">{data.code}</p>
        <p className="mt-1 text-xs text-ink-600">
          Share this code — anyone who enters it at registration shows up below. Referral is optional for them, so
          not everyone will use it.
        </p>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">
          People who registered with your code <span className="text-xs">({data.referredCount})</span>
        </p>
        <div className="mt-3 space-y-2">
          {data.referred.length === 0 && (
            <p className="text-sm text-ink-600">No one has used your code yet.</p>
          )}
          {data.referred.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink-900">{r.name}</p>
                <p className="text-xs text-ink-600 capitalize">{r.roleType}</p>
              </div>
              <p className="text-xs text-ink-600">{new Date(r.joinedAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
