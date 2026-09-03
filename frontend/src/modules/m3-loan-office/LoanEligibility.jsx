export default function LoanEligibility({ indices, history, onLoadHistory }) {
  if (!indices) return null;

  // Farmer-facing display shows percentage only — the underlying points
  // are how the company grades applicants internally and stay internal
  // (see admin/Finance's applicant-indices view for the raw points).
  const scored = indices.indices.filter((idx) => idx.maxPoints != null);
  const leaderRec = indices.indices.find((idx) => idx.key === "unit_leader_recommendation");

  return (
    <div className="space-y-3">
      <div className="card">
        <p className="text-sm text-ink-600">Your standing</p>
        <p className="mt-1 text-xs text-ink-600">
          Savings consistency, repayment history, and training attendance — updated automatically.
        </p>
        <div className="mt-3 space-y-2">
          {scored.map((idx) => {
            const pct = Math.round((idx.points / idx.maxPoints) * 100);
            return (
              <div key={idx.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-700">{idx.label}</span>
                  <span className="font-medium text-canopy-800">{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-soil-100">
                  <div className="h-full bg-canopy-600" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                {idx.note && <p className="mt-0.5 text-xs text-ink-600">{idx.note}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {leaderRec && (
        <div className="card">
          <p className="text-sm text-ink-600">Unit Leader support</p>
          <p className="mt-1 text-xs text-ink-600">
            Separate from the above — your Unit Leader works closely with you and can vouch for you
            even if you haven't fully met every condition yet.
          </p>
          <p className="mt-2 text-sm font-medium text-canopy-800">
            {leaderRec.recommended ? "Supported by your Unit Leader" : "No recommendation yet"}
          </p>
        </div>
      )}

      {onLoadHistory && (
        <div className="card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-600">Standing over time</p>
            {!history && (
              <button type="button" className="text-xs text-canopy-800 underline" onClick={onLoadHistory}>
                Show history
              </button>
            )}
          </div>
          {history && (
            <div className="mt-3 space-y-2">
              {history.length === 0 && <p className="text-sm text-ink-600">No past quarters recorded yet.</p>}
              {history.map((h) => (
                <div key={h.quarterStart} className="flex justify-between text-xs text-ink-700">
                  <span>Quarter starting {h.quarterStart}</span>
                  <span>
                    Savings {h.savingsPoints} · Repayment {h.repaymentPoints} · Training {h.trainingPoints} · Funds use {h.fundsUtilizationPoints}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
