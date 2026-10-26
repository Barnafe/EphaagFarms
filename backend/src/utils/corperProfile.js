// Corps member (NYSC) profile — one place that knows which fields exist,
// how each is validated, which section ("tab") it belongs to, and which
// ones count toward the profile-completeness percentage. Shared by
// registration (authController), the profile endpoints (corperController)
// and the /me profile loader so they can never drift apart.

const text = (max = 300) => ({ type: "text", max });
const intNum = (min, max) => ({ type: "int", min, max });
const bool = () => ({ type: "bool" });
const date = () => ({ type: "date" });
const oneOf = (values) => ({ type: "enum", values });

export const SERVICE_BATCHES = ["A", "B", "C"];
export const SERVICE_STREAMS = ["I", "II"];

// section -> { camelKey: { col, ...validator, required? } }
// `required` = counts toward completeness (and is mandatory where a
// caller asks for it, e.g. registration).
export const SECTIONS = {
  personal: {
    dateOfBirth: { col: "date_of_birth", ...date(), required: true },
    address: { col: "address", ...text(400), required: true },
    stateOfOrigin: { col: "state_of_origin", ...text(60), required: true },
  },
  nysc: {
    callUpNumber: { col: "call_up_number", ...text(40), required: true },
    stateCode: { col: "state_code", ...text(30), required: true },
    serviceYear: { col: "service_year", ...intNum(2020, 2100), required: true },
    batch: { col: "batch", ...oneOf(SERVICE_BATCHES), required: true },
    stream: { col: "stream", ...oneOf(SERVICE_STREAMS), required: true },
    stateOfDeployment: { col: "state_of_deployment", ...text(60), required: true },
    lgaOfDeployment: { col: "lga_of_deployment", ...text(80) },
    ppa: { col: "ppa", ...text(300), required: true },
    discipline: { col: "discipline", ...text(120), required: true },
    orientationCamp: { col: "orientation_camp", ...text(120) },
    cdsGroup: { col: "cds_group", ...text(120) },
  },
  education: {
    educationLevel: {
      col: "education_level",
      ...oneOf(["ssce", "ond", "nd", "hnd", "bachelors", "pgd", "masters", "phd"]),
      required: true,
    },
    institution: { col: "institution", ...text(200), required: true },
    courseOfStudy: { col: "course_of_study", ...text(150), required: true },
    graduationYear: { col: "graduation_year", ...intNum(1990, 2100), required: true },
    skillLevel: { col: "skill_level", ...oneOf(["beginner", "intermediate", "advanced"]), required: true },
    employmentStatus: {
      col: "employment_status",
      ...oneOf(["employed_full_time", "self_employed", "student", "unemployed"]),
      required: true,
    },
    linkedinUrl: { col: "linkedin_url", ...text(300) },
    englishProficiency: { col: "english_proficiency", ...oneOf(["basic", "intermediate", "fluent", "native"]) },
    otherLanguages: { col: "other_languages", ...text(200) },
  },
  goals: {
    learningStyle: { col: "learning_style", ...oneOf(["visual", "auditory", "reading_writing", "hands_on"]) },
    learningMode: { col: "learning_mode", ...oneOf(["self_paced", "live_sessions", "both"]), required: true },
    projectBased: { col: "project_based", ...bool() },
    motivation: {
      col: "motivation",
      ...oneOf(["career_change", "skill_upgrade", "employment", "entrepreneurship", "certification", "other"]),
      required: true,
    },
    goals: { col: "goals", ...text(1000), required: true },
    topicsOfInterest: { col: "topics_of_interest", ...text(300) },
  },
  documents: {
    consentTerms: { col: "consent_terms", ...bool(), required: true, mustBeTrue: true },
    consentData: { col: "consent_data", ...bool(), required: true, mustBeTrue: true },
    consentMedia: { col: "consent_media", ...bool() },
    alumniInterest: { col: "alumni_interest", ...bool() },
  },
};

export const SECTION_KEYS = Object.keys(SECTIONS);

function coerce(def, raw) {
  if (raw === undefined || raw === null || raw === "") return { value: null };
  switch (def.type) {
    case "text": {
      const v = String(raw).trim();
      if (v.length > def.max) return { error: `must be at most ${def.max} characters` };
      return { value: v || null };
    }
    case "int": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < def.min || n > def.max) return { error: "is not a valid number" };
      return { value: n };
    }
    case "bool": {
      if (raw === true || raw === "true" || raw === "yes") return { value: true };
      if (raw === false || raw === "false" || raw === "no") return { value: false };
      return { error: "must be yes or no" };
    }
    case "date": {
      const v = String(raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return { error: "is not a valid date" };
      return { value: v };
    }
    case "enum":
      return def.values.includes(String(raw)) ? { value: String(raw) } : { error: "is not an allowed option" };
    default:
      return { error: "is invalid" };
  }
}

const LABELS = {
  dateOfBirth: "Date of birth", address: "Address", stateOfOrigin: "State of origin",
  callUpNumber: "Call-up number", stateCode: "State code", serviceYear: "Service year",
  batch: "Batch", stream: "Stream", stateOfDeployment: "State of deployment", ppa: "PPA",
  discipline: "Discipline", educationLevel: "Education level", institution: "Institution",
  courseOfStudy: "Course of study", graduationYear: "Graduation year", skillLevel: "Skill level",
  employmentStatus: "Employment status", learningMode: "Learning mode", motivation: "Motivation",
  goals: "Goals", consentTerms: "Terms and conditions", consentData: "Consent to share your details with NYSC",
};
const label = (k) => LABELS[k] || k;

// Validates the fields of one section found in `body`.
//   requireKeys: keys that must be present and non-empty (registration)
//   onlyPresent: only touch keys actually present in body (profile edits)
// Returns { cols: { column_name: value }, error }.
export function coerceSection(sectionName, body, { requireKeys = [], onlyPresent = true } = {}) {
  const spec = SECTIONS[sectionName];
  const cols = {};
  for (const [key, def] of Object.entries(spec)) {
    const present = Object.prototype.hasOwnProperty.call(body, key);
    if (!present && onlyPresent && !requireKeys.includes(key)) continue;
    const { value, error } = coerce(def, body[key]);
    if (error) return { error: `${label(key)} ${error}` };
    if (requireKeys.includes(key) && (value === null || value === undefined)) {
      return { error: `${label(key)} is required` };
    }
    if (def.mustBeTrue && present && value !== true && requireKeys.includes(key)) {
      return { error: `${label(key)} must be accepted` };
    }
    if (def.col === "state_code" && value) cols[def.col] = value.toUpperCase().replace(/\s+/g, "");
    else cols[def.col] = value;
  }
  return { cols };
}

export const PROFILE_COLUMNS = Object.values(SECTIONS).flatMap((s) => Object.values(s).map((d) => d.col));

// Row (snake_case) -> API shape (camelCase) for every field in SECTIONS.
export function mapCorperProfile(row) {
  if (!row) return null;
  const out = {};
  for (const section of Object.values(SECTIONS)) {
    for (const [key, def] of Object.entries(section)) {
      let v = row[def.col];
      if (def.type === "date" && v instanceof Date) v = v.toISOString().slice(0, 10);
      out[key] = v ?? null;
    }
  }
  return out;
}

// Completeness: share of `required` fields filled, plus a per-section
// breakdown (used to tick the profile tabs). The passport photo lives on
// the users row, so the caller passes whether one exists; it counts as one
// extra item in the Documents section.
export function computeCompletion(profile, hasPhoto) {
  const sections = {};
  let done = 0;
  let total = 0;
  for (const [sectionName, spec] of Object.entries(SECTIONS)) {
    let sDone = 0;
    let sTotal = 0;
    for (const [key, def] of Object.entries(spec)) {
      if (!def.required) continue;
      sTotal += 1;
      const v = profile?.[key];
      const filled = def.mustBeTrue ? v === true : v !== null && v !== undefined && v !== "";
      if (filled) sDone += 1;
    }
    if (sectionName === "documents") {
      sTotal += 1;
      if (hasPhoto) sDone += 1;
    }
    sections[sectionName] = { done: sDone, total: sTotal, complete: sDone === sTotal };
    done += sDone;
    total += sTotal;
  }
  return { percent: total ? Math.round((done / total) * 100) : 0, sections };
}
