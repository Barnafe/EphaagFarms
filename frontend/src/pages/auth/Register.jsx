import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { apiUpload } from "../../api/client.js";
import PasswordInput from "../../components/PasswordInput.jsx";
import { NIGERIA_STATE_NAMES, lgasForState } from "../../data/nigeriaStatesLgas.js";
import FarmerRegisterWizard from "./FarmerRegisterWizard.jsx";

// Transporter and Distributor are deliberately NOT self-service roles —
// the Transport Department now owns dispatch and driver/distributor
// assignment internally. Admin IS self-service, gated by a setup code
// (see the admin-only field below) rather than requiring a seed script —
// simpler for the team while still not being a wide-open hole.
const roleOptions = [
  { value: "farmer", label: "Farmer" },
  { value: "buyer", label: "Buyer" },
  { value: "processor", label: "Processor" },
  { value: "investor", label: "Investor" },
  { value: "admin", label: "Admin (internal team only)" },
];

// Farmer registration is now its own dedicated wizard (FarmerRegisterWizard,
// see below) with its own location/ward/crop fields — this shared form and
// LocationFields no longer need to handle the farmer case at all.

function LocationFields({ state, setState, lga, setLga }) {
  const lgaOptions = lgasForState(state);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label>State</label>
        <select
          name="state"
          required
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setLga("");
          }}
        >
          <option value="">Select state</option>
          {NIGERIA_STATE_NAMES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>LGA</label>
        <select name="lga" required value={lga} disabled={!state} onChange={(e) => setLga(e.target.value)}>
          <option value="">{state ? "Select LGA" : "Select a state first"}</option>
          {lgaOptions.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("farmer");
  const [buyerType, setBuyerType] = useState("individual");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSetupCode, setShowSetupCode] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const raw = Object.fromEntries(new FormData(e.target));
      const { businessDoc, photo, ...fields } = raw;

      if (role === "buyer") {
        fields.buyerType = buyerType;
      }

      const user = await register({ ...fields, role_type: role });

      // Photo is optional and never blocks account creation — if it
      // fails to upload for any reason, the account still exists and the
      // person can add a photo later from their profile.
      const photoFile = e.target.elements.photo?.files?.[0];
      if (photoFile) {
        try {
          const photoForm = new FormData();
          photoForm.append("photo", photoFile);
          await apiUpload("/auth/me/photo", photoForm);
        } catch {
          // Non-fatal — account creation already succeeded.
        }
      }

      navigate(role === "admin" ? "/admin" : `/dashboard/${role}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-xl font-medium text-ink-900">Create your account</h1>
      <p className="mt-1 text-sm text-ink-600">
        Choose the account type that fits you. Each type has its own form.
      </p>

      <div className="field mt-6">
        <label>Account type</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {role === "farmer" && <FarmerRegisterWizard />}

      {role === "buyer" && (
        <div className="field mt-4">
          <label>Buying as</label>
          <select value={buyerType} onChange={(e) => setBuyerType(e.target.value)}>
            <option value="individual">Individual</option>
            <option value="organization">Organization</option>
          </select>
          <p className="mt-1 text-xs text-ink-600">
            Organization covers companies, NGOs, and government bodies alike.
          </p>
        </div>
      )}

      {role !== "farmer" && (
      <form onSubmit={handleSubmit} className="field mt-4 space-y-4">
        {role === "buyer" && buyerType === "organization" ? (
          <>
            <div>
              <label>Organization name</label>
              <input name="name" type="text" required placeholder="Organization name" />
            </div>
            <div>
              <label>Contact person name</label>
              <input name="contactPersonName" type="text" required placeholder="Who we should reach out to" />
            </div>
          </>
        ) : (
          <div>
            <label>Full name</label>
            <input name="name" type="text" required placeholder="Full name" />
          </div>
        )}
        <div>
          <label>Email</label>
          <input name="email" type="email" required placeholder="you@example.com" />
        </div>
        <div>
          <label>Phone</label>
          <input name="phone" type="tel" required placeholder="080..." />
        </div>
        {!(role === "buyer" && buyerType === "organization") && (
          <div>
            <label>Gender</label>
            <select name="sex" required defaultValue="">
              <option value="" disabled>
                Select gender
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        )}
        <div>
          <label>Password</label>
          <PasswordInput name="password" required minLength={8} placeholder="At least 8 characters" />
        </div>
        <div>
          <label>{role === "buyer" && buyerType === "organization" ? "Organization logo (optional)" : "Passport photo (optional)"}</label>
          <input name="photo" type="file" accept="image/*" />
          <p className="mt-1 text-xs text-ink-600">
            You can skip this and add it later from your profile instead.
          </p>
        </div>

        {role === "admin" ? (
          <div>
            <label>Admin setup code</label>
            <div className="flex gap-2">
              <input
                name="setupCode"
                type={showSetupCode ? "text" : "password"}
                required
                placeholder="Provided by the team"
                autoComplete="off"
                className="flex-1"
              />
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowSetupCode((v) => !v)}
              >
                {showSetupCode ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-600">
              Ask whoever manages the platform for this code — it's not public. Use Show to check
              exactly what you typed if it keeps failing (autofill sometimes fills in the wrong
              thing here).
            </p>
          </div>
        ) : (
          <LocationFields state={state} setState={setState} lga={lga} setLga={setLga} />
        )}

        {role === "buyer" && buyerType === "organization" && (
          <div>
            <label>Registered address</label>
            <input name="registeredAddress" type="text" required placeholder="Organization's registered address" />
          </div>
        )}

        {role === "buyer" && buyerType === "individual" && (
          <div>
            <label>Delivery address</label>
            <input
              name="address"
              type="text"
              required
              placeholder="Street, city — where your orders should be delivered"
            />
            <p className="mt-1 text-xs text-ink-600">
              You can add exact directions or a landmark per order later — this is your default.
            </p>
          </div>
        )}

        {role === "processor" && (
          <div>
            <label>Business registration document</label>
            <input name="businessDoc" type="file" />
          </div>
        )}

        {role === "investor" && (
          <>
            <div>
              <label>Occupation</label>
              <input name="occupation" type="text" placeholder="Occupation" />
            </div>
            <div>
              <label>Referred by (optional)</label>
              <input name="referredBy" type="text" placeholder="Referral code, if you have one" />
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
      )}

      {role !== "farmer" && (
        <p className="mt-4 text-sm text-ink-600">
          Already have an account? <Link to="/login/member" className="text-canopy-800">Log in</Link>
        </p>
      )}
    </div>
  );
}
