import { useState } from "react";
import { generateReference, REF_PREFIX } from "../../utils/reference.js";

export default function DispatchPanel({ jobs, drivers, onAssign }) {
  const [selectedDriver, setSelectedDriver] = useState({});

  function handleAssign(jobId) {
    const driverId = selectedDriver[jobId];
    if (!driverId) return;
    onAssign(jobId, driverId, generateReference(REF_PREFIX.shipment));
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">
        Dispatch queue <span className="text-xs">(Transport Department)</span>
      </p>
      <div className="mt-3 space-y-3">
        {jobs.length === 0 && (
          <p className="text-sm text-ink-600">Nothing waiting for a driver right now.</p>
        )}
        {jobs.map((job) => (
          <div key={job.id} className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">{job.orderReference}</p>
            <p className="mt-1 text-sm text-ink-900">
              {job.items.map((i) => `${i.quantity} ${i.unit} ${i.crop}`).join(", ")}
            </p>
            <p className="text-xs text-ink-600">To {job.deliveryLocation}</p>

            {job.driverId ? (
              <p className="mt-2 text-xs text-canopy-800">
                Assigned · {job.shipmentReference}
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-card border border-soil-200 px-2 py-1 text-sm"
                  value={selectedDriver[job.id] ?? ""}
                  onChange={(e) =>
                    setSelectedDriver((prev) => ({ ...prev, [job.id]: e.target.value }))
                  }
                >
                  <option value="">Choose a driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.fleetType}
                    </option>
                  ))}
                </select>
                <button className="btn-primary" type="button" onClick={() => handleAssign(job.id)}>
                  Assign & generate documents
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
