import { useState } from "react";
import { apiFetch } from "../../api/client.js";
import DeliveryForm from "./DeliveryForm.jsx";

const label = { planned: "Ready to start", en_route: "On the road", completed: "Finished", broken_down: "Broken down", cancelled: "Cancelled" };
const when = (v) => (v ? new Date(v).toLocaleString() : "");

function Trip({ trip, reload }) {
  const [odo, setOdo] = useState("");
  const [open, setOpen] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [cost, setCost] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function act(fn) {
    setError(null); setNotice(null);
    try { await fn(); await reload(); } catch (err) { setError(err.message); }
  }
  const allDelivered = trip.shipments.every((s) => s.status === "delivered");

  function reportBreakdown(e) {
    e.preventDefault();
    const send = (pos) => act(async () => {
      await apiFetch(`/transport/trips/${trip.id}/breakdown`, { method: "POST", body: { description: breakdown.description, ...pos } });
      setBreakdown(null);
    });
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => send({ lat: p.coords.latitude, lng: p.coords.longitude }), () => send({}), { timeout: 8000 });
    else send({});
  }

  async function saveCost(e) {
    e.preventDefault();
    await act(async () => {
      const body = { tripId: trip.id, kind: cost.kind, amount: Number(cost.amount) };
      if (cost.kind === "fuel" && cost.litres) body.litres = Number(cost.litres);
      const r = await apiFetch("/transport/costs/me", { method: "POST", body });
      setNotice(r.waitingForFinance ? "Saved. It waits for Finance because the budget is used up." : "Cost saved.");
      setCost(null);
    });
  }

  return (
    <div className="card" data-testid="driver-trip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-canopy-800">{trip.reference}</p>
        <span className="rounded-full bg-soil-100 px-2 py-1 text-xs text-ink-600">{label[trip.status]}</span>
      </div>
      <p className="text-sm text-ink-900">Vehicle {trip.plate_number}</p>
      {trip.notes && <p className="text-xs text-ink-600">Note: {trip.notes}</p>}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-2 text-sm text-canopy-800">{notice}</p>}

      <div className="mt-3 space-y-2">
        {trip.shipments.map((s) => (
          <div key={s.id} className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">{s.order_reference}</p>
            <p className="text-sm text-ink-900">{s.items.map((i) => `${Number(i.quantity)} ${i.unit} ${i.crop}`).join(", ")}</p>
            <p className="text-xs text-ink-600">Deliver to {s.delivery_location}</p>
            <p className="text-xs text-ink-600">Contact {s.contact_phone_1}{s.contact_phone_2 ? `, ${s.contact_phone_2}` : ""}</p>
            {s.status === "delivered" && <p className="mt-1 text-xs text-canopy-800">Delivered {when(s.delivered_at)}, received by {s.recipient_name}.</p>}
            {s.code_locked && s.status !== "delivered" && <p className="mt-1 text-xs text-red-700">This delivery is locked after wrong codes. The Transport office has been told.</p>}
            {trip.status === "en_route" && s.status === "en_route" && !s.code_locked && (
              open === s.id
                ? <DeliveryForm shipment={s} onDone={async () => { setOpen(null); await reload(); }} />
                : <button className="btn-primary mt-2" type="button" onClick={() => setOpen(s.id)}>Deliver this order</button>
            )}
          </div>
        ))}
      </div>

      {trip.status === "planned" && (
        <div className="field mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`odo-${trip.id}`}>Odometer now (km, optional)</label>
            <input id={`odo-${trip.id}`} type="number" min="0" value={odo} onChange={(e) => setOdo(e.target.value)} />
          </div>
          <button className="btn-primary" type="button" onClick={() => act(() => apiFetch(`/transport/trips/${trip.id}/start`, { method: "POST", body: odo ? { odometerStart: Number(odo) } : {} }))}>Start trip and pick up</button>
        </div>
      )}

      {trip.status === "en_route" && (
        <div className="mt-3 space-y-3">
          {allDelivered && (
            <div className="field flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={`odoe-${trip.id}`}>Odometer at the end (km, optional)</label>
                <input id={`odoe-${trip.id}`} type="number" min="0" value={odo} onChange={(e) => setOdo(e.target.value)} />
              </div>
              <button className="btn-primary" type="button" onClick={() => act(() => apiFetch(`/transport/trips/${trip.id}/complete`, { method: "POST", body: odo ? { odometerEnd: Number(odo) } : {} }))}>Finish trip</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" type="button" onClick={() => setCost(cost ? null : { kind: "fuel", amount: "", litres: "" })}>Record fuel or toll</button>
            <button className="btn-outline" type="button" onClick={() => setBreakdown(breakdown ? null : { description: "" })}>Vehicle broke down</button>
          </div>
          {cost && (
            <form className="field grid gap-2 rounded-card border border-soil-200 p-3 sm:grid-cols-3" onSubmit={saveCost}>
              <select aria-label="Kind of cost" value={cost.kind} onChange={(e) => setCost({ ...cost, kind: e.target.value })}>
                <option value="fuel">Fuel</option><option value="toll">Toll</option><option value="allowance">Allowance</option><option value="other">Other</option>
              </select>
              <input type="number" min="0" step="0.01" placeholder="Amount (₦)" value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} required />
              {cost.kind === "fuel" && <input type="number" min="0" step="0.01" placeholder="Litres" value={cost.litres} onChange={(e) => setCost({ ...cost, litres: e.target.value })} />}
              <button className="btn-primary" type="submit">Save</button>
            </form>
          )}
          {breakdown && (
            <form className="field space-y-2 rounded-card border border-red-200 bg-red-50 p-3" onSubmit={reportBreakdown}>
              <label htmlFor={`bd-${trip.id}`}>What happened to the vehicle?</label>
              <input id={`bd-${trip.id}`} value={breakdown.description} onChange={(e) => setBreakdown({ description: e.target.value })} required />
              <p className="text-xs text-ink-600">Your position is sent with the report. The office will send help and Maintenance is told straight away.</p>
              <button className="btn-primary" type="submit">Report breakdown</button>
            </form>
          )}
        </div>
      )}
      {trip.status === "broken_down" && <p className="mt-3 text-sm text-red-700">Breakdown reported. Wait for the Transport office to send another vehicle for the orders.</p>}
    </div>
  );
}

export default function DriverTrips({ trips, reload }) {
  const current = trips.filter((t) => ["planned", "en_route", "broken_down"].includes(t.status));
  const past = trips.filter((t) => ["completed", "cancelled"].includes(t.status));
  return (
    <div className="space-y-4">
      {current.length === 0 && <div className="card"><p className="text-sm text-ink-600">No trip is waiting for you right now.</p></div>}
      {current.map((t) => <Trip key={t.id} trip={t} reload={reload} />)}
      {past.length > 0 && (
        <div className="card">
          <p className="text-sm text-ink-600">Past trips</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-900">
            {past.slice(0, 10).map((t) => <li key={t.id}>{t.reference}, {t.plate_number}, {t.shipments.length} {t.shipments.length === 1 ? "order" : "orders"}, {label[t.status]}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
