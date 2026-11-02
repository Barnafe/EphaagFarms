import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUpload } from "../../api/client.js";

// Admin editor for ONE seminar topic (a general course): add videos and slide decks.
// Farmers' progress is marked by the system as they watch and scroll.
export default function SeminarContentEditor({ course, onBack, onChanged }) {
  const base = `/rtc/admin/courses/${course.id}/seminar-items`;
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("video");
  const [videoUrl, setVideoUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const { items: list } = await apiFetch(base);
      setItems(list);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("kind", kind);
      if (kind === "video") form.append("videoUrl", videoUrl.trim());
      else files.forEach((f) => form.append("slides", f));
      await apiUpload(base, form);
      setTitle(""); setVideoUrl(""); setFiles([]); setFileKey((k) => k + 1);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Remove this item?")) return;
    try {
      await apiFetch(`/rtc/admin/seminar-items/${id}`, { method: "DELETE" });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <button type="button" className="text-sm text-canopy-100 underline" onClick={onBack}>← Back to courses</button>
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">TRC: Seminar content</p>
        <h1 className="text-xl font-medium text-white">{course.title}</h1>
      </div>

      {error && <div className="card border-red-200 bg-red-50"><p className="text-sm text-red-700">{error}</p></div>}

      <div className="card">
        <p className="text-sm text-ink-600">Items in this seminar</p>
        {items.length === 0 && <p className="mt-2 text-sm text-ink-600">Nothing added yet.</p>}
        <div className="mt-3 space-y-2">
          {items.map((i, n) => (
            <div key={i.id} className="flex items-start justify-between gap-2 rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="font-medium text-ink-900">{n + 1}. {i.title}</p>
                <p className="text-xs text-ink-600">{i.kind === "video" ? `Video: ${i.videoUrl}` : `Slides: ${(i.slides || []).length} image${(i.slides || []).length === 1 ? "" : "s"}`}</p>
              </div>
              <button type="button" className="shrink-0 text-xs text-red-700 underline" onClick={() => remove(i.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={add} className="card field space-y-3">
        <p className="text-sm text-ink-600">Add an item</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
        <div role="group" aria-label="Item type" className="flex gap-2">
          {[["video", "Video"], ["slides", "Slides"]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}
              className={`rounded-card border px-3 py-2 text-sm ${kind === value ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-900"}`}>
              {label}
            </button>
          ))}
        </div>
        {kind === "video" ? (
          <div>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Video link (YouTube, Vimeo or a direct video file)" required />
            <p className="mt-1 text-xs text-ink-600">The farmer's progress is saved when the video ends.</p>
          </div>
        ) : (
          <div>
            <input key={fileKey} type="file" accept="image/png,image/jpeg,image/webp" multiple required
              onChange={(e) => setFiles(Array.from(e.target.files || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))} />
            <p className="mt-1 text-xs text-ink-600">Slide images (PNG or JPG), up to 60, 5 MB each. They show in file name order. Progress is saved at the last slide.</p>
          </div>
        )}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Add item"}</button>
      </form>
    </div>
  );
}
