const statusStyles = {
  active: "bg-canopy-50 text-canopy-800",
  fallow: "bg-soil-100 text-ink-600",
};

export default function FarmList({ farms }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Company-owned farms</p>
      <div className="mt-3 space-y-2">
        {farms.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{f.name}</p>
              <p className="text-xs text-ink-600">
                {f.crop} · {f.sizeHectares} ha · {f.state}
              </p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[f.status]}`}>{f.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
