import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import PriceEditorPanel from "../admin-finance-department/PriceEditorPanel.jsx";

// Moved out of Finance Department's "Prices" tab (2026-09-03 spec) — same
// component, same /finance/prices GET/PATCH wiring, just reachable directly
// from the hamburger menu instead of buried a tab-click deep.
export default function AddPricePage() {
  const [prices, setPrices] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPrices = useCallback(async () => {
    try {
      const { prices: pr } = await apiFetch("/finance/prices");
      setPrices(pr.map((row) => ({ ...row, buy_price: Number(row.buy_price), sell_price: Number(row.sell_price) })));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  async function handleSavePrice(priceId, { buyPrice, sellPrice }) {
    try {
      await apiFetch(`/finance/prices/${priceId}`, { method: "PATCH", body: { buyPrice, sellPrice } });
      await loadPrices();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Add price</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Set the buy price (what farmers are paid) and sell price (what buyers pay) for every crop
            already in the catalog. Adding a brand-new crop happens in{" "}
            <span className="font-medium text-white">Add Catalog</span> instead.
          </p>
        </div>

        {error && (
          <div className="card mb-4 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-canopy-100">Loading prices…</p>
        ) : prices.length === 0 ? (
          <div className="card">
            <p className="text-sm text-ink-600">
              No crops in the catalog yet — add one from Add Catalog first.
            </p>
          </div>
        ) : (
          <PriceEditorPanel prices={prices} onSave={handleSavePrice} />
        )}
      </div>
    </AdminDashboardShell>
  );
}
