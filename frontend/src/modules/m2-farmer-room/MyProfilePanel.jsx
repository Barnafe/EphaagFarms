import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import ProfilePhotoUploader from "../../components/ProfilePhotoUploader.jsx";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";
import { wardsForLga } from "../../data/nigeriaWards.js";
import { NinVerifyBox, GpsPin } from "./IdentityParts.jsx";

const OPTIONS = {
  maritalStatus: [["single", "Single"], ["married", "Married"], ["divorced", "Divorced"], ["widowed", "Widowed"]],
  farmType: [["livestock", "Livestock"], ["crop_production", "Crop production"], ["livestock_and_crops", "Livestock & crop production"]],
  farmSize: [["0-1_hectares", "0 – 1 hectares"], ["2-4_hectares", "2 – 4 hectares"], ["5plus_hectares", "5 hectares and above"]],
  yearsExperience: [["1-5", "1 – 5 years"], ["6-10", "6 – 10 years"], ["11plus", "11 years and above"]],
  annualFarmIncome: [["50k-100k", "₦50,000 – ₦100,000"], ["100k-400k", "₦100,000 – ₦400,000"], ["500k-1m", "₦500,000 – ₦1,000,000"], ["1mplus", "₦1,000,000 and above"]],
  additionalIncomeType: [["work", "Work"], ["business", "Business"], ["both", "Both"]],
};
const CROPS = ["Poultry", "Fish / aquaculture", "Cattle", "Goat / sheep", "Maize", "Rice", "Sorghum", "Millet", "Cassava", "Yam", "Sweet potato", "Tomatoes", "Pepper", "Onions", "Leafy greens", "Groundnut", "Soybean", "Fruits (orchard)"];

function Select({ label, value, onChange, options, disabled }) {
  return (
    <div>
      <label>{label}</label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function Locked({ label, value }) {
  return (
    <div>
      <label>{label} <span className="ml-1 rounded-full bg-canopy-50 px-2 py-0.5 text-[10px] text-canopy-800">from NIMC</span></label>
      <input value={value || "—"} readOnly className="bg-soil-100" />
    </div>
  );
}

function IdentitySection({ user, onChanged }) {
  const [msg, setMsg] = useState("");
  if (user.ninVerified) {
    return (
      <div className="card space-y-3">
        <p className="text-sm font-medium text-ink-900">Identity <span className="ml-2 rounded-full bg-canopy-50 px-2 py-0.5 text-xs text-canopy-800">NIN verified (ending {user.profileStatus?.ninLast4})</span></p>
        <div className="field grid grid-cols-2 gap-3">
          <Locked label="Full name" value={user.name} />
          <Locked label="Gender" value={user.sex} />
          <Locked label="Date of birth" value={user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : ""} />
          <Locked label="Permanent address" value={user.permanentAddress} />
        </div>
        <p className="text-xs text-ink-600">These details come from NIMC and cannot be changed. Everything else on this page you can edit.</p>
      </div>
    );
  }
  return (
    <div className="card space-y-3">
      <p className="text-sm font-medium text-ink-900">Verify your identity</p>
      <p className="text-xs text-ink-600">Loans, savings withdrawals and farm shares unlock once your NIN is verified. We fetch your name, date of birth, gender and permanent address from NIMC. Your NIN is not stored.</p>
      <NinVerifyBox endpoint="/farmers/me/verify-nin" onVerified={async () => { setMsg("Your NIN is verified."); await onChanged(); }} />
      {msg && <p className="text-xs text-canopy-800" role="status">{msg}</p>}
    </div>
  );
}

function DetailsSection({ user, onChanged }) {
  const locked = !!user.ninVerified;
  const [f, setF] = useState(() => ({
    name: user.name || "", dateOfBirth: user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : "", permanentAddress: user.permanentAddress || "",
    maritalStatus: user.maritalStatus || "", farmType: user.farmType || "", farmSize: user.farmSize || "", yearsExperience: user.yearsExperience || "",
    keepsRecords: user.keepsInventoryRecords === true ? "yes" : user.keepsInventoryRecords === false ? "no" : "", annualFarmIncome: user.annualFarmIncome || "",
    additionalIncomeType: user.additionalIncomeType || "",
    workType: user.additionalIncome?.work?.workType || "", workOrgName: user.additionalIncome?.work?.organizationName || "", workRank: user.additionalIncome?.work?.rank || "", workMonthlyIncome: user.additionalIncome?.work?.monthlyIncome || "",
    businessType: user.additionalIncome?.business?.businessType || "", businessMaxDuration: user.additionalIncome?.business?.maxDuration || "", businessIncomeFrequency: user.additionalIncome?.business?.incomeFrequency || "", businessIncomeAmount: user.additionalIncome?.business?.incomeAmount || "",
  }));
  const [crops, setCrops] = useState(user.crops || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const missing = new Set(user.profileStatus?.missing || []);
  const flag = (k) => (missing.has(k) ? "ring-1 ring-harvest-500" : "");

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setMsg("");
    const body = { ...f, crops };
    if (locked) { delete body.name; delete body.dateOfBirth; delete body.permanentAddress; }
    Object.keys(body).forEach((k) => { if (body[k] === "") delete body[k]; });
    try { await apiFetch("/farmers/me", { method: "PUT", body }); setMsg("Saved."); await onChanged(); }
    catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="card field space-y-3">
      <p className="text-sm font-medium text-ink-900">Your details</p>
      {!locked && (
        <div className="grid grid-cols-2 gap-3">
          <div><label>Full name</label><input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className={flag("dateOfBirth")}><label>Date of birth</label><input type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></div>
          <div className="col-span-2"><label>Permanent address</label><input value={f.permanentAddress} onChange={(e) => set("permanentAddress", e.target.value)} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className={flag("maritalStatus")}><Select label="Marital status" value={f.maritalStatus} onChange={(v) => set("maritalStatus", v)} options={OPTIONS.maritalStatus} /></div>
        <div className={flag("farmType")}><Select label="Type of farming" value={f.farmType} onChange={(v) => set("farmType", v)} options={OPTIONS.farmType} /></div>
        <div className={flag("farmSize")}><Select label="Farm size" value={f.farmSize} onChange={(v) => set("farmSize", v)} options={OPTIONS.farmSize} /></div>
        <div className={flag("yearsExperience")}><Select label="Years of experience" value={f.yearsExperience} onChange={(v) => set("yearsExperience", v)} options={OPTIONS.yearsExperience} /></div>
        <div className={flag("keepsInventoryRecords")}><Select label="Do you keep inventory records?" value={f.keepsRecords} onChange={(v) => set("keepsRecords", v)} options={[["yes", "Yes"], ["no", "No"]]} /></div>
        <div className={flag("annualFarmIncome")}><Select label="Annual farm income" value={f.annualFarmIncome} onChange={(v) => set("annualFarmIncome", v)} options={OPTIONS.annualFarmIncome} /></div>
      </div>
      <div className={`rounded-card p-2 ${flag("crops")}`}>
        <p className="mb-1 text-xs text-ink-600">What you grow or keep</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {CROPS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-ink-900">
              <input type="checkbox" checked={crops.includes(c)} onChange={() => setCrops((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} />{c}
            </label>
          ))}
        </div>
      </div>
      <div className={flag("additionalIncomeType")}><Select label="Additional income" value={f.additionalIncomeType} onChange={(v) => set("additionalIncomeType", v)} options={OPTIONS.additionalIncomeType} /></div>
      {(f.additionalIncomeType === "work" || f.additionalIncomeType === "both") && (
        <div className="grid grid-cols-2 gap-3">
          <div><label>Type of work</label><input value={f.workType} onChange={(e) => set("workType", e.target.value)} /></div>
          <div><label>Organisation</label><input value={f.workOrgName} onChange={(e) => set("workOrgName", e.target.value)} /></div>
          <div><label>Your rank / position</label><input value={f.workRank} onChange={(e) => set("workRank", e.target.value)} /></div>
          <div><label>Monthly income (₦)</label><input value={f.workMonthlyIncome} onChange={(e) => set("workMonthlyIncome", e.target.value)} /></div>
        </div>
      )}
      {(f.additionalIncomeType === "business" || f.additionalIncomeType === "both") && (
        <div className="grid grid-cols-2 gap-3">
          <div><label>Type of business</label><input value={f.businessType} onChange={(e) => set("businessType", e.target.value)} /></div>
          <div><label>Years in business</label><input value={f.businessMaxDuration} onChange={(e) => set("businessMaxDuration", e.target.value)} /></div>
          <div><label>Income frequency</label><select value={f.businessIncomeFrequency} onChange={(e) => set("businessIncomeFrequency", e.target.value)}><option value="">Select</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
          <div><label>Income amount (₦)</label><input value={f.businessIncomeAmount} onChange={(e) => set("businessIncomeAmount", e.target.value)} /></div>
        </div>
      )}
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {msg && <p className="text-xs text-canopy-800" role="status">{msg}</p>}
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
    </form>
  );
}

function ResidenceSection({ user, onChanged }) {
  const [a, setA] = useState({ address: user.homeAddress || "", state: user.state || "", lga: user.lga || "", ward: user.ward || "", community: user.residentialCommunity || "", street: user.residentialStreet || "", lat: user.residentialLat ?? null, lng: user.residentialLng ?? null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const lgas = useMemo(() => lgasForState(a.state), [a.state]);
  const wards = useMemo(() => wardsForLga(a.state, a.lga), [a.state, a.lga]);
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await apiFetch("/farmers/me/residence", { method: "PUT", body: { address: a.address, state: a.state, lga: a.lga, ward: a.ward, community: a.community, street: a.street, ...(a.lat !== null ? { lat: a.lat, lng: a.lng } : {}) } });
      setResult(r); await onChanged();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="card field space-y-3">
      <p className="text-sm font-medium text-ink-900">Where you live now</p>
      <p className="text-xs text-ink-600">Your unit ({user.unit || "none yet"}) is set automatically from this address. If you move, change it here and your unit, and your pending loan request, move with you.</p>
      <div><label>Residential address</label><input value={a.address} onChange={(e) => set("address", e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label>State</label><select value={a.state} onChange={(e) => setA((x) => ({ ...x, state: e.target.value, lga: "", ward: "" }))}><option value="">Select state</option>{NIGERIA_STATE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label>Local Government</label><select value={a.lga} disabled={!a.state} onChange={(e) => setA((x) => ({ ...x, lga: e.target.value, ward: "" }))}><option value="">Select LGA</option>{lgas.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
        <div className="col-span-2"><label>Ward</label>{wards.length ? <select value={a.ward} disabled={!a.lga} onChange={(e) => set("ward", e.target.value)}><option value="">Select ward</option>{wards.map((w) => <option key={w} value={w}>{w}</option>)}</select> : <input value={a.ward} disabled={!a.lga} onChange={(e) => set("ward", e.target.value)} />}</div>
        <div><label>Community / village</label><input value={a.community} onChange={(e) => set("community", e.target.value)} /></div>
        <div><label>Street</label><input value={a.street} onChange={(e) => set("street", e.target.value)} /></div>
      </div>
      <GpsPin lat={a.lat} lng={a.lng} onChange={(la, ln) => setA((x) => ({ ...x, lat: la, lng: ln }))} />
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {result && (
        <p className={`rounded-card px-3 py-2 text-xs ${result.matched ? "bg-canopy-50 text-canopy-800" : "bg-harvest-50 text-harvest-700"}`} role="status">
          {result.message}{result.changed && result.pendingLoansMoved > 0 ? ` Your pending loan request is now with your new Unit Leader.` : ""}
        </p>
      )}
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save address"}</button>
    </form>
  );
}

export default function MyProfilePanel() {
  const { session, refreshSession } = useAuth();
  const user = session?.user;
  const [key, setKey] = useState(0);
  useEffect(() => { setKey((k) => k + 1); }, [user?.ninVerified]);
  if (!user) return null;
  const onChanged = async () => { await refreshSession(); };
  const s = user.profileStatus;
  return (
    <div className="space-y-4">
      <div className="card"><ProfilePhotoUploader /></div>
      {s?.restricted && (
        <div className="card border-harvest-200 bg-harvest-50 text-sm text-ink-900" role="alert">
          <p className="font-medium">Finish setting up to unlock loans, savings withdrawals and farm shares.</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {s.needsNin && <li>Verify your NIN (below).</li>}
            {s.needsProfile && <li>Fill in: {s.missingLabels.join(", ")}. These are highlighted.</li>}
          </ul>
        </div>
      )}
      <IdentitySection user={user} onChanged={onChanged} />
      <DetailsSection key={`d${key}`} user={user} onChanged={onChanged} />
      <ResidenceSection key={`r${key}`} user={user} onChanged={onChanged} />
    </div>
  );
}
