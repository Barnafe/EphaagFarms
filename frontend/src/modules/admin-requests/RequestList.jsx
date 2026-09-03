const STATUS_TONE = {
  pending: "bg-harvest-50 text-harvest-600",
  approved: "bg-canopy-50 text-canopy-800",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-soil-100 text-ink-600",
};

export default function RequestList({ requests, onOpen, emptyText }) {
  if (requests.length === 0) {
    return <p className="text-sm text-ink-600">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r.id)}
          className="card block w-full text-left hover:border-canopy-400"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-canopy-800">{r.reference}</p>
              <p className="font-medium text-ink-900">{r.title}</p>
              <p className="text-xs text-ink-600">{r.department}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[r.status]}`}>
              {r.status}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
