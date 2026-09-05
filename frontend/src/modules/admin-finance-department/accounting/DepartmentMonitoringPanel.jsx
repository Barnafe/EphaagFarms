import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

export default function DepartmentMonitoringPanel() {
  const [spending, setSpending] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/finance-department/departments/monitoring")
      .then((d) => {
        setSpending(d.spendingByDepartment);
        setBudgets(d.budgetsByDepartment);
      })
      .catch((err) => setError(err.message));
  }, []);

  const budgetByDept = Object.fromEntries(budgets.map((b) => [b.department, b]));

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Spending and budget performance across every department — Transport, Maintenance, HR, Procurement, Admin, Store, Marketing, and any other department in the project.</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-2">
        {spending.length === 0 && <p className="text-sm text-ink-600">No department expenses recorded yet.</p>}
        {spending.map((s) => {
          const b = budgetByDept[s.department];
          return (
            <div key={s.department} className="rounded-card border border-soil-200 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink-900">{s.department}</p>
                <p className="text-sm text-ink-900">₦{Number(s.total_spent).toLocaleString()}</p>
              </div>
              <p className="text-xs text-ink-600">{s.expense_count} expense{s.expense_count === 1 ? "" : "s"} recorded</p>
              {b && (
                <p className="mt-1 text-xs text-ink-600">
                  Budget: ₦{Number(b.spent).toLocaleString()} of ₦{Number(b.allocated).toLocaleString()} allocated
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
