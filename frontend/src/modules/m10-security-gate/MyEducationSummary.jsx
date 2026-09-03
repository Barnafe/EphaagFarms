export default function MyEducationSummary({ education }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Your education record</p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-2xl font-medium text-canopy-800">{education.attendancePct}%</p>
          <p className="text-xs text-ink-600">Seminar attendance</p>
        </div>
        <div>
          <p className="text-2xl font-medium text-canopy-800">{education.coursePct}%</p>
          <p className="text-xs text-ink-600">Course completion</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-600">
        These numbers feed into your Loan Office eligibility.
      </p>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-ink-600">Attendance history</p>
        <div className="mt-2 space-y-1">
          {education.attendanceHistory.map((a) => (
            <div key={a.seminarTitle} className="flex justify-between text-sm">
              <span className="text-ink-900">{a.seminarTitle}</span>
              <span className={a.attended ? "text-canopy-800" : "text-ink-600"}>
                {a.attended ? "Attended" : "Absent"} · {a.date}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-ink-600">Course progress</p>
        <div className="mt-2 space-y-1">
          {education.courseProgress.map((c) => (
            <div key={c.courseTitle} className="flex justify-between text-sm">
              <span className="text-ink-900">{c.courseTitle}</span>
              <span className={c.completed ? "text-canopy-800" : "text-harvest-600"}>
                {c.completed ? "Completed" : "In progress"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
