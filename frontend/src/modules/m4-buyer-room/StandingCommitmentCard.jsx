import { useState } from "react";

export default function StandingCommitmentCard({ commitment, onCommit }) {
  const [amount, setAmount] = useState("");
  const [years, setYears] = useState(1);

  function handleSubmit(e) {
    e.preventDefault();
    if (!amount) return;
    onCommit({
      active: true,
      totalCommitted: Number(amount),
      balanceRemaining: Number(amount),
      durationYears: years,
    });
    setAmount("");
  }

  if (commitment.active) {
    const pctUsed = Math.round(
      ((commitment.totalCommitted - commitment.balanceRemaining) / commitment.totalCommitted) * 100
    );
    return (
      <div className="card">
        <p className="text-sm text-ink-600">Standing commitment</p>
        <p className="mt-1 text-lg font-medium text-canopy-800">
          ₦{commitment.balanceRemaining.toLocaleString()} remaining
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-soil-100">
          <div className="h-full bg-canopy-600" style={{ width: `${pctUsed}%` }} />
        </div>
        <p className="mt-1 text-xs text-ink-600">
          ₦{commitment.totalCommitted.toLocaleString()} committed over {commitment.durationYears}{" "}
          year(s) — orders draw down from this balance instead of paying per order.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card field space-y-3">
      <p className="text-sm text-ink-600">Set up a standing commitment (1–2 years)</p>
      <p className="text-xs text-ink-600">
        Prepay a lump sum now, then place orders against it over the committed period
        instead of paying per order.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label>Amount to commit (₦)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 2000000"
          />
        </div>
        <div>
          <label>Duration</label>
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            <option value={1}>1 year</option>
            <option value={2}>2 years</option>
          </select>
        </div>
      </div>
      <button className="btn-primary" type="submit">
        Commit funds
      </button>
    </form>
  );
}
