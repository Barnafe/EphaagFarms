import { useState } from "react";
import {
  AIDED_LEVELS,
  BOOST_MONTHS,
  FAST_CASH_MONTHS,
  FAST_CASH_TIERS,
  LOAN_TYPE_LABELS,
  naira,
} from "../../data/financingBanner.js";

// Every figure on this form comes from the approved financing banner:
//  LT1 Progressive Savings Loan — fixed per level (savings -> loan, months)
//  LT2 Business Boost           — fixed loan per verified 25% deposit, 5 months
//  LT3 Business Enlargement     — 100k / 200k / 300k, repay double, 8 months
// The amount and repayment period are never typed in for LT1/LT2.
export default function LoanApplicationForm({ onSubmit, eligibleDeposits = [], mainSavingsBalance = 0, aidedTerms }) {
  const [loanType, setLoanType] = useState("aided");
  const [fastAmount, setFastAmount] = useState(FAST_CASH_TIERS[0].loan);
  const [reason, setReason] = useState("");
  const [depositId, setDepositId] = useState(eligibleDeposits[0]?.id || "");

  const level = aidedTerms?.level ?? 1;
  const lvl = AIDED_LEVELS[Math.min(level, AIDED_LEVELS.length) - 1];
  const savingsShort = Math.max(lvl.savings - mainSavingsBalance, 0);
  const fastTier = FAST_CASH_TIERS.find((t) => t.loan === Number(fastAmount)) || FAST_CASH_TIERS[0];

  const blocked =
    (loanType === "aided" && savingsShort > 0) ||
    (loanType === "boost_cash" && eligibleDeposits.length === 0);

  function handleSubmit(e) {
    e.preventDefault();
    if (blocked) return;
    if (loanType === "aided") onSubmit({ loanType, reason });
    else if (loanType === "boost_cash") onSubmit({ loanType, depositId: depositId || eligibleDeposits[0]?.id, reason });
    else onSubmit({ loanType, amount: Number(fastAmount), reason });
    setReason("");
  }

  return (
    <form onSubmit={handleSubmit} className="card field space-y-3">
      <p className="text-sm text-ink-600">Apply for a loan</p>

      <div>
        <label>Loan type</label>
        <select value={loanType} onChange={(e) => setLoanType(e.target.value)}>
          <option value="aided">{LOAN_TYPE_LABELS.aided} — 0% interest</option>
          <option value="boost_cash">{LOAN_TYPE_LABELS.boost_cash} — 25% deposit</option>
          <option value="business_fast_cash">{LOAN_TYPE_LABELS.business_fast_cash} — 100% interest</option>
        </select>
      </div>

      {loanType === "aided" && (
        <div className="space-y-2 text-xs">
          <div className="rounded-card bg-soil-50 p-3 text-ink-900">
            <p className="font-medium">Your level: {lvl.level} of {AIDED_LEVELS.length}</p>
            <p className="mt-1">
              Savings needed {naira(lvl.savings)} → you receive {naira(lvl.loan)}, repaid over {lvl.months} months
              (no interest).
            </p>
            <p className="mt-1 text-ink-600">Your main savings balance: {naira(mainSavingsBalance)}</p>
            {savingsShort > 0 ? (
              <p className="mt-1 text-red-700">Save {naira(savingsShort)} more to apply for this level.</p>
            ) : (
              <p className="mt-1 text-canopy-800">You qualify for the {naira(lvl.loan)} loan.</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-ink-600">
                <tr><th className="pr-2 font-medium">Level</th><th className="pr-2 font-medium">Savings</th><th className="pr-2 font-medium">Loan</th><th className="font-medium">Months</th></tr>
              </thead>
              <tbody>
                {AIDED_LEVELS.map((l) => (
                  <tr key={l.level} className={l.level === lvl.level ? "font-medium text-canopy-800" : "text-ink-600"}>
                    <td className="pr-2">{l.level}</td><td className="pr-2">{naira(l.savings)}</td><td className="pr-2">{naira(l.loan)}</td><td>{l.months}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-600">You move up a level each time you fully repay a loan.</p>
        </div>
      )}

      {loanType === "boost_cash" && (
        <div className="text-xs">
          <p className="text-ink-600">Repayment: {BOOST_MONTHS} months, fixed. Your 25% deposit is paid up front.</p>
          {eligibleDeposits.length === 0 ? (
            <p className="mt-2 text-sm text-harvest-600">
              You don't have an eligible Business Boost deposit yet — declare one below and get it verified first
              (it needs to mature before it's usable).
            </p>
          ) : (
            <div className="mt-2">
              <label className="text-sm">Use verified deposit</label>
              <select value={depositId} onChange={(e) => setDepositId(e.target.value)}>
                {eligibleDeposits.map((d) => (
                  <option key={d.id} value={d.id}>
                    {naira(d.intendedLoanAmount)} loan ({naira(d.depositAmount)} deposit paid)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {loanType === "business_fast_cash" && (
        <div className="text-xs">
          <label className="text-sm">Loan amount</label>
          <select value={fastAmount} onChange={(e) => setFastAmount(Number(e.target.value))}>
            {FAST_CASH_TIERS.map((t) => (
              <option key={t.loan} value={t.loan}>{naira(t.loan)}</option>
            ))}
          </select>
          <p className="mt-2 text-ink-600">
            100% interest: you repay {naira(fastTier.repay)} over {FAST_CASH_MONTHS} months. For faithful
            participants only.
          </p>
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

      <button className="btn-primary" type="submit" disabled={blocked}>
        Submit application
      </button>
    </form>
  );
}
