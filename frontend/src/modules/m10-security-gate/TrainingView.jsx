import { useState } from "react";
import { Link } from "react-router-dom";
import AttendanceUpload from "./AttendanceUpload.jsx";
import AttendanceChecklist from "./AttendanceChecklist.jsx";
import { seminars, courses, jurisdictionMembers } from "./mockData.js";

// TODO: replace with the member's real rank from AuthContext once profile data is wired.
const ranks = ["Member", "Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"];

export default function TrainingView() {
  const [rank, setRank] = useState("Unit Leader");
  const [step, setStep] = useState("upload"); // "upload" | "checklist" | "done"
  const [sheetInfo, setSheetInfo] = useState(null);
  const [lastSubmission, setLastSubmission] = useState(null);

  function handleSheetSubmitted(info) {
    setSheetInfo(info);
    setStep("checklist");
  }

  function handleAttendanceSubmit(attendedIds) {
    setLastSubmission({ ...sheetInfo, attendedCount: attendedIds.length, total: jurisdictionMembers.length });
    setStep("done");
  }

  const selectedSeminar = seminars.find((s) => s.id === sheetInfo?.seminarId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard/farmer/education" className="text-xs text-canopy-600 hover:underline">
            ← Research, Training & Consultancy
          </Link>
          <h1 className="mt-1 text-xl font-medium text-ink-900">Training</h1>
        </div>
        <div className="field">
          <label className="!mb-0 text-xs">Demo: view as</label>
          <select value={rank} onChange={(e) => { setRank(e.target.value); setStep("upload"); }}>
            {ranks.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

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

      {rank === "Unit Leader" && (
        <>
          {step === "upload" && (
            <AttendanceUpload seminars={seminars} onSheetSubmitted={handleSheetSubmitted} />
          )}
          {step === "checklist" && (
            <AttendanceChecklist
              members={jurisdictionMembers}
              seminarTitle={selectedSeminar?.title}
              sheetFileName={sheetInfo?.sheetFileName}
              onSubmit={handleAttendanceSubmit}
              onBack={() => setStep("upload")}
            />
          )}
          {step === "done" && lastSubmission && (
            <div className="card">
              <p className="text-sm text-canopy-800">Attendance submitted</p>
              <p className="mt-1 text-sm text-ink-600">
                {lastSubmission.attendedCount} of {lastSubmission.total} marked present, sheet on
                file: {lastSubmission.sheetFileName}
              </p>
              <button className="btn-outline mt-3" type="button" onClick={() => setStep("upload")}>
                Mark another seminar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
