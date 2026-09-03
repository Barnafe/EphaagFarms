export default function MovementHistory({ movements }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Recent stock movements</p>
      <div className="mt-3 space-y-1">
        {movements.length === 0 && <p className="text-sm text-ink-600">No stock movements recorded yet.</p>}
        {movements.slice(0, 15).map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
            <span className={m.direction === "in" ? "text-canopy-800" : "text-red-700"}>
              {m.direction === "in" ? "+" : "−"}
              {m.quantity} {m.unit} {m.crop}
            </span>
            <span className="text-ink-600">
              {m.reason.replace("_", " ")}
              {m.order_reference ? ` — ${m.order_reference}` : ""}
              {m.recorded_by_name ? ` · ${m.recorded_by_name}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
