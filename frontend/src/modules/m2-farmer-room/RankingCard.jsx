import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function RankingCard() {
  const [ranking, setRanking] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/farmers/me/ranking")
      .then(setRanking)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return null;
  if (!ranking) return null;

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Training rank</p>
      <p className="mt-1 text-lg font-medium text-canopy-800">{ranking.rankLabel}</p>
      <p className="mt-1 text-xs text-ink-600">
        {ranking.quartersEngaged} training quarter{ranking.quartersEngaged === 1 ? "" : "s"} completed
        {ranking.nextRankLabel ? ` · next: ${ranking.nextRankLabel}` : ""}
      </p>
    </div>
  );
}
