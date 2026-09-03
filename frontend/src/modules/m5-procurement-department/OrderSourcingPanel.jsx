import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function OrderSourcingPanel({ order, farmers, onNotify }) {
  const [expandedFarmerId, setExpandedFarmerId] = useState(null);
  const [productsByFarmer, setProductsByFarmer] = useState({});
  const [picks, setPicks] = useState({}); // farmerId -> { productId, quantity }
  const [error, setError] = useState(null);

  const neededCrops = order.items.map((i) => i.crop);

  const matches = useMemo(
    () => farmers.filter((f) => f.crops.some((c) => neededCrops.includes(c))),
    [farmers, order]
  );

  async function toggleFarmer(id) {
    if (expandedFarmerId === id) {
      setExpandedFarmerId(null);
      return;
    }
    setExpandedFarmerId(id);
    if (!productsByFarmer[id]) {
      try {
        const { products } = await apiFetch(`/procurement/farmers/${id}/products`);
        setProductsByFarmer((prev) => ({ ...prev, [id]: products }));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  function setPick(farmerId, field, value) {
    setPicks((prev) => ({ ...prev, [farmerId]: { ...prev[farmerId], [field]: value } }));
  }

  function removePick(farmerId) {
    setPicks((prev) => {
      const next = { ...prev };
      delete next[farmerId];
      return next;
    });
  }

  const sourcingEntries = Object.entries(picks)
    .filter(([, p]) => p.productId && Number(p.quantity) > 0)
    .map(([farmerId, p]) => ({ farmerId, productId: p.productId, quantity: Number(p.quantity) }));

  function handleNotify() {
    if (sourcingEntries.length === 0) return;
    const reps = [
      ...new Set(
        farmers.filter((f) => sourcingEntries.some((e) => e.farmerId === f.id)).map((f) => f.repContact)
      ),
    ];
    onNotify(order.id, sourcingEntries, reps);
    setPicks({});
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">
        Source <span className="font-medium text-ink-900">{order.reference}</span>
      </p>
      <p className="mt-1 text-xs text-ink-600">
        Needs: {order.items.map((i) => `${i.quantity} ${i.unit} ${i.crop}`).join(", ")} →{" "}
        {order.deliveryLocation}
      </p>

      {order.notifiedReps.length > 0 && (
        <div className="mt-3 rounded-card bg-soil-50 px-3 py-2 text-xs text-ink-600">
          Already notified: {order.notifiedReps.join(", ")}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <p className="mt-4 text-sm text-ink-600">Matching registered farmers — pick a listing + quantity per farmer</p>
      <div className="mt-2 space-y-2">
        {matches.length === 0 && (
          <p className="text-sm text-ink-600">No registered farmers grow this crop yet.</p>
        )}
        {matches.map((f) => {
          const products = productsByFarmer[f.id] || [];
          const pick = picks[f.id];
          const selectedProduct = products.find((p) => p.id === pick?.productId);
          return (
            <div key={f.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => toggleFarmer(f.id)}
              >
                <span>
                  <span className="font-medium text-ink-900">{f.name}</span>{" "}
                  <span className="text-ink-600">
                    — {f.crops.join(", ")} · {f.state}, {f.lga}
                  </span>
                </span>
                {pick?.productId && (
                  <span className="rounded-full bg-canopy-50 px-2 py-0.5 text-xs text-canopy-800">
                    {pick.quantity || 0} picked
                  </span>
                )}
              </button>

              {expandedFarmerId === f.id && (
                <div className="mt-2 field space-y-2 border-t border-soil-100 pt-2">
                  {products.length === 0 ? (
                    <p className="text-xs text-ink-600">This farmer has no available listings right now.</p>
                  ) : (
                    <>
                      <div>
                        <label>Listing</label>
                        <select
                          value={pick?.productId || ""}
                          onChange={(e) => setPick(f.id, "productId", e.target.value)}
                        >
                          <option value="">Select a listing…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.crop} — {p.quantity} {p.unit} available
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedProduct && (
                        <div>
                          <label>Quantity to source</label>
                          <input
                            type="number"
                            min="0"
                            max={selectedProduct.quantity}
                            step="0.01"
                            value={pick?.quantity || ""}
                            onChange={(e) => setPick(f.id, "quantity", e.target.value)}
                            placeholder={`up to ${selectedProduct.quantity} ${selectedProduct.unit}`}
                          />
                        </div>
                      )}
                      {pick?.productId && (
                        <button type="button" className="text-xs text-red-700 underline" onClick={() => removePick(f.id)}>
                          Remove this pick
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="btn-primary mt-4"
        type="button"
        onClick={handleNotify}
        disabled={sourcingEntries.length === 0}
      >
        Source from {sourcingEntries.length} farmer{sourcingEntries.length === 1 ? "" : "s"} & notify rep(s)
      </button>
    </div>
  );
}
