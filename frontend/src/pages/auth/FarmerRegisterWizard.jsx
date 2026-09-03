import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { apiUpload } from "../../api/client.js";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";
import { wardsForLga } from "../../data/nigeriaWards.js";

const MARITAL_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
];

const ID_TYPE_OPTIONS = [
  { value: "nin", label: "National ID (NIN)" },
  { value: "voters_card", label: "Voter's card" },
  { value: "drivers_license", label: "Driver's license" },
  { value: "passport", label: "International passport" },
  { value: "other", label: "Other" },
];

const FARM_TYPE_OPTIONS = [
  { value: "livestock", label: "Livestock" },
  { value: "crop_production", label: "Crop production" },
  { value: "livestock_and_crops", label: "Livestock & crop production" },
];

const FARM_SIZE_OPTIONS = [
  { value: "0-1_hectares", label: "0 – 1 hectares" },
  { value: "2-4_hectares", label: "2 – 4 hectares" },
  { value: "5plus_hectares", label: "5 hectares and above" },
];

const YEARS_EXPERIENCE_OPTIONS = [
  { value: "1-5", label: "1 – 5 years" },
  { value: "6-10", label: "6 – 10 years" },
  { value: "11plus", label: "11 years and above" },
];

const ANNUAL_FARM_INCOME_OPTIONS = [
  { value: "50k-100k", label: "₦50,000 – ₦100,000" },
  { value: "100k-400k", label: "₦100,000 – ₦400,000" },
  { value: "500k-1m", label: "₦500,000 – ₦1,000,000" },
  { value: "1mplus", label: "₦1,000,000 and above" },
];

const ADDITIONAL_INCOME_TYPE_OPTIONS = [
  { value: "work", label: "Work" },
  { value: "business", label: "Business" },
  { value: "both", label: "Both" },
];

const INCOME_FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

// Best-effort placeholder list, same as the shared Register.jsx form —
// swap once the exact intended options are confirmed.
const LIVESTOCK_ITEMS = ["Poultry", "Fish / aquaculture", "Cattle", "Goat / sheep"];
const CROP_GROUPS = [
  { group: "Grains", items: ["Maize", "Rice", "Sorghum", "Millet"] },
  { group: "Tubers", items: ["Cassava", "Yam", "Sweet potato"] },
  { group: "Vegetables", items: ["Tomatoes", "Pepper", "Onions", "Leafy greens"] },
  { group: "Fruits & cash crops", items: ["Groundnut", "Soybean", "Fruits (orchard)"] },
];

function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function CheckboxList({ items, selected, onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <label key={item} className="flex items-center gap-2 text-sm text-ink-900">
          <input type="checkbox" checked={selected.includes(item)} onChange={() => onToggle(item)} />
          {item}
        </label>
      ))}
    </div>
  );
}

const STEP_LABELS = ["Welcome", "Personal details", "Farming details", "Additional income", "Photo & password"];

export default function FarmerRegisterWizard() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0 = intro/consent
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    gender: "",
    maritalStatus: "",
    dob: "",
    phone: "",
    email: "",
    idType: "",
    idNumber: "",
    homeAddress: "",
    nationality: "Nigerian",
    state: "",
    lga: "",
    ward: "",
    unit: "",
    farmType: "",
    farmSize: "",
    yearsExperience: "",
    keepsRecords: "",
    annualFarmIncome: "",
    additionalIncomeType: "",
    workType: "",
    workOrgName: "",
    workRank: "",
    workMonthlyIncome: "",
    businessType: "",
    businessMaxDuration: "",
    businessIncomeFrequency: "",
    businessIncomeAmount: "",
    password: "",
  });
  const [selectedCrops, setSelectedCrops] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);

  const age = useMemo(() => calcAge(form.dob), [form.dob]);
  const lgaOptions = useMemo(() => lgasForState(form.state), [form.state]);
  const wardOptions = useMemo(() => wardsForLga(form.state, form.lga), [form.state, form.lga]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleCrop(item) {
    setSelectedCrops((prev) => (prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item]));
  }

  function validateStep(n) {
    if (n === 1) {
      if (!form.name || !form.gender || !form.maritalStatus || !form.dob) {
        return "Please fill in your name, gender, marital status, and date of birth.";
      }
      if (age === null) return "Please enter a valid date of birth.";
      if (!form.homeAddress || !form.nationality) return "Please fill in your home address and nationality.";
      if (!form.state || !form.lga || !form.ward || !form.unit) {
        return "Please select your state, LGA, ward, and enter your unit.";
      }
      if (!form.email && !form.phone) return "Enter at least a phone number or an email.";
    }
    if (n === 2) {
      if (!form.farmType || !form.farmSize || !form.yearsExperience || !form.keepsRecords || !form.annualFarmIncome) {
        return "Please answer every question in this section.";
      }
      if (selectedCrops.length === 0) return "Select at least one thing you farm.";
    }
    if (n === 3) {
      if (!form.additionalIncomeType) return "Please choose an option.";
      if (
        (form.additionalIncomeType === "work" || form.additionalIncomeType === "both") &&
        (!form.workType || !form.workOrgName || !form.workRank || !form.workMonthlyIncome)
      ) {
        return "Please fill in all the work details.";
      }
      if (
        (form.additionalIncomeType === "business" || form.additionalIncomeType === "both") &&
        (!form.businessType || !form.businessMaxDuration || !form.businessIncomeFrequency || !form.businessIncomeAmount)
      ) {
        return "Please fill in all the business details.";
      }
    }
    return "";
  }

  function goNext() {
    const msg = validateStep(step);
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setStep((s) => s + 1);
  }

  function goBack() {
    setError("");
    setStep((s) => s - 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.password || form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        role_type: "farmer",
        name: form.name,
        sex: form.gender,
        maritalStatus: form.maritalStatus,
        dateOfBirth: form.dob,
        phone: form.phone || undefined,
        email: form.email || undefined,
        idType: form.idType || undefined,
        idNumber: form.idNumber || undefined,
        homeAddress: form.homeAddress,
        nationality: form.nationality,
        state: form.state,
        lga: form.lga,
        ward: form.ward,
        unit: form.unit,
        farmType: form.farmType,
        farmSize: form.farmSize,
        yearsExperience: form.yearsExperience,
        keepsRecords: form.keepsRecords,
        annualFarmIncome: form.annualFarmIncome,
        crops: selectedCrops.join(","),
        additionalIncomeType: form.additionalIncomeType,
        workType: form.workType || undefined,
        workOrgName: form.workOrgName || undefined,
        workRank: form.workRank || undefined,
        workMonthlyIncome: form.workMonthlyIncome || undefined,
        businessType: form.businessType || undefined,
        businessMaxDuration: form.businessMaxDuration || undefined,
        businessIncomeFrequency: form.businessIncomeFrequency || undefined,
        businessIncomeAmount: form.businessIncomeAmount || undefined,
        password: form.password,
      };

      await register(payload);

      // Photo is optional and never blocks account creation.
      if (photoFile) {
        try {
          const photoForm = new FormData();
          photoForm.append("photo", photoFile);
          await apiUpload("/auth/me/photo", photoForm);
        } catch {
          // Non-fatal — account creation already succeeded.
        }
      }

      navigate("/dashboard/farmer");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-xl font-medium text-ink-900">Farmer registration</h1>
      {step > 0 && (
        <p className="mt-1 text-sm text-ink-600">
          Step {step} of 4 — {STEP_LABELS[step]}
        </p>
      )}

      {step === 0 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-card border border-soil-200 bg-soil-50 p-4 text-sm text-ink-700">
            <p>
              You're about to register as a Farmer with EPHAAG Farms. This gives you access to produce
              sourcing, financing, training, and the other benefits of the network.
            </p>
            <p className="mt-2 font-medium text-ink-900">
              Please make sure every detail you enter is correct — the information you provide is what
              EPHAAG uses to confirm your support and benefits, and incorrect details can delay or affect
              them.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            I understand and agree to provide accurate information.
          </label>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!agreed}
            onClick={() => setStep(1)}
          >
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="field mt-6 space-y-4">
          <div>
            <label>Full name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Gender</label>
              <select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label>Marital status</label>
              <select value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)}>
                <option value="">Select</option>
                {MARITAL_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Date of birth</label>
              <input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            </div>
            <div>
              <label>Age</label>
              <input value={age ?? ""} readOnly placeholder="Auto-calculated" className="bg-soil-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Phone number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="080... (optional if you give an email)"
              />
            </div>
            <div>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="Optional if you give a phone"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Means of identification (optional)</label>
              <select value={form.idType} onChange={(e) => set("idType", e.target.value)}>
                <option value="">Select if you have one</option>
                {ID_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>ID number (optional)</label>
              <input value={form.idNumber} onChange={(e) => set("idNumber", e.target.value)} placeholder="ID number" />
            </div>
          </div>
          <div>
            <label>Home address</label>
            <input
              value={form.homeAddress}
              onChange={(e) => set("homeAddress", e.target.value)}
              placeholder="Full home address"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Nationality</label>
              <input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="Nationality" />
            </div>
            <div>
              <label>State</label>
              <select
                value={form.state}
                onChange={(e) => {
                  set("state", e.target.value);
                  set("lga", "");
                  set("ward", "");
                }}
              >
                <option value="">Select state</option>
                {NIGERIA_STATE_NAMES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Local Government</label>
              <select
                value={form.lga}
                disabled={!form.state}
                onChange={(e) => {
                  set("lga", e.target.value);
                  set("ward", "");
                }}
              >
                <option value="">{form.state ? "Select LGA" : "Select a state first"}</option>
                {lgaOptions.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Ward</label>
              {wardOptions.length > 0 ? (
                <select value={form.ward} disabled={!form.lga} onChange={(e) => set("ward", e.target.value)}>
                  <option value="">{form.lga ? "Select ward" : "Select an LGA first"}</option>
                  {wardOptions.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.ward}
                  disabled={!form.lga}
                  onChange={(e) => set("ward", e.target.value)}
                  placeholder={form.lga ? "Type your ward" : "Select an LGA first"}
                />
              )}
            </div>
          </div>
          <div>
            <label>Unit</label>
            <input
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="Your nearest EPHAAG unit, or your geopolitical unit if none is planted near you yet"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="field mt-6 space-y-4">
          <div>
            <label>Farm type</label>
            <select value={form.farmType} onChange={(e) => set("farmType", e.target.value)}>
              <option value="">Select farm type</option>
              {FARM_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {(form.farmType === "livestock" || form.farmType === "livestock_and_crops") && (
            <div>
              <p className="text-xs text-ink-600">Tick everything you keep</p>
              <div className="mt-1.5 rounded-card border border-soil-200 p-3">
                <CheckboxList items={LIVESTOCK_ITEMS} selected={selectedCrops} onToggle={toggleCrop} />
              </div>
            </div>
          )}
          {(form.farmType === "crop_production" || form.farmType === "livestock_and_crops") && (
            <div className="space-y-3 rounded-card border border-soil-200 p-3">
              <p className="text-xs text-ink-600">Tick everything you grow</p>
              {CROP_GROUPS.map((g) => (
                <div key={g.group}>
                  <p className="mb-1 text-xs font-medium text-canopy-800">{g.group}</p>
                  <CheckboxList items={g.items} selected={selectedCrops} onToggle={toggleCrop} />
                </div>
              ))}
            </div>
          )}

          <div>
            <label>Farm size</label>
            <select value={form.farmSize} onChange={(e) => set("farmSize", e.target.value)}>
              <option value="">Select farm size</option>
              {FARM_SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Years of farming experience</label>
            <select value={form.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)}>
              <option value="">Select</option>
              {YEARS_EXPERIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Do you keep farm inventory records?</label>
            <select value={form.keepsRecords} onChange={(e) => set("keepsRecords", e.target.value)}>
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label>Annual farm income</label>
            <select value={form.annualFarmIncome} onChange={(e) => set("annualFarmIncome", e.target.value)}>
              <option value="">Select</option>
              {ANNUAL_FARM_INCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="field mt-6 space-y-4">
          <div>
            <label>Do you have any additional income?</label>
            <select value={form.additionalIncomeType} onChange={(e) => set("additionalIncomeType", e.target.value)}>
              <option value="">Select</option>
              {ADDITIONAL_INCOME_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {(form.additionalIncomeType === "work" || form.additionalIncomeType === "both") && (
            <div className="space-y-3 rounded-card border border-soil-200 p-3">
              <p className="text-xs font-medium text-canopy-800">Work details</p>
              <div>
                <label>Work type / title</label>
                <input value={form.workType} onChange={(e) => set("workType", e.target.value)} placeholder="e.g. Teacher" />
              </div>
              <div>
                <label>Name of organization</label>
                <input value={form.workOrgName} onChange={(e) => set("workOrgName", e.target.value)} placeholder="Organization" />
              </div>
              <div>
                <label>Rank</label>
                <input value={form.workRank} onChange={(e) => set("workRank", e.target.value)} placeholder="Rank / position" />
              </div>
              <div>
                <label>Monthly income</label>
                <input
                  type="number"
                  value={form.workMonthlyIncome}
                  onChange={(e) => set("workMonthlyIncome", e.target.value)}
                  placeholder="₦ per month"
                />
              </div>
            </div>
          )}

          {(form.additionalIncomeType === "business" || form.additionalIncomeType === "both") && (
            <div className="space-y-3 rounded-card border border-soil-200 p-3">
              <p className="text-xs font-medium text-canopy-800">Business details</p>
              <div>
                <label>Business type</label>
                <input value={form.businessType} onChange={(e) => set("businessType", e.target.value)} placeholder="e.g. Trading" />
              </div>
              <div>
                <label>Maximum duration</label>
                <input
                  value={form.businessMaxDuration}
                  onChange={(e) => set("businessMaxDuration", e.target.value)}
                  placeholder="e.g. 5 years"
                />
              </div>
              <div>
                <label>Income Duration</label>
                <select
                  value={form.businessIncomeFrequency}
                  onChange={(e) => set("businessIncomeFrequency", e.target.value)}
                >
                  <option value="">Select</option>
                  {INCOME_FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Income amount</label>
                <input
                  type="number"
                  value={form.businessIncomeAmount}
                  onChange={(e) => set("businessIncomeAmount", e.target.value)}
                  placeholder="₦ amount"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <form onSubmit={handleSubmit} className="field mt-6 space-y-4">
          <div>
            <label>Profile picture (optional)</label>
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            <p className="mt-1 text-xs text-ink-600">You can skip this and add it later from your profile.</p>
          </div>
          <div>
            <label>Create a password</label>
            <input
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button type="button" className="btn-outline flex-1" onClick={goBack} disabled={submitting}>
              Back
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={submitting}>
              {submitting ? "Creating account..." : "Register"}
            </button>
          </div>
        </form>
      )}

      {step > 0 && step < 4 && (
        <>
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button type="button" className="btn-outline flex-1" onClick={goBack}>
              Back
            </button>
            <button type="button" className="btn-primary flex-1" onClick={goNext}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 0 && (
        <p className="mt-4 text-sm text-ink-600">
          Already have an account? <Link to="/login/member" className="text-canopy-800">Log in</Link>
        </p>
      )}
    </div>
  );
}
