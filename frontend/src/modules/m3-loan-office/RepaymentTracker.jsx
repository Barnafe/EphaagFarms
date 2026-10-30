import { useState } from "react";

export default function RepaymentTracker({ loan, onPay }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const owed = loan.repayableTotal || loan.amount; // includes LT3's 100% interest
  const totalRepaid = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
  const outstanding = Math.max(owed - totalRepaid, 0);
  const pctRepaid = Math.round((totalRepaid / owed) * 100);
  const isFree = pctRepaid >= 70;

  async function handleSubmit(e) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 100 || n > outstanding) return;
    setBusy(true);
    try { await onPay(n); } finally { setBusy(false); }
  }

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm text-ink-600">Repayment progress</p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-soil-100">
          <div
            className="h-full bg-canopy-600"
            style={{ width: `${Math.min(pctRepaid, 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-ink-600">
          ₦{totalRepaid.toLocaleString()} of ₦{owed.toLocaleString()} repaid ({pctRepaid}%)
          — {isFree ? "70% threshold met, free to sell" : "70% needed to sell freely"}
        </p>
      </div>

      <div>
        <p className="text-sm text-ink-600">Repayment history</p>
        <div className="mt-2 space-y-1">
          {loan.repayments.map((r) => (
            <div key={r.id} className="flex justify-between text-sm">
              <span className="text-ink-600">{r.date}{r.method ? ` · ${r.method}` : ""}</span>
              <span className="text-ink-900">₦{r.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {outstanding > 0 ? (
        <form onSubmit={handleSubmit} className="field space-y-2">
          <label>Pay towards your loan (₦). Any part, up to ₦{outstanding.toLocaleString()}.</label>
          <div className="flex flex-wrap items-end gap-3">
            <input type="number" min="100" max={outstanding} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 45000" className="flex-1" />
            <button type="button" className="btn-outline text-xs" onClick={() => setAmount(String(Math.round(outstanding / 2)))}>Half</button>
            <button type="button" className="btn-outline text-xs" onClick={() => setAmount(String(outstanding))}>All</button>
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Opening Paystack…" : "Pay with Paystack"}</button>
          </div>
          <p className="text-xs text-ink-600">Paystack's small processing fee is added at checkout. Your repayment is recorded the moment it is confirmed.</p>
        </form>
      ) : <p className="text-sm text-canopy-800">This loan is fully repaid.</p>}
    </div>
  );
}
