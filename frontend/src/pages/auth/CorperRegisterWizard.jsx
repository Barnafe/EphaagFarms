import { cloneElement, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { apiUpload } from "../../api/client.js";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";
import PasswordInput from "../../components/PasswordInput.jsx";

// NYSC AGROALLIED SAED member registration — 3 short steps. Registration itself
// is free; the access fee is paid later from the dashboard, before any
// training opens (that gate arrives in a later phase). Everything else
// about the profile is completed afterwards from the Profile page.
// Label + control wired together with a generated id, so screen readers and
// tap targets associate the label with its field.
function Field({ label, children }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}

const STEP_LABELS = ["Account", "NYSC AGROALLIED SAED details", "Photo & consent"];

export default function CorperRegisterWizard() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const thisYear = new Date().getFullYear();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [form, setForm] = useState({
    name: "", sex: "", email: "", phone: "", password: "", confirm: "",
    callUpNumber: "", stateCode: "", serviceYear: String(thisYear), batch: "", stream: "",
    stateOfDeployment: "", lgaOfDeployment: "", ppa: "", discipline: "",
    consentTerms: false, consentData: false,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function validate(s) {
    if (s === 0) {
      if (!form.name.trim()) return "Enter your full name.";
      if (!form.sex) return "Select your gender.";
      if (!form.email.trim()) return "Enter your email — certificate notices are sent there.";
      if (!form.phone.trim()) return "Enter your phone number.";
      if (form.password.length < 8) return "Password must be at least 8 characters.";
      if (form.password !== form.confirm) return "Passwords do not match.";
    }
    if (s === 1) {
      const need = [
        ["callUpNumber", "call-up number"], ["stateCode", "state code"], ["batch", "batch"],
        ["stream", "stream"], ["stateOfDeployment", "state of deployment"], ["ppa", "place of primary assignment"],
        ["discipline", "discipline"],
      ];
      for (const [k, label] of need) if (!String(form[k]).trim()) return `Enter your ${label}.`;
    }
    return "";
  }

  function next() {
    const msg = validate(step);
    if (msg) return setError(msg);
    setError("");
    setStep((s) => s + 1);
  }

  async function submit(e) {
    e.preventDefault();
    const msg = validate(0) || validate(1) || (form.consentTerms ? "" : "You must accept the terms to register.") || (form.consentData ? "" : "You must consent to your details being shared with NYSC AGROALLIED SAED to register.");
    if (msg) return setError(msg);
    setError("");
    setSubmitting(true);
    try {
      const { confirm, ...payload } = form;
      await register({ ...payload, serviceYear: Number(form.serviceYear), role_type: "corper" });
      if (photo) {
        try {
          const fd = new FormData();
          fd.append("photo", photo);
          await apiUpload("/auth/me/photo", fd);
        } catch {
          // Optional — the account exists; the photo can be added from Profile.
        }
      }
      navigate("/dashboard/corper");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="field mt-4 space-y-4">
      <ol className="flex gap-2 text-xs">
        {STEP_LABELS.map((l, i) => (
          <li key={l} className={`flex-1 rounded-card px-2 py-1.5 text-center ${i === step ? "bg-canopy-600 text-white" : "bg-soil-100 text-ink-600"}`}>
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <Field label="Full name"><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="As on your call-up letter" /></Field>
          <Field label="Gender"><select value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">Select</option><option value="male">Male</option><option value="female">Female</option>
            </select></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone number"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="080..." /></Field>
          <Field label="Password"><PasswordInput value={form.password} onChange={(e) => set("password", e.target.value)} /></Field>
          <Field label="Confirm password"><PasswordInput value={form.confirm} onChange={(e) => set("confirm", e.target.value)} /></Field>
        </>
      )}

      {step === 1 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Call-up number"><input value={form.callUpNumber} onChange={(e) => set("callUpNumber", e.target.value)} /></Field>
            <Field label="State code"><input value={form.stateCode} onChange={(e) => set("stateCode", e.target.value)} placeholder="e.g. BN/26B/1234" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Service year"><select value={form.serviceYear} onChange={(e) => set("serviceYear", e.target.value)}>
                {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select></Field>
            <Field label="Batch"><select value={form.batch} onChange={(e) => set("batch", e.target.value)}>
                <option value="">Select</option><option>A</option><option>B</option><option>C</option>
              </select></Field>
            <Field label="Stream"><select value={form.stream} onChange={(e) => set("stream", e.target.value)}>
                <option value="">Select</option><option>I</option><option>II</option>
              </select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State of deployment"><select value={form.stateOfDeployment} onChange={(e) => { set("stateOfDeployment", e.target.value); set("lgaOfDeployment", ""); }}>
                <option value="">Select state</option>
                {NIGERIA_STATE_NAMES.map((s) => <option key={s}>{s}</option>)}
              </select></Field>
            <Field label="LGA (optional)"><select value={form.lgaOfDeployment} onChange={(e) => set("lgaOfDeployment", e.target.value)} disabled={!form.stateOfDeployment}>
                <option value="">Select LGA</option>
                {lgasForState(form.stateOfDeployment).map((l) => <option key={l}>{l}</option>)}
              </select></Field>
          </div>
          <Field label="Place of primary assignment (PPA)"><input value={form.ppa} onChange={(e) => set("ppa", e.target.value)} placeholder="Organisation name and address" /></Field>
          <Field label="Discipline (course of study)"><input value={form.discipline} onChange={(e) => set("discipline", e.target.value)} /></Field>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Passport photo (optional — add it now or later from your profile)"><input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></Field>
          <label className="flex items-start gap-2 text-sm text-ink-800">
            <input type="checkbox" className="mt-1 !w-auto" checked={form.consentTerms} onChange={(e) => set("consentTerms", e.target.checked)} />
            <span>I agree to the programme terms and conditions. <span className="text-ink-600">(required)</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-800">
            <input type="checkbox" className="mt-1 !w-auto" checked={form.consentData} onChange={(e) => set("consentData", e.target.checked)} />
            <span>I consent to my details being shared with NYSC AGROALLIED SAED for certification purposes. <span className="text-ink-600">(required)</span></span>
          </label>
        </>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        {step > 0 && <button type="button" className="btn-outline" onClick={() => { setError(""); setStep(step - 1); }}>Back</button>}
        {step < 2 ? (
          <button type="button" className="btn-primary flex-1" onClick={next}>Continue</button>
        ) : (
          <button type="submit" className="btn-primary flex-1" disabled={submitting}>{submitting ? "Creating account..." : "Create my account"}</button>
        )}
      </div>

      <p className="text-sm text-ink-600">
        Already registered? <Link to="/login/member" className="text-canopy-800">Log in</Link>
      </p>
    </form>
  );
}
