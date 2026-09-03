import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function TransactionsPanel() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/farmers/me/transactions")
      .then(({ transactions }) => setTransactions(transactions))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const total = transactions
    .filter((t) => t.status === "paid")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-white">Transactions</h2>
        <p className="mt-1 text-sm text-canopy-100">
          Every payment you've received for produce sold through the company. Loan disbursements
          and repayments are tracked separately in the Loan Office.
        </p>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="card">
        <p className="text-sm text-ink-600">Total received</p>
        <p className="text-2xl font-semibold text-ink-900">₦{total.toLocaleString()}</p>
      </div>

      {loading ? (
        <p className="text-sm text-canopy-100">Loading…</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-canopy-100">No transactions yet.</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((t) => (
            <div key={t.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium text-ink-900">Order {t.order_reference}</p>
                <p className="text-xs text-ink-600">{new Date(t.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-ink-900">₦{Number(t.amount).toLocaleString()}</p>
                <p className="text-xs capitalize text-ink-600">{t.status}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
