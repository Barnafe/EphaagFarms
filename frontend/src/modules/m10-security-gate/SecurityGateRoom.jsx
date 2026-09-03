import { useState } from "react";
import ContentBrowser from "./ContentBrowser.jsx";
import MyEducationSummary from "./MyEducationSummary.jsx";
import AttendanceUpload from "./AttendanceUpload.jsx";
import AttendanceChecklist from "./AttendanceChecklist.jsx";
import { seminars, courses, research, myEducation, jurisdictionMembers } from "./mockData.js";

const ranks = ["Member", "Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"];

export default function SecurityGateRoom() {
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
          <p className="text-xs uppercase tracking-wide text-canopy-600">Module 10</p>
          <h1 className="text-xl font-medium text-ink-900">Security Gate — RTC</h1>
          <p className="mt-1 text-sm text-ink-600">Research, training, and consultancy — always free.</p>
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

      <MyEducationSummary education={myEducation} />

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

      <ContentBrowser seminars={seminars} courses={courses} research={research} />
    </div>
  );
}
