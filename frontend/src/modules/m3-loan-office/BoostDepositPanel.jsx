import { useState } from "react";
import { BOOST_TIERS, BOOST_MONTHS, naira } from "../../data/financingBanner.js";

// LT2 Business Boost — pick one of the banner's four loan sizes; the 25%
// deposit follows from it (12,500 -> 50,000, 25,000 -> 100,000,
// 50,000 -> 200,000, 75,000 -> 300,000).
export default function BoostDepositPanel({ deposits, onDeclare }) {
  const [loanAmount, setLoanAmount] = useState(BOOST_TIERS[0].loan);
  const [submitting, setSubmitting] = useState(false);
  const tier = BOOST_TIERS.find((t) => t.loan === Number(loanAmount)) || BOOST_TIERS[0];

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onDeclare(Number(loanAmount));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Business Boost deposits</p>
      <p className="mt-1 text-xs text-ink-600">
        Choose your loan, then pay the 25% deposit. Once Finance verifies it, the deposit has a 1–90 day maturity
        period before it can be used for an application. Repayment is {BOOST_MONTHS} months.
      </p>

      <form onSubmit={handleSubmit} className="field mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label>Loan you want</label>
          <select value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))}>
            {BOOST_TIERS.map((t) => (
              <option key={t.loan} value={t.loan}>
                {naira(t.loan)} loan — {naira(t.deposit)} deposit
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-600">25% deposit required: {naira(tier.deposit)}</p>
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
                {naira(d.intendedLoanAmount)} loan — {naira(d.depositAmount)} deposit
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
