import { useState } from "react";
import ResearchManager from "./ResearchManager.jsx";
import { SeminarManager, CourseManager } from "./TrainingManagers.jsx";
import ConsultancyManager from "./ConsultancyManager.jsx";
import {
  research as initialResearch,
  seminars as initialSeminars,
  courses as initialCourses,
  consultancy as initialConsultancy,
} from "./mockData.js";

const tabs = [
  { key: "research", label: "Research" },
  { key: "training", label: "Training" },
  { key: "consultancy", label: "Consultancy" },
];

export default function RTCDepartment() {
  const [tab, setTab] = useState("training");
  const [research, setResearch] = useState(initialResearch);
  const [seminars, setSeminars] = useState(initialSeminars);
  const [courses, setCourses] = useState(initialCourses);
  const [consultancy, setConsultancy] = useState(initialConsultancy);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-600">Admin department</p>
        <h1 className="text-xl font-medium text-ink-900">RTC Department</h1>
        <p className="mt-1 text-sm text-ink-600">Research, Training & Consultancy — one department, three content types, all free to members.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1 text-sm ${
              tab === t.key ? "border-canopy-600 bg-canopy-50 text-canopy-800" : "border-soil-200 text-ink-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "research" && (
        <ResearchManager items={research} onAdd={(item) => setResearch((p) => [item, ...p])} />
      )}

      {tab === "training" && (
        <>
          <SeminarManager items={seminars} onAdd={(item) => setSeminars((p) => [item, ...p])} />
          <CourseManager items={courses} onAdd={(item) => setCourses((p) => [item, ...p])} />
        </>
      )}

      {tab === "consultancy" && (
        <ConsultancyManager items={consultancy} onAdd={(item) => setConsultancy((p) => [item, ...p])} />
      )}
    </div>
  );
}
