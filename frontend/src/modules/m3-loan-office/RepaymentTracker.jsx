import { useState } from "react";

export default function RepaymentTracker({ loan, onLogRepayment }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank transfer");

  const totalRepaid = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
  const pctRepaid = Math.round((totalRepaid / loan.amount) * 100);
  const isFree = pctRepaid >= 70;

  function handleSubmit(e) {
    e.preventDefault();
    if (!amount) return;
    onLogRepayment({
      id: `r${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      amount: Number(amount),
      method,
    });
    setAmount("");
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
          ₦{totalRepaid.toLocaleString()} of ₦{loan.amount.toLocaleString()} repaid ({pctRepaid}%)
          — {isFree ? "70% threshold met, free to sell" : "70% needed to sell freely"}
        </p>
      </div>

      <div>
        <p className="text-sm text-ink-600">Repayment history</p>
        <div className="mt-2 space-y-1">
          {loan.repayments.map((r) => (
            <div key={r.id} className="flex justify-between text-sm">
              <span className="text-ink-600">{r.date} · {r.method}</span>
              <span className="text-ink-900">₦{r.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="field flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label>Log a repayment (₦)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 45000"
          />
        </div>
        <div className="flex-1">
          <label>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>Bank transfer</option>
            <option>Cash</option>
            <option>Mobile money</option>
          </select>
        </div>
        <button className="btn-primary" type="submit">
          Log payment
        </button>
      </form>
    </div>
  );
}
