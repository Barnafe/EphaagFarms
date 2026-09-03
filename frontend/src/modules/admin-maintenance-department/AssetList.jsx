const statusStyles = {
  good: "bg-canopy-50 text-canopy-800",
  due: "bg-harvest-50 text-harvest-600",
  in_repair: "bg-red-50 text-red-700",
};

const statusLabel = {
  good: "Good",
  due: "Service due",
  in_repair: "In repair",
};

export default function AssetList({ assets, onLogService }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Vehicles & equipment</p>
      <div className="mt-3 space-y-2">
        {assets.map((a) => (
          <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink-900">{a.name}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[a.status]}`}>
                {statusLabel[a.status]}
              </span>
            </div>
            <p className="text-xs text-ink-600">
              {a.type} · last serviced {a.lastServiced}
            </p>
            {a.status !== "good" && (
              <button
                className="btn-outline mt-2"
                type="button"
                onClick={() => onLogService(a.id)}
              >
                Mark serviced
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
