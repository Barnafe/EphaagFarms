import { useState } from "react";
import { apiFetch } from "../api/client.js";

// A running cost that is over its department's budget waits here for the Finance head's decision.
export default function CostDecision({ path, onDone }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision) {
    setBusy(true);
    try {
      await apiFetch(path, { method: "POST", body: { decision, note } });
      setError(null);
      await onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="field mt-2 rounded-card border border-harvest-200 bg-harvest-50 p-3">
      <p className="text-xs text-ink-900">This cost is over the department budget. It does not count until Finance approves it.</p>
      <input className="mt-2" aria-label="Reason for your decision" placeholder="Reason for your decision (at least 5 characters)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <button className="btn-primary" type="button" disabled={busy} onClick={() => decide("approve")}>Approve over budget</button>
        <button className="btn-outline" type="button" disabled={busy} onClick={() => decide("reject")}>Reject</button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function BudgetLine({ budget }) {
  if (!budget) return null;
  if (!budget.configured) return <p className="text-xs text-ink-600">No budget is set for this department this year, so there is no limit.</p>;
  const n = (v) => `₦${Number(v).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
  return (
    <p className="text-xs text-ink-600">
      {budget.year} budget {n(budget.amount)}: used {n(budget.committed)} ({budget.percentUsed}%), left {n(Math.max(0, budget.remaining))}.
      {budget.exhausted ? " The budget is used up. New costs wait for Finance." : ""}
    </p>
  );
}
