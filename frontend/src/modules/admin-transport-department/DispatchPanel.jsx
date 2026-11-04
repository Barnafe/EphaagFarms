import { useState } from "react";

// Build a trip: one vehicle, one driver, one or more orders that are ready to go.
export default function DispatchPanel({ orders, vehicles, drivers, onCreate }) {
  const [picked, setPicked] = useState([]);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const freeVehicles = vehicles.filter((v) => v.status === "available");
  const freeDrivers = drivers.filter((d) => !d.on_trip);

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function submit(e) {
    e.preventDefault();
    if (!picked.length || !vehicleId || !driverId) return;
    setBusy(true);
    const ok = await onCreate({ orderIds: picked, vehicleId, driverId, notes: notes.trim() || undefined });
    setBusy(false);
    if (ok) { setPicked([]); setNotes(""); setVehicleId(""); setDriverId(""); }
  }

  return (
    <form className="card" onSubmit={submit}>
      <p className="text-sm text-ink-600">Orders ready to go ({orders.length})</p>
      <div className="mt-3 space-y-2">
        {orders.length === 0 && <p className="text-sm text-ink-600">Nothing is waiting for a trip right now.</p>}
        {orders.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-card border border-soil-200 p-3">
            <input type="checkbox" className="mt-1" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Select ${o.reference}`} />
            <span>
              <span className="block text-xs font-medium text-canopy-800">{o.reference}</span>
              <span className="block text-sm text-ink-900">{o.items.map((i) => `${Number(i.quantity)} ${i.unit} ${i.crop}`).join(", ")}</span>
              <span className="block text-xs text-ink-600">To {o.delivery_location}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="field mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="trip-vehicle">Vehicle</label>
          <select id="trip-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Choose a vehicle</option>
            {freeVehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}, {v.name}</option>)}
          </select>
          {freeVehicles.length === 0 && <p className="mt-1 text-xs text-ink-600">No vehicle is free. Add one in Fleet, or finish a trip.</p>}
        </div>
        <div>
          <label htmlFor="trip-driver">Driver</label>
          <select id="trip-driver" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Choose a driver</option>
            {freeDrivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="trip-notes">Note for the driver (optional)</label>
          <input id="trip-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <button className="btn-primary mt-4" type="submit" disabled={busy || !picked.length || !vehicleId || !driverId}>
        {busy ? "Creating…" : `Create trip with ${picked.length} ${picked.length === 1 ? "order" : "orders"}`}
      </button>
      <p className="mt-2 text-xs text-ink-600">Each buyer is sent a delivery code. The driver needs it to confirm the delivery.</p>
    </form>
  );
}
