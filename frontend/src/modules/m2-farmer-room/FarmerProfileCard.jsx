import { useState } from "react";
import ProfilePhotoUploader from "../../components/ProfilePhotoUploader.jsx";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";

export default function FarmerProfileCard({ profile, onSave }) {
  const [editing, setEditing] = useState(false);
  const [cropsText, setCropsText] = useState(profile.crops.join(", "));
  const [state, setState] = useState(profile.state || "");
  const [lga, setLga] = useState(profile.lga || "");
  const [ward, setWard] = useState(profile.ward || "");
  const [unit, setUnit] = useState(profile.unit || "");

  function handleSave(e) {
    e.preventDefault();
    onSave({
      ...profile,
      crops: cropsText.split(",").map((c) => c.trim()).filter(Boolean),
      state,
      lga,
      ward,
      unit,
    });
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="card space-y-4">
        <ProfilePhotoUploader />
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">What you grow</p>
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-canopy-800">
            Edit profile
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.crops.map((c) => (
            <span key={c} className="rounded-full bg-canopy-50 px-3 py-1 text-sm text-canopy-800">
              {c}
            </span>
          ))}
        </div>
        <p className="text-xs text-ink-600">
          {profile.state} · {profile.lga} · {profile.ward} · {profile.unit}
        </p>
        <p className="text-xs text-ink-600">
          The system sources orders based on this profile — there's no separate stock list
          to maintain. Keep it updated if what you grow or where you farm changes.
        </p>
      </div>
    );
  }

  const lgaOptions = lgasForState(state);

  return (
    <form onSubmit={handleSave} className="card field space-y-3">
      <p className="text-sm text-ink-600">Edit profile</p>
      <div>
        <label>Crops you grow (comma-separated)</label>
        <input value={cropsText} onChange={(e) => setCropsText(e.target.value)} placeholder="e.g. Maize, Cassava" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label>State</label>
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setLga("");
            }}
          >
            <option value="">Select state</option>
            {NIGERIA_STATE_NAMES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label>LGA</label>
          <select value={lga} disabled={!state} onChange={(e) => setLga(e.target.value)}>
            <option value="">{state ? "Select LGA" : "Select a state first"}</option>
            {lgaOptions.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Ward</label>
          <input value={ward} onChange={(e) => setWard(e.target.value)} />
        </div>
        <div>
          <label>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" type="submit">
          Save
        </button>
        <button className="btn-outline" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
