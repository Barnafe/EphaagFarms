import { useState } from "react";

export default function AttendanceUpload({ seminars, onSheetSubmitted }) {
  const [seminarId, setSeminarId] = useState(seminars[0]?.id ?? "");
  const [fileName, setFileName] = useState("");

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!seminarId || !fileName) return;
    onSheetSubmitted({ seminarId, sheetFileName: fileName });
  }

  return (
    <form onSubmit={handleSubmit} className="card field space-y-3">
      <p className="text-sm text-ink-600">Upload manual attendance sheet</p>
      <p className="text-xs text-ink-600">
        After uploading, you'll mark who attended from your jurisdiction's list, then submit
        both together.
      </p>
      <div>
        <label>Seminar</label>
        <select value={seminarId} onChange={(e) => setSeminarId(e.target.value)}>
          {seminars.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} — {s.date}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>Scanned attendance sheet</label>
        <input type="file" onChange={handleFileChange} />
      </div>
      <button className="btn-primary" type="submit" disabled={!fileName}>
        Continue to mark attendance
      </button>
    </form>
  );
}
