import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiDownload } from "../../api/client.js";

export default function CoursesPanel() {
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { courses: c } = await apiFetch("/rtc/courses");
      setCourses(c);
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
    const fresh = courses.find((c) => c.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [courses]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleComplete(id) {
    try {
      await apiFetch(`/rtc/courses/${id}/complete`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownload(id, title) {
    try {
      await apiDownload(`/rtc/courses/${id}/material`, title);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-white">Seminal</h2>
        <p className="mt-1 text-sm text-canopy-100">
          Training courses from EPHAAG Farms — always free. View materials, attend hosted online sessions,
          and mark courses complete.
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
          <p className="mt-3 text-xs uppercase tracking-wide text-canopy-600">Course</p>
          <p className="mt-1 text-lg font-medium text-ink-900">{selected.title}</p>
          {selected.description && <p className="mt-2 text-sm text-ink-600">{selected.description}</p>}

          {selected.scheduledAt && (
            <p className="mt-2 text-sm text-ink-600">
              Scheduled for {new Date(selected.scheduledAt).toLocaleString()}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {selected.onlineLink && (
              <a
                className="btn-primary inline-block"
                href={selected.onlineLink}
                target="_blank"
                rel="noreferrer"
              >
                Attend online
              </a>
            )}
            {selected.hasMaterials && (
              <button
                type="button"
                className="rounded-full border border-canopy-400 px-3 py-1.5 text-xs font-medium text-canopy-800"
                onClick={() => handleDownload(selected.id, selected.title)}
              >
                Download materials
              </button>
            )}
          </div>

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
        </div>
      ) : courses.length === 0 ? (
        <p className="text-sm text-canopy-100">Nothing published yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="card block text-left hover:border-canopy-400"
            >
              <p className="text-xs uppercase tracking-wide text-canopy-600">Course</p>
              <p className="mt-1 font-medium text-ink-900">{c.title}</p>
              {c.completed && (
                <span className="mt-2 inline-block rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
                  Completed
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
