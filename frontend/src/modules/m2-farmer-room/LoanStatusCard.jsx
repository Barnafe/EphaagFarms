export default function LoanStatusCard({ loanStatus }) {
  const { hasLoan, amount, repaidAmount } = loanStatus;
  const pctRepaid = hasLoan ? Math.round((repaidAmount / amount) * 100) : 0;
  const isFree = !hasLoan || pctRepaid >= 70;

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Selling status</p>
      <p className="mt-1 text-lg font-medium text-ink-900">
        {isFree ? "Free to sell independently" : "Loan-bound — must sell through Ephaag Farms"}
      </p>

      {hasLoan && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-soil-100">
            <div
              className="h-full bg-canopy-600"
              style={{ width: `${Math.min(pctRepaid, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-600">
            {pctRepaid}% of loan repaid — {isFree ? "70% threshold met" : "70% needed to sell freely"}
          </p>
        </div>
      )}

      <a href="/dashboard/farmer/loans" className="mt-3 inline-block text-sm text-canopy-800">
        View Loan Office (Module 3) →
      </a>
    </div>
  );
}
