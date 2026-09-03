export default function ContentBrowser({ seminars, courses, research }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <p className="text-sm text-ink-600">Upcoming seminars</p>
        <div className="mt-3 space-y-2">
          {seminars.map((s) => (
            <div key={s.id} className="rounded-card border border-soil-200 px-3 py-2">
              <p className="font-medium text-ink-900">{s.title}</p>
              <p className="text-xs text-ink-600">{s.date} · {s.location}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Free courses</p>
        <div className="mt-3 space-y-2">
          {courses.map((c) => (
            <div key={c.id} className="rounded-card border border-soil-200 px-3 py-2">
              <p className="font-medium text-ink-900">{c.title}</p>
              <p className="text-sm text-ink-600">{c.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Research</p>
        <div className="mt-3 space-y-2">
          {research.map((r) => (
            <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
              <p className="font-medium text-ink-900">{r.title}</p>
              <p className="text-sm text-ink-600">{r.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
