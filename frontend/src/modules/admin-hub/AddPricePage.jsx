import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

// Moved out of Finance Department's "Prices" tab (2026-09-03 spec) — same
// /finance/prices GET/PATCH wiring, just reachable directly from the
// hamburger menu instead of buried a tab-click deep.
//
// 2026-09-05 spec (item #5): admin has usually already added a good number
// of catalog items by the time they come here, so a table listing every one
// of them at once got long and cluttered. Replaced with a single dropdown —
// pick the item, its current buy/sell price (and unit or age/description,
// read-only here — edit those from Add Catalog instead) fills in below, and
// there's just the one editing form on screen at a time.
export default function AddPricePage() {
  const [prices, setPrices] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [saving, setSaving] = useState(false);

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

  const selected = useMemo(() => prices.find((p) => p.id === selectedId) || null, [prices, selectedId]);

  function handleSelect(id) {
    setSelectedId(id);
    setSuccess(null);
    const p = prices.find((row) => row.id === id);
    setBuyPrice(p ? String(p.buy_price) : "");
    setSellPrice(p ? String(p.sell_price) : "");
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setSuccess(null);
    if (buyPrice === "" || sellPrice === "") {
      setError("Both buy price and sell price are required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/finance/prices/${selected.id}`, {
        method: "PATCH",
        body: { buyPrice: Number(buyPrice), sellPrice: Number(sellPrice) },
      });
      setSuccess(`${selected.crop}'s prices were updated.`);
      await loadPrices();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-2xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Add price</h1>
          <p className="mt-1 text-sm text-canopy-100">
            New crop or livestock? Use <span className="font-medium text-white">Add Catalog</span> instead.
          </p>
        </div>

        {error && (
          <div className="card mb-4 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="card mb-4 border-canopy-300 bg-canopy-50">
            <p className="text-sm text-canopy-800">{success}</p>
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
          <div className="card field space-y-4">
            <div>
              <label>Select item</label>
              <select value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
                <option value="" disabled>
                  Choose an item from the catalog…
                </option>
                {prices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.crop}
                    {p.item_type === "livestock" ? ` (${p.age_description || "livestock"})` : ` (per ${p.unit})`}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <form onSubmit={handleSave} className="space-y-4 border-t border-soil-200 pt-4">
                <div className="rounded-card bg-soil-50 px-3 py-2.5 text-sm text-ink-700">
                  <p className="font-medium text-ink-900">{selected.crop}</p>
                  <p className="text-xs text-ink-600">
                    {selected.item_type === "livestock"
                      ? selected.age_description
                      : `Sold by the ${selected.unit}`}
                    {selected.category ? ` · ${selected.category}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs">Buy price (₦) — paid to farmers</label>
                    <input
                      type="number"
                      min="0"
                      value={buyPrice}
                      onChange={(e) => setBuyPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs">Sell price (₦) — charged to buyers</label>
                    <input
                      type="number"
                      min="0"
                      value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                    />
                  </div>
                </div>
                <button className="btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save prices"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </AdminDashboardShell>
  );
}
