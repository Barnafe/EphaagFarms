// Farmer profile completeness, NIN verification state and the gate on sensitive features.
import { pool } from "../db/pool.js";
import { getSetting } from "../utils/settings.js";
import { registerTemplate, escapeHtml } from "./messageTemplates.js";

export const NIMC_LOCKED = ["name", "sex", "dateOfBirth", "permanentAddress"];
export const SENSITIVE_FEATURES = "applying for a loan, withdrawing savings, and buying or withdrawing farm shares";

const FIELD_LABELS = {
  maritalStatus: "marital status", dateOfBirth: "date of birth", residentialAddress: "residential address", unit: "unit",
  farmType: "type of farming", farmSize: "farm size", yearsExperience: "years of experience", keepsInventoryRecords: "whether you keep inventory records",
  annualFarmIncome: "annual farm income", additionalIncomeType: "additional income", crops: "what you farm",
};

export async function gateEnabled(runner = pool) {
  const stored = await getSetting("farmer_gate_enabled", null, runner);
  if (stored !== null && stored !== undefined) return stored === true || stored === "true";
  return process.env.FARMER_GATE_DEFAULT !== "off";
}

/** Everything the app needs to know about one farmer's identity and profile. */
export async function profileStatus(userId, runner = pool) {
  const { rows } = await runner.query(
    `SELECT u.nin_verified, u.nin_last4, u.state, u.lga, u.ward, u.unit,
            fp.marital_status, fp.date_of_birth, fp.home_address, fp.farm_type, fp.farm_size, fp.years_experience,
            fp.keeps_inventory_records, fp.annual_farm_income, fp.additional_income_type, fp.crops
       FROM users u LEFT JOIN farmer_profiles fp ON fp.user_id = u.id WHERE u.id = $1`, [userId]);
  const r = rows[0];
  if (!r) return null;
  const missing = [];
  const need = (key, ok) => { if (!ok) missing.push(key); };
  need("maritalStatus", !!r.marital_status); need("dateOfBirth", !!r.date_of_birth); need("residentialAddress", !!r.home_address);
  need("unit", !!(r.unit && r.state && r.lga && r.ward));
  need("farmType", !!r.farm_type); need("farmSize", !!r.farm_size); need("yearsExperience", !!r.years_experience);
  need("keepsInventoryRecords", r.keeps_inventory_records !== null && r.keeps_inventory_records !== undefined);
  need("annualFarmIncome", !!r.annual_farm_income); need("additionalIncomeType", !!r.additional_income_type);
  need("crops", Array.isArray(r.crops) && r.crops.length > 0);
  const gate = await gateEnabled(runner);
  const complete = missing.length === 0;
  const ninVerified = !!r.nin_verified;
  return {
    ninVerified, ninLast4: r.nin_last4 || null, complete, missing, missingLabels: missing.map((k) => FIELD_LABELS[k] || k),
    gateEnabled: gate, restricted: gate && (!complete || !ninVerified),
    needsNin: gate && !ninVerified, needsProfile: gate && !complete,
  };
}

/** Express middleware: sensitive farmer features need a verified NIN and a complete profile (when the gate is on). */
export function requireVerifiedFarmer(req, res, next) {
  if (req.user?.role_type !== "farmer") return next();
  profileStatus(req.user.id).then((s) => {
    if (!s || !s.restricted) return next();
    const parts = [];
    if (s.needsNin) parts.push("verify your NIN");
    if (s.needsProfile) parts.push(`complete your profile (${s.missingLabels.join(", ")})`);
    res.status(403).json({
      error: `Please ${parts.join(" and ")} to unlock ${SENSITIVE_FEATURES}. You can keep using everything else in the meantime.`,
      code: "PROFILE_RESTRICTED", needsNin: s.needsNin, needsProfile: s.needsProfile, missing: s.missing,
    });
  }).catch(next);
}

registerTemplate("unit_changed", (d) => ({
  subject: "Your EPHAAG unit has changed",
  title: "Your unit has changed",
  html: `<p>Hi ${escapeHtml(d.name)}, because you changed your residential address, you now belong to <strong>${escapeHtml(d.unit)}</strong> (${escapeHtml(d.ward)}, ${escapeHtml(d.lga)}, ${escapeHtml(d.state)}). Your new Unit Leader looks after your requests from now on${d.pendingLoans ? `, including your ${d.pendingLoans} pending loan application${d.pendingLoans === 1 ? "" : "s"}` : ""}.</p>`,
  sms: `EPHAAG: your unit is now ${d.unit} (${d.ward}). Your new Unit Leader looks after your requests${d.pendingLoans ? ` and pending loan` : ""}.`,
}), { name: "Aminu", unit: "Gombe Central", ward: "Ward A", lga: "Gombe", state: "Gombe", pendingLoans: 1 });

registerTemplate("unit_not_found", (d) => ({
  subject: "[Needs attention] A farmer's address matches no unit",
  title: "No unit found for a farmer",
  html: `<p>${escapeHtml(d.name)} gave a residential address that matches no official unit, so no unit could be set automatically. Add or pin a unit near them in the unit locations list and ask them to save the address again.</p>
<table role="presentation"><tr><td>Address</td><td><strong>${escapeHtml(d.address)}</strong></td></tr><tr><td>Area</td><td><strong>${escapeHtml(d.area)}</strong></td></tr></table>`,
}), { name: "Aminu", address: "12 Market Road", area: "Ward A, Gombe, Gombe" });
