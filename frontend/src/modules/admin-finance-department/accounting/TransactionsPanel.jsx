import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const types = ["", "income", "expense", "payment", "transfer", "refund", "adjustment"];

export default function TransactionsPanel() {
  const [transactions, setTransactions] = useState([]);
  const [txnType, setTxnType] = useState("");
  const [error, setError] = useState(null);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (txnType) params.set("txnType", txnType);
      const { transactions } = await apiFetch(`/finance-department/transactions?${params.toString()}`);
      setTransactions(transactions);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnType]);

  async function handleVerify(id) {
    try {
      await apiFetch(`/finance-department/transactions/${id}/verify`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Every posting — income, expenses, payments, transfers, refunds and adjustments — in one ledger.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t || "all"} type="button" onClick={() => setTxnType(t)} className={`rounded-full px-3 py-1 text-xs ${txnType === t ? "bg-canopy-700 text-white" : "bg-soil-100 text-ink-700"}`}>
            {t || "All"}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-2">
        {transactions.length === 0 && <p className="text-sm text-ink-600">No transactions yet.</p>}
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2 text-sm">
            <div>
              <p className="text-ink-900">{t.description || t.reference}</p>
              <p className="text-xs text-ink-600">
                {t.reference} · {t.txn_type} {t.department ? `· ${t.department}` : ""} · {new Date(t.transacted_at).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-ink-900">₦{Number(t.amount).toLocaleString()}</p>
              {t.verified ? (
                <span className="text-xs text-canopy-700">Verified</span>
              ) : (
                <button className="text-xs text-canopy-700 underline" type="button" onClick={() => handleVerify(t.id)}>Verify</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
