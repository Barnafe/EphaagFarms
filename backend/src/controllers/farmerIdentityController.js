import { pool } from "../db/pool.js";
import { notifyUser } from "../services/messaging.js";
import { notifyAttention } from "../jobs/alerts.js";
import { detached } from "../db/pool.js";
import { lookupNin, signIdentityToken, isValidNin, ninHash, ninLast4 } from "../services/nin.js";
import { matchUnit } from "../services/unitMatching.js";
import { profileStatus, gateEnabled, NIMC_LOCKED } from "../services/farmerIdentity.js";
import { getSetting, setSetting } from "../utils/settings.js";

const bad = (res, error, extra = {}) => res.status(400).json({ error, ...extra });

// POST /api/auth/verify-nin { nin, consent }  — before registration; nothing is saved yet.
export async function verifyNinPublic(req, res) {
  const { nin, consent } = req.body || {};
  if (!isValidNin(nin)) return bad(res, "Enter your 11-digit NIN.", { code: "NIN_INVALID" });
  if (consent !== true) return bad(res, "Please agree that EPHAAG may check your NIN with NIMC.", { code: "CONSENT_REQUIRED" });
  const { rows: dup } = await pool.query("SELECT 1 FROM users WHERE nin_hash = $1", [ninHash(nin)]);
  if (dup[0]) return res.status(409).json({ error: "An account already exists for this NIN. Please log in instead.", code: "NIN_ALREADY_REGISTERED" });
  try {
    const identity = await lookupNin(nin);
    res.json({ verified: true, identity, ninLast4: ninLast4(nin), token: signIdentityToken(nin, identity) });
  } catch (err) {
    if (err.code) return res.status(err.status || 400).json({ error: err.message, code: err.code });
    throw err;
  }
}

// POST /api/farmers/me/verify-nin { nin, consent } — an existing farmer verifies later. NIMC data then replaces and locks the matching fields.
export async function verifyMyNin(req, res) {
  const { nin, consent } = req.body || {};
  const { rows: me } = await pool.query("SELECT nin_verified FROM users WHERE id = $1", [req.user.id]);
  if (me[0]?.nin_verified) return res.status(409).json({ error: "Your NIN is already verified.", code: "ALREADY_VERIFIED" });
  if (!isValidNin(nin)) return bad(res, "Enter your 11-digit NIN.", { code: "NIN_INVALID" });
  if (consent !== true) return bad(res, "Please agree that EPHAAG may check your NIN with NIMC.", { code: "CONSENT_REQUIRED" });
  const hash = ninHash(nin);
  const { rows: dup } = await pool.query("SELECT id FROM users WHERE nin_hash = $1 AND id <> $2", [hash, req.user.id]);
  if (dup[0]) return res.status(409).json({ error: "That NIN is already registered to another account.", code: "NIN_ALREADY_REGISTERED" });
  let identity;
  try { identity = await lookupNin(nin); } catch (err) {
    if (err.code) return res.status(err.status || 400).json({ error: err.message, code: err.code });
    throw err;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE users SET name = $2, sex = COALESCE($3, sex), nin_verified = TRUE, nin_verified_at = now(), nin_hash = $4, nin_last4 = $5 WHERE id = $1`,
      [req.user.id, identity.fullName, identity.gender, hash, ninLast4(nin)]);
    await client.query(`UPDATE farmer_profiles SET date_of_birth = $2, permanent_address = $3 WHERE user_id = $1`, [req.user.id, identity.dateOfBirth, identity.permanentAddress]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") return res.status(409).json({ error: "That NIN is already registered to another account.", code: "NIN_ALREADY_REGISTERED" });
    throw err;
  } finally {
    client.release();
  }
  res.json({ verified: true, identity, status: await profileStatus(req.user.id) });
}

export async function myProfileStatus(req, res) {
  res.json({ status: await profileStatus(req.user.id) });
}

const ENUMS = {
  maritalStatus: ["single", "married", "divorced", "widowed"],
  farmType: ["livestock", "crop_production", "livestock_and_crops"],
  farmSize: ["0-1_hectares", "2-4_hectares", "5plus_hectares"],
  yearsExperience: ["1-5", "6-10", "11plus"],
  annualFarmIncome: ["50k-100k", "100k-400k", "500k-1m", "1mplus"],
  additionalIncomeType: ["work", "business", "both"],
};

// PUT /api/farmers/me — everything NIMC did not provide can be edited. Location is NOT edited here (see residence).
export async function updateMyProfile(req, res) {
  const b = req.body || {};
  if (["state", "lga", "ward", "unit"].some((k) => b[k] !== undefined && b[k] !== null && b[k] !== "")) {
    return bad(res, "Your unit is set automatically from your residential address. Update your residential address instead.", { code: "UNIT_IS_AUTOMATIC" });
  }
  const { rows: u } = await pool.query("SELECT nin_verified FROM users WHERE id = $1", [req.user.id]);
  const locked = !!u[0]?.nin_verified;
  const touchedLocked = NIMC_LOCKED.filter((k) => b[k] !== undefined);
  if (locked && touchedLocked.length) {
    return bad(res, `These details come from NIMC and cannot be changed: ${touchedLocked.join(", ")}.`, { code: "NIMC_LOCKED", fields: touchedLocked });
  }
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== "" && !allowed.includes(b[k])) return bad(res, `${k} is not a valid choice.`);
  }
  if (b.dateOfBirth !== undefined && b.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth)) return bad(res, "dateOfBirth must be YYYY-MM-DD.");
  if (b.sex !== undefined && b.sex !== null && !["male", "female"].includes(b.sex)) return bad(res, "sex must be male or female.");

  const crops = b.crops === undefined ? undefined : Array.isArray(b.crops) ? b.crops : String(b.crops).split(",").map((c) => c.trim()).filter(Boolean);
  let additionalIncome;
  if (b.additionalIncomeType !== undefined) {
    additionalIncome = {};
    if (b.additionalIncomeType === "work" || b.additionalIncomeType === "both") additionalIncome.work = { workType: b.workType || null, organizationName: b.workOrgName || null, rank: b.workRank || null, monthlyIncome: b.workMonthlyIncome || null };
    if (b.additionalIncomeType === "business" || b.additionalIncomeType === "both") additionalIncome.business = { businessType: b.businessType || null, maxDuration: b.businessMaxDuration || null, incomeFrequency: b.businessIncomeFrequency || null, incomeAmount: b.businessIncomeAmount || null };
  }
  const sets = [], vals = [];
  const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (crops !== undefined) put("crops", crops);
  if (b.maritalStatus !== undefined) put("marital_status", b.maritalStatus || null);
  if (b.dateOfBirth !== undefined) put("date_of_birth", b.dateOfBirth || null);
  if (b.permanentAddress !== undefined) put("permanent_address", String(b.permanentAddress || "").trim() || null);
  if (b.nationality !== undefined) put("nationality", b.nationality || null);
  if (b.farmType !== undefined) put("farm_type", b.farmType || null);
  if (b.farmSize !== undefined) put("farm_size", b.farmSize || null);
  if (b.yearsExperience !== undefined) put("years_experience", b.yearsExperience || null);
  if (b.keepsRecords !== undefined) put("keeps_inventory_records", b.keepsRecords === "yes" || b.keepsRecords === true ? true : b.keepsRecords === "no" || b.keepsRecords === false ? false : null);
  if (b.annualFarmIncome !== undefined) put("annual_farm_income", b.annualFarmIncome || null);
  if (b.additionalIncomeType !== undefined) { put("additional_income_type", b.additionalIncomeType || null); put("additional_income", additionalIncome && Object.keys(additionalIncome).length ? JSON.stringify(additionalIncome) : null); }
  if (sets.length) {
    vals.push(req.user.id);
    await pool.query(`UPDATE farmer_profiles SET ${sets.join(", ")} WHERE user_id = $${vals.length}`, vals);
  }
  if (!locked && (b.name !== undefined || b.sex !== undefined)) {
    if (b.name !== undefined && String(b.name).trim().length < 2) return bad(res, "Please enter your full name.");
    await pool.query(`UPDATE users SET name = COALESCE($2, name), sex = COALESCE($3, sex) WHERE id = $1`, [req.user.id, b.name ? String(b.name).trim() : null, b.sex || null]);
  }
  res.json({ status: await profileStatus(req.user.id) });
}

const inRange = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;

// PUT /api/farmers/me/residence — the residential address can change at any time; the unit follows it automatically.
export async function changeResidence(req, res) {
  const b = req.body || {};
  const address = String(b.address || "").trim();
  const state = String(b.state || "").trim(), lga = String(b.lga || "").trim(), ward = String(b.ward || "").trim();
  if (address.length < 5) return bad(res, "Please enter your residential address.");
  if (!state || !lga || !ward) return bad(res, "Please choose your state, LGA and ward.");
  const lat = b.lat === undefined || b.lat === null || b.lat === "" ? null : Number(b.lat);
  const lng = b.lng === undefined || b.lng === null || b.lng === "" ? null : Number(b.lng);
  if ((lat === null) !== (lng === null)) return bad(res, "Send both the latitude and the longitude of your pin, or neither.");
  if (lat !== null && (!inRange(lat, 3.5, 14.5) || !inRange(lng, 2.4, 15.2))) return bad(res, "That location is outside Nigeria.");
  const community = String(b.community || "").trim() || null, street = String(b.street || "").trim() || null;

  const client = await pool.connect();
  let out;
  try {
    await client.query("BEGIN");
    const { rows: cur } = await client.query(`SELECT u.name, u.state, u.lga, u.ward, u.unit FROM users u WHERE u.id = $1 FOR UPDATE`, [req.user.id]);
    const before = cur[0];
    await client.query(
      `UPDATE farmer_profiles SET home_address = $2, residential_community = $3, residential_street = $4, residential_lat = $5, residential_lng = $6 WHERE user_id = $1`,
      [req.user.id, address, community, street, lat, lng]);
    const m = await matchUnit(client, { state, lga, ward, community, street, lat, lng });
    let changed = false, movedLoans = 0;
    if (m.unit) {
      changed = !(before.unit === m.unit.name && before.state === m.unit.state && before.lga === m.unit.lga && before.ward === m.unit.ward);
      if (changed) {
        const { rows: pl } = await client.query(`SELECT count(*)::int AS n FROM loans WHERE farmer_id = $1 AND status = 'pending'`, [req.user.id]);
        movedLoans = pl[0].n;
        await client.query(`UPDATE users SET state = $2, lga = $3, ward = $4, unit = $5 WHERE id = $1`, [req.user.id, m.unit.state, m.unit.lga, m.unit.ward, m.unit.name]);
        await client.query(
          `INSERT INTO farmer_unit_changes (user_id, from_state, from_lga, from_ward, from_unit, to_state, to_lga, to_ward, to_unit, method, distance_km, pending_loans_moved)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [req.user.id, before.state, before.lga, before.ward, before.unit, m.unit.state, m.unit.lga, m.unit.ward, m.unit.name, m.method, m.distanceKm, movedLoans]);
      }
    }
    await client.query(`UPDATE farmer_profiles SET unit_match_method = $2, unit_matched_at = now() WHERE user_id = $1`, [req.user.id, m.unit ? m.method : "none"]);
    await client.query("COMMIT");
    out = { before, match: m, changed, movedLoans };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const { match, changed, movedLoans, before } = out;
  if (changed) detached(() => notifyUser(req.user.id, "unit_changed", { name: before.name, unit: match.unit.name, ward: match.unit.ward, lga: match.unit.lga, state: match.unit.state, pendingLoans: movedLoans }).catch(() => {}));
  if (!match.unit) detached(() => notifyAttention("unit_not_found", { name: before.name, address, area: `${ward}, ${lga}, ${state}` }, null));
  res.json({
    matched: !!match.unit, changed, method: match.unit ? match.method : "none", distanceKm: match.distanceKm,
    unit: match.unit ? { name: match.unit.name, state: match.unit.state, lga: match.unit.lga, ward: match.unit.ward } : null,
    pendingLoansMoved: movedLoans, status: await profileStatus(req.user.id),
    message: match.unit ? (changed ? `You now belong to ${match.unit.name}.` : `You stay in ${match.unit.name}.`)
      : "We could not find a unit near that address yet. Your current unit stays, and the administrators have been told.",
  });
}

// --- admin: gate switch, match distance, numbers --------------------------------------------------
export async function adminIdentitySettings(req, res) {
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE NOT u.nin_verified)::int AS unverified, count(*)::int AS farmers FROM users u WHERE u.role_type = 'farmer'`);
  res.json({ gateEnabled: await gateEnabled(), unitMatchMaxKm: Number(await getSetting("unit_match_max_km", 15)), farmers: rows[0].farmers, unverified: rows[0].unverified });
}
export async function adminSetIdentitySettings(req, res) {
  const { gateEnabled: g, unitMatchMaxKm } = req.body || {};
  if (g !== undefined) { if (typeof g !== "boolean") return bad(res, "gateEnabled must be true or false."); await setSetting("farmer_gate_enabled", g, req.user.id); }
  if (unitMatchMaxKm !== undefined) {
    const n = Number(unitMatchMaxKm);
    if (!Number.isFinite(n) || n < 1 || n > 100) return bad(res, "unitMatchMaxKm must be between 1 and 100.");
    await setSetting("unit_match_max_km", n, req.user.id);
  }
  return adminIdentitySettings(req, res);
}
