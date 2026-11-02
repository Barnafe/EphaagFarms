import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { rankLabel } from "../../utils/governance.js";

// The farmer's home: three plain cards, User ID, Rank and Training rank.
export default function DashboardCards({ user, rank }) {
  const [ranking, setRanking] = useState(null);

  useEffect(() => {
    apiFetch("/farmers/me/ranking").then(setRanking).catch(() => setRanking(null));
  }, []);

  const userId = user?.referral_code || user?.referralCode || (user?.id ? "EPH" + String(user.id).replace(/-/g, "").slice(0, 6).toUpperCase() : "");

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="card">
        <p className="text-sm text-ink-600">User ID</p>
        <p className="mt-1 break-all font-mono text-lg font-medium text-canopy-800">{userId}</p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-600">Rank</p>
        <p className="mt-1 text-lg font-medium text-canopy-800">{rankLabel(rank)}</p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-600">Training rank</p>
        <p className="mt-1 text-lg font-medium text-canopy-800">{ranking ? ranking.rankLabel : "Loading…"}</p>
        {ranking && (
          <p className="mt-1 text-xs text-ink-600">
            {ranking.quartersEngaged} training quarter{ranking.quartersEngaged === 1 ? "" : "s"} completed
            {ranking.nextRankLabel ? `, next: ${ranking.nextRankLabel}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
