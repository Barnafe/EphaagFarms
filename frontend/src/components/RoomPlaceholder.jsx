export default function RoomPlaceholder({ title, moduleLabel }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="card border-dashed">
        <p className="text-xs uppercase tracking-wide text-canopy-600">{moduleLabel}</p>
        <h1 className="mt-1 text-xl font-medium text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-600">
          This room hasn't been built yet — it's queued in the roadmap.
        </p>
      </div>
    </div>
  );
}
