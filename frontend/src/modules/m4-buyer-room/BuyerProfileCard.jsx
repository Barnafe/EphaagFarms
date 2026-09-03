import { useState } from "react";
import ProfilePhotoUploader from "../../components/ProfilePhotoUploader.jsx";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";

// Buyers previously had a read-only AccountProfileCard with no edit flow.
// 2026-09-01 spec: buyers get real edit tools, same shape as
// FarmerProfileCard — view mode + an "Edit profile" toggle into a form.
export default function BuyerProfileCard({ user, onSave }) {
  const isOrg = user.buyerType === "organization";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [state, setState] = useState(user.state || "");
  const [lga, setLga] = useState(user.lga || "");
  const [address, setAddress] = useState(user.address || "");
  const [registeredAddress, setRegisteredAddress] = useState(user.registeredAddress || "");
  const [contactPersonName, setContactPersonName] = useState(user.contactPersonName || "");

  function handleSave(e) {
    e.preventDefault();
    onSave({
      name,
      email,
      phone,
      state,
      lga,
      ...(isOrg
        ? { registeredAddress, contactPersonName }
        : { address }),
    });
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="card space-y-4">
        <ProfilePhotoUploader />
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">Account details</p>
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-canopy-800">
            Edit profile
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-ink-600">{isOrg ? "Organization name" : "Name"}</p>
            <p className="text-ink-900">{user.name || "—"}</p>
          </div>
          <div>
            <p className="text-ink-600">Email</p>
            <p className="text-ink-900">{user.email || "—"}</p>
          </div>
          <div>
            <p className="text-ink-600">Phone</p>
            <p className="text-ink-900">{user.phone || "—"}</p>
          </div>
          <div>
            <p className="text-ink-600">Buying as</p>
            <p className="text-ink-900">{isOrg ? "Organization" : "Individual"}</p>
          </div>
          <div>
            <p className="text-ink-600">State</p>
            <p className="text-ink-900">{user.state || "—"}</p>
          </div>
          <div>
            <p className="text-ink-600">LGA</p>
            <p className="text-ink-900">{user.lga || "—"}</p>
          </div>
          {isOrg ? (
            <>
              <div>
                <p className="text-ink-600">Contact person</p>
                <p className="text-ink-900">{user.contactPersonName || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-ink-600">Registered address</p>
                <p className="text-ink-900">{user.registeredAddress || "—"}</p>
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <p className="text-ink-600">Delivery address</p>
              <p className="text-ink-900">{user.address || "—"}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const lgaOptions = lgasForState(state);

  return (
    <form onSubmit={handleSave} className="card field space-y-3">
      <p className="text-sm text-ink-600">Edit profile</p>
      <div>
        <label>{isOrg ? "Organization name" : "Name"}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      {isOrg ? (
        <>
          <div>
            <label>Contact person name</label>
            <input value={contactPersonName} onChange={(e) => setContactPersonName(e.target.value)} />
          </div>
          <div>
            <label>Registered address</label>
            <input value={registeredAddress} onChange={(e) => setRegisteredAddress(e.target.value)} />
          </div>
        </>
      ) : (
        <div>
          <label>Delivery address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      )}

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
