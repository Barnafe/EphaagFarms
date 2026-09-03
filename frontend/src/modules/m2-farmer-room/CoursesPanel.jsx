import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const TYPE_LABELS = {
  course: "Course",
  seminar: "Seminar",
  research: "Research",
  consultancy: "Consultancy",
};

export default function CoursesPanel() {
  const [courses, setCourses] = useState([]);
  const [seminars, setSeminars] = useState([]);
  const [research, setResearch] = useState([]);
  const [consultancy, setConsultancy] = useState([]);
  const [selected, setSelected] = useState(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ courses: c }, { seminars: s }, { research: r }, { offerings: o }] = await Promise.all([
        apiFetch("/rtc/courses"),
        apiFetch("/rtc/seminars"),
        apiFetch("/rtc/research"),
        apiFetch("/rtc/consultancy"),
      ]);
      setCourses(c);
      setSeminars(s);
      setResearch(r);
      setConsultancy(o);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-sync the open detail card with fresh data after any action.
  useEffect(() => {
    if (!selected) return;
    const pool = { course: courses, seminar: seminars, research, consultancy }[selected.type];
    const fresh = pool.find((x) => x.id === selected.id);
    if (fresh) setSelected({ type: selected.type, ...fresh });
  }, [courses, seminars, research, consultancy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleComplete(id) {
    try {
      await apiFetch(`/rtc/courses/${id}/complete`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleApply(offeringId) {
    try {
      await apiFetch(`/rtc/consultancy/${offeringId}/apply`, {
        method: "POST",
        body: { message: applyMessage },
      });
      setApplyMessage("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const cards = [
    ...courses.map((c) => ({ type: "course", ...c })),
    ...seminars.map((s) => ({ type: "seminar", ...s })),
    ...research.map((r) => ({ type: "research", ...r })),
    ...consultancy.map((c) => ({ type: "consultancy", ...c })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-white">Training, Research & Consultancy</h2>
        <p className="mt-1 text-sm text-canopy-100">
          Always free — courses, seminars, research, and one-on-one consultancy from EPHAAG Farms.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-canopy-100">Loading…</p>
      ) : selected ? (
        <div className="card">
          <button className="text-sm text-canopy-800" type="button" onClick={() => setSelected(null)}>
            ← Back
          </button>
          <p className="mt-3 text-xs uppercase tracking-wide text-canopy-600">{TYPE_LABELS[selected.type]}</p>
          <p className="mt-1 text-lg font-medium text-ink-900">{selected.title}</p>

          {selected.type === "course" && (
            <>
              {selected.description && <p className="mt-2 text-sm text-ink-600">{selected.description}</p>}
              <div className="mt-4">
                {selected.completed ? (
                  <span className="rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
                    Completed
                  </span>
                ) : (
                  <button className="btn-primary" type="button" onClick={() => handleComplete(selected.id)}>
                    Mark complete
                  </button>
                )}
              </div>
            </>
          )}

          {selected.type === "seminar" && (
            <p className="mt-2 text-sm text-ink-600">
              {selected.event_date} · {selected.location}
            </p>
          )}

          {selected.type === "research" && selected.summary && (
            <p className="mt-2 text-sm text-ink-600">{selected.summary}</p>
          )}

          {selected.type === "consultancy" && (
            <>
              {selected.description && <p className="mt-2 text-sm text-ink-600">{selected.description}</p>}
              <div className="mt-4">
                {selected.requestStatus ? (
                  <span className="inline-block rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
                    Application {selected.requestStatus}
                  </span>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={applyMessage}
                      onChange={(e) => setApplyMessage(e.target.value)}
                      rows={2}
                      placeholder="What would you like to discuss? (optional)"
                    />
                    <button className="btn-primary" type="button" onClick={() => handleApply(selected.id)}>
                      Submit application
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-canopy-100">Nothing published yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => setSelected(item)}
              className="card block text-left hover:border-canopy-400"
            >
              <p className="text-xs uppercase tracking-wide text-canopy-600">{TYPE_LABELS[item.type]}</p>
              <p className="mt-1 font-medium text-ink-900">{item.title}</p>
              {item.type === "course" && item.completed && (
                <span className="mt-2 inline-block rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
                  Completed
                </span>
              )}
              {item.type === "consultancy" && item.requestStatus && (
                <span className="mt-2 inline-block rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
                  Application {item.requestStatus}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
