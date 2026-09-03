import { useState } from "react";

export default function BoostDepositPanel({ deposits, onDeclare }) {
  const [intendedAmount, setIntendedAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!intendedAmount) return;
    setSubmitting(true);
    try {
      await onDeclare(Number(intendedAmount));
      setIntendedAmount("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Boost Cash deposits</p>
      <p className="mt-1 text-xs text-ink-600">
        Declare how much you want to borrow — you'll pay 25% upfront. Once Finance verifies it, wait at
        least a month before it becomes usable for an application.
      </p>

      <form onSubmit={handleSubmit} className="field mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label>Amount you want to borrow (₦)</label>
          <input
            type="number"
            min="0"
            value={intendedAmount}
            onChange={(e) => setIntendedAmount(e.target.value)}
            placeholder="e.g. 200000"
          />
          {intendedAmount && (
            <p className="mt-1 text-xs text-ink-600">
              25% deposit required: ₦{Math.round(Number(intendedAmount) * 0.25).toLocaleString()}
            </p>
          )}
        </div>
        <button className="btn-outline" type="submit" disabled={submitting}>
          {submitting ? "Declaring…" : "Declare deposit"}
        </button>
      </form>

      {deposits.length > 0 && (
        <div className="mt-4 space-y-2">
          {deposits.map((d) => (
            <div key={d.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
              <p className="text-ink-900">
                ₦{d.intendedLoanAmount.toLocaleString()} loan — ₦{d.depositAmount.toLocaleString()} deposit
              </p>
              <p className="text-xs text-ink-600">
                {d.usedForLoanId
                  ? "Already used for a loan application"
                  : !d.verifiedAt
                  ? "Awaiting Finance verification"
                  : d.isEligible
                  ? "Verified — usable now"
                  : `Verified — usable from ${d.eligibleFrom ? new Date(d.eligibleFrom).toLocaleDateString() : "—"}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
