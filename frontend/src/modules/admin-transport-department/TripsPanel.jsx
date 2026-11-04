import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { openStoredFile } from "../../utils/openStoredFile.js";

const badge = {
  planned: "bg-soil-100 text-ink-600", en_route: "bg-harvest-50 text-harvest-600", completed: "bg-canopy-50 text-canopy-800",
  broken_down: "bg-red-50 text-red-700", cancelled: "bg-soil-100 text-ink-600",
};
const label = { planned: "Planned", en_route: "En route", completed: "Completed", broken_down: "Broken down", cancelled: "Cancelled" };
const shipLabel = { assigned: "Waiting", en_route: "On the road", delivered: "Delivered" };
const when = (v) => (v ? new Date(v).toLocaleString() : "");

export default function TripsPanel({ vehicles, drivers, onChanged }) {
  const [trips, setTrips] = useState([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState(null);
  const [rescue, setRescue] = useState({});
  const [override, setOverride] = useState({});

  const load = useCallback(async () => {
    try {
      const { trips } = await apiFetch(`/transport/trips${filter ? `?status=${filter}` : ""}`);
      setTrips(trips);
      setError(null);
    } catch (err) { setError(err.message); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  async function run(fn) {
    try { await fn(); await load(); onChanged?.(); setError(null); } catch (err) { setError(err.message); }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">Trips</p>
        <div className="field">
          <select aria-label="Show trips" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All trips</option>
            {Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="card border-red-200 bg-red-50"><p className="text-sm text-red-700">{error}</p></div>}
      {trips.length === 0 && <div className="card"><p className="text-sm text-ink-600">No trips yet.</p></div>}

      {trips.map((t) => (
        <div key={t.id} className="card" data-testid="trip-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-canopy-800">{t.reference}</p>
            <span className={`rounded-full px-2 py-1 text-xs ${badge[t.status]}`}>{label[t.status]}</span>
          </div>
          <p className="mt-1 text-sm text-ink-900">{t.plate_number} ({t.vehicle_name}) driven by {t.driver_name}{t.driver_phone ? `, ${t.driver_phone}` : ""}</p>
          <p className="text-xs text-ink-600">{t.started_at ? `Started ${when(t.started_at)}` : "Not started"}{t.completed_at ? `, finished ${when(t.completed_at)}` : ""}</p>

          <div className="mt-3 space-y-2">
            {t.shipments.map((s) => (
              <div key={s.id} className="rounded-card border border-soil-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-canopy-800">{s.order_reference} · {s.reference}</p>
                  <span className="text-xs text-ink-600">{shipLabel[s.status]}{s.code_locked ? " (code locked)" : ""}</span>
                </div>
                <p className="text-sm text-ink-900">{s.items.map((i) => `${Number(i.quantity)} ${i.unit} ${i.crop}`).join(", ")}</p>
                <p className="text-xs text-ink-600">To {s.delivery_location}, buyer {s.buyer_name}</p>
                {s.status === "delivered" && (
                  <p className="mt-1 text-xs text-ink-600">
                    Received by {s.recipient_name} on {when(s.delivered_at)}.
                    {s.delivery_lat ? ` GPS ${Number(s.delivery_lat).toFixed(4)}, ${Number(s.delivery_lng).toFixed(4)}.` : s.gps_missing_reason ? ` No GPS: ${s.gps_missing_reason}.` : ""}
                    {s.override_reason ? ` Recorded by the office: ${s.override_reason}.` : ""}
                    {s.delivery_photo_id && (
                      <button type="button" className="ml-2 underline" onClick={() => run(() => openStoredFile(s.delivery_photo_id))}>View proof photo</button>
                    )}
                  </p>
                )}
                {s.status === "en_route" && (
                  override[s.id] ? (
                    <div className="field mt-2 space-y-2">
                      <input placeholder="Name of the person who received the goods" value={override[s.id].recipientName} onChange={(e) => setOverride({ ...override, [s.id]: { ...override[s.id], recipientName: e.target.value } })} />
                      <input placeholder="Why the code cannot be used (at least 10 characters)" value={override[s.id].reason} onChange={(e) => setOverride({ ...override, [s.id]: { ...override[s.id], reason: e.target.value } })} />
                      <div className="flex gap-2">
                        <button className="btn-primary" type="button" onClick={() => run(async () => { await apiFetch(`/transport/shipments/${s.id}/override-delivery`, { method: "POST", body: override[s.id] }); setOverride({ ...override, [s.id]: null }); })}>Record delivery</button>
                        <button className="btn-outline" type="button" onClick={() => setOverride({ ...override, [s.id]: null })}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="mt-2 text-xs underline" type="button" onClick={() => setOverride({ ...override, [s.id]: { recipientName: "", reason: "" } })}>Record delivery without the code</button>
                  )
                )}
              </div>
            ))}
          </div>

          {t.status === "planned" && (
            <button className="btn-outline mt-3" type="button" onClick={() => run(() => apiFetch(`/transport/trips/${t.id}/cancel`, { method: "POST" }))}>Cancel trip</button>
          )}

          {t.status === "broken_down" && (
            <div className="field mt-3 rounded-card border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">This vehicle broke down. A maintenance request was opened automatically. Send another vehicle and driver for the orders that are not delivered.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select aria-label="Rescue vehicle" value={rescue[t.id]?.vehicleId || ""} onChange={(e) => setRescue({ ...rescue, [t.id]: { ...rescue[t.id], vehicleId: e.target.value } })}>
                  <option value="">Rescue vehicle</option>
                  {vehicles.filter((v) => v.status === "available").map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                </select>
                <select aria-label="Rescue driver" value={rescue[t.id]?.driverId || ""} onChange={(e) => setRescue({ ...rescue, [t.id]: { ...rescue[t.id], driverId: e.target.value } })}>
                  <option value="">Rescue driver</option>
                  {drivers.filter((d) => !d.on_trip).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button className="btn-primary mt-2" type="button" disabled={!rescue[t.id]?.vehicleId || !rescue[t.id]?.driverId}
                onClick={() => run(() => apiFetch(`/transport/trips/${t.id}/rescue`, { method: "POST", body: rescue[t.id] }))}>Send rescue trip</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
