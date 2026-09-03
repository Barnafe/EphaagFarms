import { useState } from "react";

const LOAN_TYPES = [
  { value: "aided", label: "Aided loan — no interest", months: [5, 8, 11] },
  { value: "boost_cash", label: "Boost Cash — 25% upfront deposit, verified in advance", months: [5] },
  { value: "business_fast_cash", label: "Business fast cash — 100% interest", months: [8] },
];

export default function LoanApplicationForm({ onSubmit, eligibleDeposits = [], mainSavingsBalance = 0, aidedTerms }) {
  const [loanType, setLoanType] = useState("aided");
  const [repaymentMonths, setRepaymentMonths] = useState(5);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [depositId, setDepositId] = useState(eligibleDeposits[0]?.id || "");

  const current = LOAN_TYPES.find((t) => t.value === loanType);
  const requestedAmount = Number(amount) || 0;
  const overSavings = loanType === "aided" && requestedAmount > mainSavingsBalance;
  const projectedLoanAmount = loanType === "aided" && requestedAmount > 0 && !overSavings ? requestedAmount * 2 : null;

  function handleTypeChange(value) {
    setLoanType(value);
    const t = LOAN_TYPES.find((x) => x.value === value);
    setRepaymentMonths(t.months[0]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (loanType === "boost_cash") {
      if (!depositId) return;
      onSubmit({ loanType, depositId, repaymentMonths, reason });
    } else {
      if (!amount) return;
      if (loanType === "aided" && overSavings) return;
      onSubmit({ loanType, amount: Number(amount), repaymentMonths, reason });
      setAmount("");
    }
    setReason("");
  }

  return (
    <form onSubmit={handleSubmit} className="card field space-y-3">
      <p className="text-sm text-ink-600">Apply for a loan</p>

      <div>
        <label>Loan type</label>
        <select value={loanType} onChange={(e) => handleTypeChange(e.target.value)}>
          {LOAN_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {loanType === "aided" && (
        <p className="text-xs text-ink-600">
          Repayment: {aidedTerms?.forcedRepaymentMonths ?? 5} months, fixed — this is your{" "}
          {aidedTerms?.borrowNumber === 1 ? "1st" : aidedTerms?.borrowNumber === 2 ? "2nd" : `${aidedTerms?.borrowNumber ?? 1}th`}{" "}
          Aided loan, so the duration isn't a choice.
        </p>
      )}
      {loanType !== "aided" && current.months.length > 1 && (
        <div>
          <label>Repayment duration</label>
          <select value={repaymentMonths} onChange={(e) => setRepaymentMonths(Number(e.target.value))}>
            {current.months.map((m) => (
              <option key={m} value={m}>{m} months</option>
            ))}
          </select>
        </div>
      )}
      {loanType !== "aided" && current.months.length === 1 && (
        <p className="text-xs text-ink-600">Repayment: {current.months[0]} months, fixed for this loan type.</p>
      )}

      {loanType === "boost_cash" && (
        <div>
          {eligibleDeposits.length === 0 ? (
            <p className="text-sm text-harvest-600">
              You don't have an eligible Boost Cash deposit yet — declare and get one verified below first
              (it takes at least a month after verification before it's usable).
            </p>
          ) : (
            <>
              <label>Use verified deposit</label>
              <select value={depositId} onChange={(e) => setDepositId(e.target.value)}>
                {eligibleDeposits.map((d) => (
                  <option key={d.id} value={d.id}>
                    ₦{d.intendedLoanAmount.toLocaleString()} loan (₦{d.depositAmount.toLocaleString()} deposit paid)
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {loanType !== "boost_cash" && (
        <div>
          <label>{loanType === "aided" ? "Amount requested (₦) — from your savings" : "Amount requested (₦)"}</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 200000"
          />
          {loanType === "aided" && (
            <div className="mt-1 text-xs">
              <p className="text-ink-600">Your main savings balance: ₦{mainSavingsBalance.toLocaleString()}</p>
              {overSavings && (
                <p className="text-red-700">
                  You can't request more than your savings balance (₦{mainSavingsBalance.toLocaleString()}).
                </p>
              )}
              {projectedLoanAmount != null && (
                <p className="text-canopy-800">
                  You'll receive ₦{projectedLoanAmount.toLocaleString()} — automatically double your requested amount.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <label>Reason / what it's for</label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Seed and fertilizer for the new planting season"
        />
      </div>

      <button
        className="btn-primary"
        type="submit"
        disabled={(loanType === "boost_cash" && eligibleDeposits.length === 0) || (loanType === "aided" && overSavings)}
      >
        Submit application
      </button>
    </form>
  );
}
