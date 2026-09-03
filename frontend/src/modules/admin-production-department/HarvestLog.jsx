import { useState } from "react";

export default function HarvestLog({ farms, harvests, onLog }) {
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");

  const selectedFarm = farms.find((f) => f.id === farmId);

  function handleSubmit(e) {
    e.preventDefault();
    if (!quantity || !selectedFarm) return;
    onLog({
      id: `h${Date.now()}`,
      farmId,
      crop: selectedFarm.crop,
      quantity: Number(quantity),
      unit: selectedFarm.crop === "Cassava" ? "ton" : "bag",
      date: new Date().toISOString().slice(0, 10),
    });
    setQuantity("");
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Harvest log</p>
      <p className="mt-1 text-xs text-ink-600">
        Logged harvests are added to the Store Department's stock pool, alongside produce
        sourced from registered farmers.
      </p>

      <div className="mt-3 space-y-2">
        {harvests.map((h) => {
          const farm = farms.find((f) => f.id === h.farmId);
          return (
            <div key={h.id} className="flex justify-between text-sm">
              <span className="text-ink-600">
                {farm?.name} · {h.date}
              </span>
              <span className="text-ink-900">
                {h.quantity} {h.unit} {h.crop}
              </span>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="field mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label>Farm</label>
          <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Quantity</label>
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </div>
        <button className="btn-primary" type="submit">
          Log harvest
        </button>
      </form>
    </div>
  );
}
