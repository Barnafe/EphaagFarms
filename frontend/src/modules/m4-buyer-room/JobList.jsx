const statusStyles = {
  assigned: "bg-soil-100 text-ink-600",
  processing: "bg-harvest-50 text-harvest-600",
  complete: "bg-canopy-50 text-canopy-800",
};

const statusLabel = {
  assigned: "Assigned — not started",
  processing: "Processing",
  complete: "Complete — ready for transport",
};

const nextAction = {
  assigned: { label: "Start processing", next: "processing" },
  processing: { label: "Mark complete", next: "complete" },
  complete: null,
};

export default function JobList({ jobs, onAdvance }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Assigned jobs</p>
      <div className="mt-3 space-y-2">
        {jobs.length === 0 && <p className="text-sm text-ink-600">No jobs assigned yet.</p>}
        {jobs.map((job) => {
          const action = nextAction[job.status];
          return (
            <div key={job.id} className="rounded-card border border-soil-200 px-3 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-canopy-800">{job.reference}</p>
                <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[job.status]}`}>
                  {statusLabel[job.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-900">
                {job.items.map((i) => `${i.quantity} ${i.unit} ${i.crop}`).join(", ")}
              </p>
              <p className="text-xs text-ink-600">
                For delivery to {job.deliveryLocation} · assigned {job.assignedDate}
              </p>
              {action && (
                <button
                  type="button"
                  className="btn-primary mt-2"
                  onClick={() => onAdvance(job.id, action.next)}
                >
                  {action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
