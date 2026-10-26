import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";
import ProfilePhotoUploader from "../../components/ProfilePhotoUploader.jsx";

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const thisYear = new Date().getFullYear();
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(to - i));

// Field types: text | date | select | state | lga | yesno | textarea | readonly
// Each tab saves to PUT /corpers/me/profile/:section (keys match the
// backend spec in utils/corperProfile.js).
const TABS = [
  {
    key: "personal", label: "Personal",
    fields: [
      { name: "_name", label: "Full name", type: "readonly" },
      { name: "_email", label: "Email", type: "readonly" },
      { name: "_phone", label: "Phone number", type: "readonly" },
      { name: "dateOfBirth", label: "Date of birth", type: "date" },
      { name: "stateOfOrigin", label: "State of origin", type: "state" },
      { name: "address", label: "Home address", type: "textarea", full: true },
    ],
  },
  {
    key: "nysc", label: "NYSC Details",
    fields: [
      { name: "callUpNumber", label: "Call-up number", type: "text" },
      { name: "stateCode", label: "State code", type: "text" },
      { name: "serviceYear", label: "Service year", type: "select", options: range(thisYear - 1, thisYear + 1).map((y) => ({ value: y, label: y })) },
      { name: "batch", label: "Batch", type: "select", options: opts([["A", "A"], ["B", "B"], ["C", "C"]]) },
      { name: "stream", label: "Stream", type: "select", options: opts([["I", "I"], ["II", "II"]]) },
      { name: "stateOfDeployment", label: "State of deployment", type: "state" },
      { name: "lgaOfDeployment", label: "LGA of deployment", type: "lga", of: "stateOfDeployment" },
      { name: "orientationCamp", label: "Orientation camp", type: "text" },
      { name: "cdsGroup", label: "CDS group", type: "text" },
      { name: "ppa", label: "Place of primary assignment (PPA)", type: "text", span: 2 },
      { name: "discipline", label: "Discipline", type: "text" },
    ],
  },
  {
    key: "education", label: "Education & Skills",
    fields: [
      { name: "educationLevel", label: "Highest qualification", type: "select", options: opts([["ssce", "SSCE"], ["ond", "OND"], ["nd", "ND"], ["hnd", "HND"], ["bachelors", "Bachelor's degree"], ["pgd", "Postgraduate diploma"], ["masters", "Master's degree"], ["phd", "PhD"]]) },
      { name: "institution", label: "Institution attended", type: "text" },
      { name: "courseOfStudy", label: "Course of study", type: "text" },
      { name: "graduationYear", label: "Year of graduation", type: "select", options: range(1995, thisYear + 1).map((y) => ({ value: y, label: y })) },
      { name: "skillLevel", label: "Skill level", type: "select", options: opts([["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]]) },
      { name: "employmentStatus", label: "Employment status", type: "select", options: opts([["employed_full_time", "Employed (full time)"], ["self_employed", "Self employed"], ["student", "Student"], ["unemployed", "Unemployed"]]) },
      { name: "englishProficiency", label: "English proficiency", type: "select", options: opts([["basic", "Basic"], ["intermediate", "Intermediate"], ["fluent", "Fluent"], ["native", "Native"]]) },
      { name: "otherLanguages", label: "Other languages", type: "text" },
      { name: "linkedinUrl", label: "LinkedIn profile URL", type: "text", span: 2 },
    ],
  },
  {
    key: "goals", label: "Training Goals",
    fields: [
      { name: "learningStyle", label: "Preferred learning style", type: "select", options: opts([["visual", "Visual"], ["auditory", "Auditory"], ["reading_writing", "Reading and writing"], ["hands_on", "Hands-on"]]) },
      { name: "learningMode", label: "Preferred learning mode", type: "select", options: opts([["self_paced", "Self-paced"], ["live_sessions", "Live sessions"], ["both", "Both"]]) },
      { name: "projectBased", label: "Comfortable with project-based learning?", type: "yesno" },
      { name: "motivation", label: "Main motivation for joining", type: "select", options: opts([["career_change", "Career change"], ["skill_upgrade", "Upgrade my skills"], ["employment", "Get employed"], ["entrepreneurship", "Start a business"], ["certification", "Get certified"], ["other", "Other"]]) },
      { name: "topicsOfInterest", label: "Topics or skills you most want to learn", type: "text" },
      { name: "goals", label: "What do you hope to achieve by the end of the programme?", type: "textarea", full: true },
    ],
  },
  {
    key: "documents", label: "Documents & Consent",
    fields: [
      { name: "_photo", label: "Passport photograph", type: "photo", full: true },
      { name: "consentTerms", label: "I agree to the programme terms and conditions (required)", type: "yesno", full: true },
      { name: "consentData", label: "I consent to my details being shared with NYSC for certification (required)", type: "yesno", full: true },
      { name: "consentMedia", label: "I authorise use of my media in programme-related content", type: "yesno", full: true },
      { name: "alumniInterest", label: "I would like to join the alumni network after the programme", type: "yesno", full: true },
    ],
  },
];

const inputCls = "h-11 w-full rounded-card border border-soil-200 bg-white px-3 text-sm text-ink-900 focus:border-[#2c6b2f] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-semibold text-ink-800";

function Ring({ percent }) {
  return (
    <div
      className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(#2c6b2f 0 ${percent}%, #e9f1e6 0)` }}
      role="img"
      aria-label={`Profile ${percent}% complete`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-sm font-semibold text-ink-900">{percent}%</div>
    </div>
  );
}

function YesNo({ value, onChange, label, id }) {
  // Deliberately starts unselected (null) — unlike a pre-set "No", the
  // person has to actually answer.
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="mb-1.5 text-sm text-ink-800">{label}</p>
      <div className="flex gap-2">
        {[[true, "Yes"], [false, "No"]].map(([v, t]) => (
          <button
            key={t}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`h-11 w-24 rounded-card border text-sm font-medium ${value === v ? "border-[#2c6b2f] bg-[#2c6b2f] text-white" : "border-soil-200 bg-white text-ink-800"}`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CorperProfile({ user, bundle, onSaved }) {
  const { profile, completion } = bundle;
  const [tabIdx, setTabIdx] = useState(0);
  const [values, setValues] = useState(() => ({ ...profile }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const tab = TABS[tabIdx];
  const readonly = useMemo(() => ({ _name: user.name, _email: user.email, _phone: user.phone }), [user]);
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  async function save(proceed) {
    setSaving(true);
    setMsg(null);
    try {
      const body = {};
      for (const f of tab.fields) {
        if (f.name.startsWith("_")) continue;
        const v = values[f.name];
        body[f.name] = v === undefined ? null : v;
      }
      const next = await apiFetch(`/corpers/me/profile/${tab.key}`, { method: "PUT", body });
      onSaved(next);
      setValues({ ...next.profile });
      setMsg({ ok: true, text: "Saved." });
      if (proceed && tabIdx < TABS.length - 1) setTabIdx(tabIdx + 1);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  function renderField(f) {
    const id = `cf-${f.name}`;
    if (f.type === "readonly") {
      return (
        <div key={f.name}>
          <label className={labelCls} htmlFor={id}>{f.label}</label>
          <input id={id} className={`${inputCls} bg-soil-50`} value={readonly[f.name] || ""} readOnly />
        </div>
      );
    }
    if (f.type === "photo") return <div key={f.name} className="md:col-span-3"><p className={labelCls}>{f.label}</p><ProfilePhotoUploader /></div>;
    if (f.type === "yesno") {
      return (
        <div key={f.name} className="md:col-span-3">
          <YesNo id={id} label={f.label} value={values[f.name] ?? null} onChange={(v) => set(f.name, v)} />
        </div>
      );
    }
    const span = f.full ? "md:col-span-3" : f.span === 2 ? "md:col-span-2" : "";
    let control;
    if (f.type === "textarea") {
      control = <textarea id={id} rows={4} className={`${inputCls} h-auto py-2`} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />;
    } else if (f.type === "state" || f.type === "lga" || f.type === "select") {
      const options =
        f.type === "state" ? NIGERIA_STATE_NAMES.map((s) => ({ value: s, label: s }))
        : f.type === "lga" ? lgasForState(values[f.of] || "").map((l) => ({ value: l, label: l }))
        : f.options;
      control = (
        <select id={id} className={inputCls} value={values[f.name] ?? ""} disabled={f.type === "lga" && !values[f.of]}
          onChange={(e) => {
            set(f.name, e.target.value);
            if (f.type === "state" && f.name === "stateOfDeployment") set("lgaOfDeployment", "");
          }}>
          <option value="">Select</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    } else {
      control = <input id={id} type={f.type === "date" ? "date" : "text"} className={inputCls} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />;
    }
    return (
      <div key={f.name} className={span}>
        <label className={labelCls} htmlFor={id}>{f.label}</label>
        {control}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink-900 md:text-3xl">My Profile</h1>

      <section className="flex items-center gap-5 rounded-card border border-soil-200 bg-white p-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-semibold text-ink-900">{user.name}</h2>
          <p className="mt-1 text-sm text-ink-800">
            {[profile.stateCode, profile.serviceYear && `Batch ${profile.batch} Stream ${profile.stream}`, profile.stateOfDeployment].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Ring percent={completion.percent} />
      </section>

      <nav className="flex gap-1.5 overflow-x-auto rounded-card border border-soil-200 bg-white p-1.5" aria-label="Profile sections">
        {TABS.map((t, i) => {
          const done = completion.sections[t.key]?.complete;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTabIdx(i); setMsg(null); }}
              aria-current={i === tabIdx ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-card px-4 text-sm ${i === tabIdx ? "bg-[#2c6b2f] font-semibold text-white" : "text-ink-800"}`}
            >
              {done && <Check size={14} aria-label="complete" />}
              {t.label}
            </button>
          );
        })}
      </nav>

      <section className="rounded-card border border-soil-200 bg-white p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-3">{tab.fields.map(renderField)}</div>
        {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-ink-800" : "text-red-700"}`} role="status">{msg.text}</p>}
        <div className="mt-6 flex justify-end gap-2">
          {tabIdx > 0 && (
            <button type="button" onClick={() => { setTabIdx(tabIdx - 1); setMsg(null); }} className="h-11 rounded-card border border-[#2c6b2f] bg-white px-5 text-sm font-medium text-[#2c6b2f]">Back</button>
          )}
          <button type="button" disabled={saving} onClick={() => save(true)} className="h-11 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving..." : tabIdx === TABS.length - 1 ? "Save" : "Save and proceed"}
          </button>
        </div>
      </section>
    </div>
  );
}
