import { useState } from "react";
import { apiUpload } from "../../api/client.js";

export default function AttendanceMarker({ farmers, onRecorded }) {
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [sheet, setSheet] = useState(null);
  const [attended, setAttended] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function toggleFarmer(id) {
    setAttended((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!sheet) {
      setError("Upload the scanned attendance sheet first.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("eventDate", eventDate);
      formData.append("location", location);
      formData.append("attendedUserIds", JSON.stringify(attended));
      formData.append("sheet", sheet);

      const result = await apiUpload("/farmers/attendance", formData);
      setSuccess(`Recorded — ${result.attendedCount} of ${result.markedCount} marked present.`);
      setTitle("");
      setEventDate("");
      setLocation("");
      setSheet(null);
      setAttended([]);
      onRecorded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Record seminar attendance</p>
      <p className="mt-1 text-xs text-ink-600">
        Upload the scanned sheet, then tick everyone from your unit who attended.
      </p>

      <form onSubmit={handleSubmit} className="field mt-4 space-y-3">
        <div>
          <label>Seminar title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Fertilizer timing" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label>Date</label>
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
          </div>
          <div>
            <label>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="e.g. Unit hall" />
          </div>
        </div>
        <div>
          <label>Scanned attendance sheet</label>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setSheet(e.target.files?.[0] || null)}
            required
          />
        </div>

        <div>
          <p className="text-sm text-ink-600">Who attended?</p>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto rounded-card border border-soil-200 p-3">
            {farmers.length === 0 && <p className="text-sm text-ink-600">No farmers in your jurisdiction yet.</p>}
            {farmers.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm text-ink-900">
                <input type="checkbox" checked={attended.includes(f.id)} onChange={() => toggleFarmer(f.id)} />
                {f.name} <span className="text-xs text-ink-600">({f.unit})</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {success && <p className="text-sm text-canopy-800">{success}</p>}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit attendance"}
        </button>
      </form>
    </div>
  );
}
