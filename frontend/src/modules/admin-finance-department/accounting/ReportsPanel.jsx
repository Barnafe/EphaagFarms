import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString()}`;
}

export default function ReportsPanel() {
  const [incomeStatement, setIncomeStatement] = useState(null);
  const [cashPosition, setCashPosition] = useState(null);
  const [payRec, setPayRec] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/finance-department/reports/income-statement"),
      apiFetch("/finance-department/reports/cash-position"),
      apiFetch("/finance-department/reports/payables-receivables"),
      apiFetch("/finance-department/budgets/reports/vs-actual"),
    ])
      .then(([is, cp, pr, bva]) => {
        setIncomeStatement(is);
        setCashPosition(cp);
        setPayRec(pr);
        setBudgets(bva.budgets);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="card border-red-200 bg-red-50"><p className="text-sm text-red-700">{error}</p></div>;
  if (!incomeStatement || !cashPosition || !payRec) return <p className="text-sm text-canopy-100">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-sm font-medium text-ink-900">Income statement — {incomeStatement.period.start} to {incomeStatement.period.end}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-ink-600">Income</p>
            {incomeStatement.income.map((i) => (
              <div key={i.source} className="flex justify-between text-sm"><span>{i.source.replace(/_/g, " ")}</span><span>{naira(i.total)}</span></div>
            ))}
          </div>
          <div>
            <p className="text-xs uppercase text-ink-600">Expenses</p>
            {incomeStatement.expenses.map((e) => (
              <div key={e.category} className="flex justify-between text-sm"><span>{e.category}</span><span>{naira(e.total)}</span></div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex justify-between border-t border-soil-200 pt-2 text-sm font-medium text-ink-900">
          <span>Net profit</span><span>{naira(incomeStatement.netProfit)}</span>
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-medium text-ink-900">Cash position</p>
        <div className="mt-2 space-y-1">
          {cashPosition.accounts.map((a) => (
            <div key={a.id} className="flex justify-between text-sm"><span>{a.name}</span><span>{naira(a.current_balance)}</span></div>
          ))}
        </div>
        <div className="mt-2 flex justify-between border-t border-soil-200 pt-2 text-sm font-medium text-ink-900">
          <span>Total cash</span><span>{naira(cashPosition.totalCash)}</span>
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-medium text-ink-900">Payables & receivables</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-ink-600">Payables</p>
            {payRec.payables.map((p) => (
              <div key={p.status} className="flex justify-between text-sm"><span>{p.status.replace("_", " ")} ({p.count})</span><span>{naira(p.outstanding)}</span></div>
            ))}
          </div>
          <div>
            <p className="text-xs uppercase text-ink-600">Receivables</p>
            {payRec.receivables.map((r) => (
              <div key={r.status} className="flex justify-between text-sm"><span>{r.status} ({r.count})</span><span>{naira(r.outstanding)}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-medium text-ink-900">Budget vs actual</p>
        <div className="mt-2 space-y-1">
          {budgets.map((b) => (
            <div key={b.id} className="flex justify-between text-sm">
              <span>{b.name} {b.department ? `(${b.department})` : ""}</span>
              <span>{naira(b.spent_amount)} of {naira(b.allocated_amount)} · {naira(b.variance)} left</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
