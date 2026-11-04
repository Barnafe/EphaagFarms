import { useState } from "react";
import { apiFetch } from "../../api/client.js";

const statusText = { available: "Available", on_trip: "On a trip", in_maintenance: "In maintenance", retired: "Retired" };
const empty = { plateNumber: "", name: "", vehicleType: "truck", capacityKg: "", odometerKm: "" };

export default function FleetPanel({ vehicles, drivers, onChanged }) {
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [licence, setLicence] = useState({});

  async function run(fn) {
    try { await fn(); await onChanged(); setError(null); } catch (err) { setError(err.message); }
  }
  function add(e) {
    e.preventDefault();
    run(async () => {
      await apiFetch("/transport/vehicles", { method: "POST", body: { ...form, capacityKg: form.capacityKg || undefined, odometerKm: form.odometerKm || undefined } });
      setForm(empty); setShow(false);
    });
  }

  return (
    <div className="space-y-4">
      {error && <div className="card border-red-200 bg-red-50"><p className="text-sm text-red-700">{error}</p></div>}

      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">Vehicles ({vehicles.length})</p>
          <button className="btn-outline" type="button" onClick={() => setShow((v) => !v)}>+ Add vehicle</button>
        </div>
        {show && (
          <form onSubmit={add} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-3">
            <input placeholder="Plate number" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} required />
            <input placeholder="Name (for example Hilux 1)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select aria-label="Vehicle type" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
              {["truck", "van", "pickup", "tricycle", "motorbike", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" min="1" placeholder="Capacity (kg)" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} />
            <input type="number" min="0" placeholder="Odometer now (km)" value={form.odometerKm} onChange={(e) => setForm({ ...form, odometerKm: e.target.value })} />
            <div className="flex gap-2"><button className="btn-primary" type="submit">Save vehicle</button><button className="btn-outline" type="button" onClick={() => setShow(false)}>Cancel</button></div>
          </form>
        )}
        <div className="mt-4 space-y-2">
          {vehicles.length === 0 && <p className="text-sm text-ink-600">No vehicles yet. Each one is also added to Maintenance, so faults and servicing are tracked.</p>}
          {vehicles.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="font-medium text-ink-900">{v.plate_number} <span className="text-xs font-normal text-ink-600">{v.name}</span></p>
                <p className="text-xs text-ink-600">{v.vehicle_type}{v.capacity_kg ? `, ${Number(v.capacity_kg).toLocaleString()} kg` : ""}, {Number(v.odometer_km).toLocaleString()} km</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-soil-100 px-2 py-1 text-xs text-ink-600">{statusText[v.status]}</span>
                {v.status === "available" && <button className="text-xs underline" type="button" onClick={() => run(() => apiFetch(`/transport/vehicles/${v.id}`, { method: "PATCH", body: { status: "retired" } }))}>Retire</button>}
                {v.status === "retired" && <button className="text-xs underline" type="button" onClick={() => run(() => apiFetch(`/transport/vehicles/${v.id}`, { method: "PATCH", body: { status: "available" } }))}>Put back in service</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Drivers ({drivers.length})</p>
        <div className="mt-3 space-y-2">
          {drivers.length === 0 && <p className="text-sm text-ink-600">No driver accounts yet.</p>}
          {drivers.map((d) => {
            const f = licence[d.id];
            const expired = d.licence_expiry && new Date(d.licence_expiry) < new Date();
            return (
              <div key={d.id} className="rounded-card border border-soil-200 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-900">{d.name} <span className="text-xs font-normal text-ink-600">{d.phone || ""}</span></p>
                    <p className="text-xs text-ink-600">
                      {d.licence_number ? `Licence ${d.licence_number}, expires ${String(d.licence_expiry || "").slice(0, 10) || "not set"}` : "No licence details yet"}
                      {expired ? " (expired)" : ""}{d.on_trip ? ", on a trip" : ""}
                    </p>
                  </div>
                  <button className="text-xs underline" type="button" onClick={() => setLicence({ ...licence, [d.id]: { licenceNumber: d.licence_number || "", licenceExpiry: String(d.licence_expiry || "").slice(0, 10) } })}>Licence details</button>
                </div>
                {f && (
                  <div className="field mt-2 grid gap-2 sm:grid-cols-3">
                    <input aria-label="Licence number" placeholder="Licence number" value={f.licenceNumber} onChange={(e) => setLicence({ ...licence, [d.id]: { ...f, licenceNumber: e.target.value } })} />
                    <input aria-label="Licence expiry" type="date" value={f.licenceExpiry} onChange={(e) => setLicence({ ...licence, [d.id]: { ...f, licenceExpiry: e.target.value } })} />
                    <div className="flex gap-2">
                      <button className="btn-primary" type="button" onClick={() => run(async () => { await apiFetch(`/transport/drivers/${d.id}/profile`, { method: "PUT", body: f }); setLicence({ ...licence, [d.id]: null }); })}>Save</button>
                      <button className="btn-outline" type="button" onClick={() => setLicence({ ...licence, [d.id]: null })}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
