import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const FILTERS = [["all", "All"], ["paid", "Paid"], ["unpaid", "Not paid"]];

// TRC -> Corps -> Progress. Numbers come from the same shared calculation
// the members' own dashboards use. Only PAID members count (an unpaid or
// refunded member's progress is kept but doesn't count). The NYSC spreadsheet
// export lives in the Members sub-tab.
export default function CorpsProgress() {
  const [data, setData] = useState(null);
  const [paid, setPaid] = useState("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);
  const limit = 50;

  useEffect(() => {
    setOffset(0);
  }, [paid, q]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (paid !== "all") params.set("paid", paid);
        if (q.trim()) params.set("q", q.trim());
        const d = await apiFetch(`/rtc/admin/corps/progress?${params}`);
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err.message);
      }
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [paid, q, offset]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-white">Corps member progress</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Percent = courses completed out of all live corps courses. A course is complete when every lesson is done and the quiz has been submitted at least once.
        </p>
      </div>

      {error && <div className="card border-red-200 bg-red-50" role="alert"><p className="text-sm text-red-700">{error}</p></div>}

      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Corps members", data.totalMembers],
            ["Paid (counted)", data.paidMembers],
            ["Live courses", data.courses.length],
            ["Completions", data.courses.reduce((n, c) => n + c.completed, 0)],
          ].map(([label, value]) => (
            <div key={label} className="card">
              <p className="text-xs text-ink-600">{label}</p>
              <p className="font-display text-2xl font-semibold text-ink-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="font-medium text-ink-900">By course</h2>
        <p className="text-xs text-ink-600">Paid members only. “Started” = at least one lesson done or a quiz attempt.</p>
        {!data && <p className="mt-3 text-sm text-ink-600">Loading…</p>}
        {data && data.courses.length === 0 && <p className="mt-3 text-sm text-ink-600">No corps course is live yet.</p>}
        {data && data.courses.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm" data-testid="course-stats">
              <thead>
                <tr className="text-xs text-ink-600">
                  <th className="py-1 pr-3 font-medium">Course</th>
                  <th className="py-1 pr-3 font-medium">Lessons</th>
                  <th className="py-1 pr-3 font-medium">Questions</th>
                  <th className="py-1 pr-3 font-medium">Started</th>
                  <th className="py-1 pr-3 font-medium">Completed</th>
                  <th className="py-1 font-medium">Avg best score</th>
                </tr>
              </thead>
              <tbody>
                {data.courses.map((c) => (
                  <tr key={c.id} className="border-t border-soil-200 text-ink-900">
                    <td className="py-2 pr-3 font-medium">{c.title}</td>
                    <td className="py-2 pr-3">{c.lessonCount}</td>
                    <td className="py-2 pr-3">{c.questionCount}</td>
                    <td className="py-2 pr-3">{c.started}</td>
                    <td className="py-2 pr-3">{c.completed}</td>
                    <td className="py-2">{c.averageBestScore === null ? "—" : `${c.averageBestScore}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-ink-900">Members</h2>
          <div className="flex gap-1 text-xs" role="group" aria-label="Filter by payment">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setPaid(value)} aria-pressed={paid === value}
                className={`rounded-card border px-2 py-1 ${paid === value ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-900"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field mt-3">
          <input aria-label="Search members" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or state code" />
        </div>

        {!data && <p className="mt-3 text-sm text-ink-600">Loading…</p>}
        {data && data.members.length === 0 && <p className="mt-3 text-sm text-ink-600">No corps members match.</p>}
        {data && data.members.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm" data-testid="member-progress">
              <thead>
                <tr className="text-xs text-ink-600">
                  <th className="py-1 pr-3 font-medium">Member</th>
                  <th className="py-1 pr-3 font-medium">Paid</th>
                  <th className="py-1 pr-3 font-medium">Courses completed</th>
                  <th className="py-1 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.userId} className="border-t border-soil-200 align-top text-ink-900" data-testid="member-row">
                    <td className="py-2 pr-3">
                      <p className="font-medium">
                        {m.name}
                        {m.stateCode ? <span className="ml-2 text-xs text-ink-600">{m.stateCode}</span> : null}
                      </p>
                      <p className="text-xs text-ink-600">{m.email || "no email"}{m.batch ? ` · ${m.batch}` : ""}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.paid ? "bg-canopy-50 text-canopy-800" : "bg-soil-100 text-ink-800"}`}>{m.paid ? "Paid" : "Not paid"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {m.coursesCompleted} of {m.totalCourses}
                      {!m.paid && m.coursesCompletedRecorded > 0 ? (
                        <span className="block text-xs text-ink-600">{m.coursesCompletedRecorded} on record, not counted</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-soil-100" role="progressbar" aria-valuenow={m.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.name} progress`}>
                          <div className="h-full bg-canopy-600" style={{ width: `${m.percent}%` }} />
                        </div>
                        <span className="font-medium">{m.percent}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.matching > limit && (
          <div className="mt-3 flex items-center justify-between text-xs text-ink-600">
            <span>{offset + 1}–{Math.min(offset + limit, data.matching)} of {data.matching}</span>
            <div className="flex gap-2">
              <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded-card border border-soil-200 px-3 py-1 text-ink-900 disabled:opacity-40">Previous</button>
              <button type="button" disabled={offset + limit >= data.matching} onClick={() => setOffset(offset + limit)} className="rounded-card border border-soil-200 px-3 py-1 text-ink-900 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
