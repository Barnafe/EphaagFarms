import { useState } from "react";

const statusStyles = {
  assigned: "bg-soil-100 text-ink-600",
  en_route: "bg-harvest-50 text-harvest-600",
  delivered: "bg-canopy-50 text-canopy-800",
};

const statusLabel = {
  assigned: "Assigned — not yet picked up",
  en_route: "En route",
  delivered: "Delivered",
};

export default function DriverJobList({ jobs, onUpdate }) {
  const [fileNames, setFileNames] = useState({});

  function handleFileChange(jobId, e) {
    const file = e.target.files?.[0];
    if (file) setFileNames((prev) => ({ ...prev, [jobId]: file.name }));
  }

  function handleMarkDelivered(jobId) {
    const proof = fileNames[jobId];
    if (!proof) return;
    onUpdate(jobId, "delivered", proof);
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Your jobs</p>
      <div className="mt-3 space-y-3">
        {jobs.length === 0 && <p className="text-sm text-ink-600">No jobs assigned to you yet.</p>}
        {jobs.map((job) => (
          <div key={job.id} className="rounded-card border border-soil-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-canopy-800">{job.shipmentReference}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[job.status]}`}>
                {statusLabel[job.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-900">
              {job.items.map((i) => `${i.quantity} ${i.unit} ${i.crop}`).join(", ")}
            </p>
            <p className="text-xs text-ink-600">
              {job.orderReference} · to {job.deliveryLocation}
            </p>

            {job.status === "assigned" && (
              <button
                className="btn-primary mt-2"
                type="button"
                onClick={() => onUpdate(job.id, "en_route", null)}
              >
                Mark picked up / en route
              </button>
            )}

            {job.status === "en_route" && (
              <div className="field mt-3 space-y-2">
                <label>Upload proof of delivery (receipt + signature)</label>
                <input type="file" onChange={(e) => handleFileChange(job.id, e)} />
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => handleMarkDelivered(job.id)}
                  disabled={!fileNames[job.id]}
                >
                  Confirm delivery
                </button>
              </div>
            )}

            {job.status === "delivered" && job.proofOfDelivery && (
              <p className="mt-2 text-xs text-ink-600">Proof on file: {job.proofOfDelivery}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
