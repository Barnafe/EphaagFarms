import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { apiFetch } from "../../api/client.js";

const GREEN = "#2c6b2f"; // canopy-600
const RED = "#c81020"; // clay-600

// Groups records into calendar weeks (Mon–Sun) for the chart, same idea as
// the reference design's "weekly attendance" view.
function groupByWeek(records) {
  const weeks = new Map();
  for (const r of records) {
    const d = new Date(r.eventDate);
    const day = d.getDay(); // 0=Sun..6=Sat
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const key = monday.toISOString().slice(0, 10);

    if (!weeks.has(key)) {
      weeks.set(key, { label: `${fmt(monday)} – ${fmt(sunday)}`, present: 0, notPresent: 0, sortKey: key });
    }
    const bucket = weeks.get(key);
    if (r.attended) bucket.present += 1;
    else bucket.notPresent += 1;
  }
  return [...weeks.values()]
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((w) => ({
      ...w,
      attendancePct: w.present + w.notPresent > 0 ? Math.round((100 * w.present) / (w.present + w.notPresent)) : 0,
    }));
}

function fmt(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AttendanceRoom() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/farmers/attendance/me")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const weekly = useMemo(() => (data ? groupByWeek(data.records) : []), [data]);

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-canopy-100">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium text-white">Attendance</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Marked by your Unit Leader at each seminar — nothing here needs any action from you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-ink-600">Present</p>
          <p className="mt-1 text-2xl font-semibold text-canopy-800">
            {data.present} <span className="text-base font-normal text-ink-600">/ {data.total}</span>
          </p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-ink-600">Attendance percentage</p>
          <p className="mt-1 text-2xl font-semibold text-canopy-800">{data.attendancePct.toFixed(2)}%</p>
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-medium text-ink-800">Weekly attendance</p>
        {weekly.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">No seminars recorded yet.</p>
        ) : (
          <div className="mt-3 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weekly} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                <CartesianGrid stroke="#e6dccd" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b6257" }} />
                <YAxis
                  yAxisId="pct"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "#6b6257" }}
                  label={{ value: "Attendance %", angle: -90, position: "insideLeft", fontSize: 11, fill: "#6b6257" }}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#6b6257" }}
                  label={{ value: "Records", angle: 90, position: "insideRight", fontSize: 11, fill: "#6b6257" }}
                />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="count" dataKey="notPresent" name="Not present" fill={RED} radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="attendancePct"
                  name="Attendance %"
                  stroke={GREEN}
                  strokeWidth={2}
                  dot={{ r: 3, fill: GREEN }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <p className="text-sm font-medium text-ink-800">Attendance records</p>
        {data.records.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">No seminars recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-600">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Seminar</th>
                  <th className="pb-2 pr-4">Location</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r, i) => (
                  <tr key={i} className="border-t border-soil-100">
                    <td className="py-2 pr-4 text-ink-700">
                      {new Date(r.eventDate).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-2 pr-4 text-ink-700">{r.title}</td>
                    <td className="py-2 pr-4 text-ink-600">{r.location}</td>
                    <td className="py-2">
                      <span
                        className={
                          r.attended
                            ? "font-medium text-canopy-800"
                            : "font-medium text-clay-600"
                        }
                      >
                        {r.attended ? "Present" : "Absent"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
