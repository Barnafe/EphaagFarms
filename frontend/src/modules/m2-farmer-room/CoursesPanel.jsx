import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { apiFetch, apiDownload } from "../../api/client.js";
import SeminarVideo from "./SeminarVideo.jsx";
import SlideViewer from "./SlideViewer.jsx";

const Done = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
  </span>
);

export default function CoursesPanel() {
  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
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

  const selected = courses.find((c) => c.id === selectedId) || null;

  // The system marks things complete: a video when it ends, a deck when its last
  // slide is reached, the topic when every item is done.
  async function finishItem(itemId) {
    try {
      await apiFetch(`/rtc/seminar-items/${itemId}/complete`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Older topics with no videos or slides: opening the material or the session counts.
  async function openedLegacy(course) {
    if (course.completed) return;
    try {
      await apiFetch(`/rtc/courses/${course.id}/complete`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownload(course) {
    try {
      await apiDownload(`/rtc/courses/${course.id}/material`, course.title);
      openedLegacy(course);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-white">Seminar</h2>
        <p className="mt-1 text-sm text-canopy-100">Watch each video and go through each slide to the end. Your progress saves by itself.</p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-canopy-100">Loading…</p>
      ) : selected ? (
        <div className="card space-y-4">
          <button className="text-sm text-canopy-800" type="button" onClick={() => setSelectedId(null)}>
            ← Back
          </button>
          <div>
            <p className="text-lg font-medium text-ink-900">{selected.title}</p>
            {selected.description && <p className="mt-1 text-sm text-ink-600">{selected.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {selected.completed ? <Done /> : selected.totalItems > 0 && <span className="text-xs text-ink-600">{selected.completedItems} of {selected.totalItems} done</span>}
            </div>
          </div>

          {selected.items.map((item) => (
            <div key={item.id} className="space-y-2">
              <div className="flex items-center gap-2">
                {item.completed ? <CheckCircle2 className="h-4 w-4 text-canopy-600" /> : <Circle className="h-4 w-4 text-ink-600" />}
                <p className="font-medium text-ink-900">{item.title}</p>
                <span className="text-xs text-ink-600">{item.kind === "video" ? "Video" : "Slides"}</span>
              </div>
              {item.kind === "video"
                ? <SeminarVideo url={item.videoUrl} done={item.completed} onEnded={() => !item.completed && finishItem(item.id)} />
                : <SlideViewer slides={item.slides || []} onFinished={() => !item.completed && finishItem(item.id)} />}
            </div>
          ))}

          {selected.items.length === 0 && (
            <div className="space-y-3">
              {selected.scheduledAt && <p className="text-sm text-ink-600">Scheduled for {new Date(selected.scheduledAt).toLocaleString()}</p>}
              <div className="flex flex-wrap gap-2">
                {selected.onlineLink && (
                  <a className="btn-primary inline-block" href={selected.onlineLink} target="_blank" rel="noreferrer" onClick={() => openedLegacy(selected)}>
                    Attend online
                  </a>
                )}
                {selected.hasMaterials && (
                  <button type="button" className="rounded-full border border-canopy-400 px-3 py-1.5 text-xs font-medium text-canopy-800" onClick={() => handleDownload(selected)}>
                    Download materials
                  </button>
                )}
              </div>
              {!selected.onlineLink && !selected.hasMaterials && <p className="text-sm text-ink-600">Content is coming soon.</p>}
            </div>
          )}
        </div>
      ) : courses.length === 0 ? (
        <p className="text-sm text-canopy-100">Nothing published yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {courses.map((c) => (
            <button key={c.id} type="button" onClick={() => setSelectedId(c.id)} className="card block text-left hover:border-canopy-400">
              <p className="font-medium text-ink-900">{c.title}</p>
              <div className="mt-2">
                {c.completed ? <Done /> : c.totalItems > 0 ? <span className="text-xs text-ink-600">{c.completedItems} of {c.totalItems} done</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
