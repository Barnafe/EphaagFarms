import { coerceSection } from "../utils/corperProfile.js";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { readIdentityToken } from "../services/nin.js";
import { matchUnit } from "../services/unitMatching.js";
import { notifyAttention } from "../jobs/alerts.js";
import { pool } from "../db/pool.js";
import { generateReference } from "../utils/reference.js";
import { attachProfile } from "../utils/profileLoader.js";
import { sendMail } from "../utils/email.js";
import { renderTemplate } from "../services/messageTemplates.js";
import { notifyUser } from "../services/messaging.js";
import { logSecurityEvent } from "../utils/securityLog.js";

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// Compared against when the account does not exist, so a wrong password and an
// unknown account take the same time and say the same thing.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const RESET_TTL_MINUTES = 30;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role_type: user.role_type, name: user.name, tv: user.token_version ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------
// Registration — free and immediate (no verification gate). Many farmers
// don't have reliable personal email/phone access — sometimes a unit
// leader creates an account on someone else's device — so account
// creation must never depend on receiving a code. The account is usable
// the moment it's created; a token is issued right away.
//
// Admin is NOT a registrable role. The main admin is created with the
// seed script, and the main admin promotes existing accounts to admin from
// Admin -> Positions (see adminPositionsController).
// ---------------------------------------------------------------------
export async function register(req, res) {
  const { name, email, phone, password, role_type, sex, state, lga, ward, unit, referralCode, ...extra } = req.body;

  if (!name || !password || !role_type) {
    return res.status(400).json({ error: "name, password, and role_type are required" });
  }

  if (role_type === "admin") {
    return res.status(400).json({ error: "Admin accounts can't be created from registration. The main admin promotes an existing account from Admin → Positions." });
  }

  // The separate Processor profile was retired: processing is done by the
  // single "Buyers/Processor" profile (role_type "buyer"). Existing processor
  // accounts were converted by the migration; nobody can create a new one.
  if (role_type === "processor") {
    return res.status(400).json({ error: "There is no separate Processor account. Register as Buyers/Processor instead." });
  }

  // Email is deliberately NOT required — a lot of farmers in villages
  // don't have reliable personal email access, and registration must
  // never depend on having one. But the account needs SOME way to log
  // back in, so at least one of email/phone has to be present.
  if (!email && !phone) {
    return res.status(400).json({ error: "Provide at least an email or a phone number" });
  }

  // Gender isn't meaningful for an organization account — the "name"
  // there is the org's registered contact, not an individual.
  const isOrganizationBuyer = role_type === "buyer" && extra.buyerType === "organization";
  if (!isOrganizationBuyer && (!sex || !["male", "female"].includes(sex))) {
    return res.status(400).json({ error: "gender is required" });
  }

  // 2026-09-01 spec: individual buyers must give a delivery address at
  // registration — delivery location matters too much to leave for later.
  // Organization buyers use registeredAddress instead and are NOT asked
  // for a CAC/registration document at registration anymore (dropped
  // per the same spec — company_doc_url stays in the schema unused).
  if (role_type === "buyer" && !isOrganizationBuyer && !extra.address) {
    return res.status(400).json({ error: "Delivery address is required" });
  }

  if (!email && phone) {
    const { rows: phoneClash } = await pool.query(
      "SELECT id FROM users WHERE phone = $1 AND email IS NULL",
      [phone]
    );
    if (phoneClash[0]) {
      return res.status(409).json({ error: "An account with that phone number already exists" });
    }
  }

  // NYSC AGROALLIED SAED members: email is mandatory (certificate-ready emails go
  // there), and the NYSC AGROALLIED SAED identity fields + terms acceptance must be valid
  // up front. Validated BEFORE any insert so a bad form never half-creates
  // an account.
  let corperCols = null;
  if (role_type === "corper") {
    if (!email) return res.status(400).json({ error: "Email is required for NYSC AGROALLIED SAED members" });
    if (!phone) return res.status(400).json({ error: "Phone number is required for NYSC AGROALLIED SAED members" });
    const nysc = coerceSection("nysc", extra, {
      requireKeys: ["callUpNumber", "stateCode", "serviceYear", "batch", "stream", "stateOfDeployment", "ppa", "discipline"],
    });
    if (nysc.error) return res.status(400).json({ error: nysc.error });
    const consent = coerceSection("documents", extra, { requireKeys: ["consentTerms", "consentData"] });
    if (consent.error) return res.status(400).json({ error: consent.error });
    corperCols = { ...nysc.cols, ...consent.cols, consent_terms_at: new Date().toISOString() };
    const { rows: codeClash } = await pool.query(
      "SELECT 1 FROM corper_profiles WHERE UPPER(state_code) = $1",
      [corperCols.state_code]
    );
    if (codeClash[0]) {
      return res.status(409).json({ error: "That state code is already registered" });
    }
  }

  // Farmers: a verified NIN (signed proof from /auth/verify-nin) supplies name, gender, date of birth and
  // permanent address from NIMC. Those values override anything typed in the form.
  let nimc = null;
  if (role_type === "farmer" && extra.ninToken) {
    nimc = readIdentityToken(extra.ninToken);
    if (!nimc) return res.status(400).json({ error: "Your NIN verification has expired. Please verify again, or continue without it.", code: "NIN_TOKEN_INVALID" });
    const { rows: dupNin } = await pool.query("SELECT 1 FROM users WHERE nin_hash = $1", [nimc.hash]);
    if (dupNin[0]) return res.status(409).json({ error: "An account already exists for this NIN. Please log in instead.", code: "NIN_ALREADY_REGISTERED" });
  }

  // Hash BEFORE taking a database connection: hashing is slow, and holding a
  // connection (inside a transaction) while waiting on it starves the pool.
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  let released = false;
  const releaseClient = () => { if (!released) { released = true; client.release(); } };
  try {
    await client.query("BEGIN");

    // Farmers' unit is found from their residential address, never typed (a typed unit is only a fallback
    // for older clients that send no address details).
    let place = { state, lga, ward, unit: unit || null, method: unit ? "typed" : "none" };
    if (role_type === "farmer") {
      const lat = extra.lat === undefined || extra.lat === null || extra.lat === "" ? NaN : Number(extra.lat);
      const lng = extra.lng === undefined || extra.lng === null || extra.lng === "" ? NaN : Number(extra.lng);
      if (extra.community || extra.street || Number.isFinite(lat)) {
        const m = await matchUnit(client, { state, lga, ward, community: extra.community, street: extra.street, lat, lng });
        if (m.unit) place = { state: m.unit.state, lga: m.unit.lga, ward: m.unit.ward, unit: m.unit.name, method: m.method };
        else place = { state, lga, ward, unit: null, method: "none" };
      }
    }
    const ident = nimc?.identity;
    const { rows } = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role_type, sex, state, lga, ward, unit, email_verified, nin_verified, nin_verified_at, nin_hash, nin_last4)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14)
       RETURNING id, name, email, role_type, sex, state, lga, ward, unit`,
      [ident?.fullName || name, email || null, phone || null, password_hash, role_type, ident?.gender || sex || null, place.state, place.lga, place.ward, place.unit,
        !!nimc, nimc ? new Date().toISOString() : null, nimc?.hash || null, nimc?.last4 || null]
    );
    const user = rows[0];
    user._place = place;

    // Universal referral code — deterministic from the new row's own id,
    // so it's guaranteed unique with no retry loop needed. Referral entry
    // is optional (2026-09-06 spec: "referral is optional not mandatory"),
    // so an invalid/unrecognized code is silently ignored rather than
    // failing registration.
    const ownReferralCode = "EPH" + user.id.replace(/-/g, "").slice(0, 6).toUpperCase();
    let referredByCode = null;
    if (referralCode && String(referralCode).trim()) {
      const codeTrimmed = String(referralCode).trim().toUpperCase();
      const { rows: referrerRows } = await client.query(
        `SELECT id FROM users WHERE referral_code = $1`,
        [codeTrimmed]
      );
      const referrer = referrerRows[0];
      if (referrer && referrer.id !== user.id) {
        referredByCode = codeTrimmed;
        await client.query(
          `INSERT INTO member_referrals (referrer_id, referred_id) VALUES ($1, $2)`,
          [referrer.id, user.id]
        );
      }
    }
    await client.query(
      `UPDATE users SET referral_code = $1, referred_by_code = $2 WHERE id = $3`,
      [ownReferralCode, referredByCode, user.id]
    );
    // Snake_case to match every other base `users` column returned as-is
    // from Postgres (photo_url, state, lga, etc.) — the frontend already
    // reads those defensively (camelCase || snake_case), see
    // ProfilePhotoUploader.jsx.
    user.referral_code = ownReferralCode;
    user.referred_by_code = referredByCode;

    if (role_type === "farmer") {
      const crops = Array.isArray(extra.crops)
        ? extra.crops
        : extra.crops
        ? String(extra.crops).split(",").map((c) => c.trim()).filter(Boolean)
        : [];

      // Section C (additional income) sub-fields vary by type — kept as
      // one JSONB blob rather than a wide sparse set of columns.
      let additionalIncome = null;
      if (extra.additionalIncomeType === "work" || extra.additionalIncomeType === "both") {
        additionalIncome = {
          ...additionalIncome,
          work: {
            workType: extra.workType || null,
            organizationName: extra.workOrgName || null,
            rank: extra.workRank || null,
            monthlyIncome: extra.workMonthlyIncome || null,
          },
        };
      }
      if (extra.additionalIncomeType === "business" || extra.additionalIncomeType === "both") {
        additionalIncome = {
          ...additionalIncome,
          business: {
            businessType: extra.businessType || null,
            maxDuration: extra.businessMaxDuration || null,
            incomeFrequency: extra.businessIncomeFrequency || null,
            incomeAmount: extra.businessIncomeAmount || null,
          },
        };
      }

      await client.query(
        `INSERT INTO farmer_profiles
           (user_id, crops, marital_status, date_of_birth, id_type, id_number, home_address, nationality,
            farm_type, farm_size, years_experience, keeps_inventory_records, annual_farm_income,
            additional_income_type, additional_income,
            permanent_address, residential_community, residential_street, residential_lat, residential_lng, unit_match_method, unit_matched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())`,
        [
          user.id,
          crops,
          extra.maritalStatus || null,
          ident?.dateOfBirth || extra.dateOfBirth || null,
          extra.idType || null,
          extra.idNumber || null,
          extra.homeAddress || null,
          extra.nationality || "Nigerian",
          extra.farmType || null,
          extra.farmSize || null,
          extra.yearsExperience || null,
          extra.keepsRecords === undefined ? null : extra.keepsRecords === "yes",
          extra.annualFarmIncome || null,
          extra.additionalIncomeType || null,
          additionalIncome ? JSON.stringify(additionalIncome) : null,
          ident?.permanentAddress || String(extra.permanentAddress || "").trim() || null,
          extra.community || null,
          extra.street || null,
          Number.isFinite(Number(extra.lat)) && extra.lat !== "" && extra.lat !== null && extra.lat !== undefined ? Number(extra.lat) : null,
          Number.isFinite(Number(extra.lng)) && extra.lng !== "" && extra.lng !== null && extra.lng !== undefined ? Number(extra.lng) : null,
          user._place.method,
        ]
      );
    } else if (role_type === "buyer") {
      await client.query(
        `INSERT INTO buyer_profiles
           (user_id, buyer_type, organization_name, registered_address, contact_person_name, address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.id,
          extra.buyerType === "organization" ? "organization" : "individual",
          extra.buyerType === "organization" ? name : null,
          extra.buyerType === "organization" ? extra.registeredAddress || null : null,
          extra.buyerType === "organization" ? extra.contactPersonName || null : null,
          extra.buyerType === "organization" ? null : extra.address || null,
        ]
      );
    } else if (role_type === "corper") {
      const names = Object.keys(corperCols);
      const placeholders = names.map((_, i) => `$${i + 2}`);
      await client.query(
        `INSERT INTO corper_profiles (user_id, ${names.join(", ")}) VALUES ($1, ${placeholders.join(", ")})`,
        [user.id, ...names.map((c) => corperCols[c])]
      );
    } else if (role_type === "investor") {
      const referralCode = generateReference("REF");
      await client.query(
        `INSERT INTO investor_profiles (user_id, occupation, referral_code, referred_by_code)
         VALUES ($1, $2, $3, $4)`,
        [user.id, extra.occupation || null, referralCode, extra.referredBy || null]
      );

      if (extra.referredBy) {
        const { rows: referrerRows } = await client.query(
          `SELECT user_id FROM investor_profiles WHERE referral_code = $1`,
          [extra.referredBy]
        );
        if (referrerRows[0]) {
          await client.query(
            `INSERT INTO referrals (referrer_id, referred_investor_id) VALUES ($1, $2)`,
            [referrerRows[0].user_id, user.id]
          );
        }
      }
    }

    await client.query("COMMIT");
    // Give the connection back NOW: attachProfile() below needs one of its own,
    // and with every connection held by a registration in flight the server
    // would deadlock under load (found by the load test; present in v28).
    releaseClient();

    // Non-blocking, purely a nice-to-have — registration never depends on
    // this succeeding.
    if (user.email) {
      const welcome = renderTemplate("welcome", { name: user.name });
      sendMail({ to: user.email, subject: welcome.subject, html: welcome.html, text: welcome.text, raw: true, template: "welcome", userId: user.id });
    }

    if (role_type === "farmer" && !user.unit) {
      notifyAttention("unit_not_found", { name: user.name, address: extra.homeAddress || "", area: `${ward || ""}, ${lga || ""}, ${state || ""}` }, null);
    }
    delete user._place;
    const fullUser = await attachProfile(user);
    res.status(201).json({ user: fullUser, token: signToken(user) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      return res.status(409).json({ error: "An account with that email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    releaseClient();
  }
}

export async function login(req, res) {
  // Field is still named `email` on the wire for backward compatibility,
  // but it accepts either an email or a phone number.
  const { email: identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: "email/phone and password are required" });
  }
  const ident = String(identifier).trim();
  const GENERIC = { error: "Invalid email or password" };

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1 OR phone = $1", [ident]);
  const user = rows[0];
  if (!user) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    await logSecurityEvent("login_failed", { req, detail: { identifier: ident.toLowerCase(), reason: "unknown_account" } });
    return res.status(401).json(GENERIC);
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.max(1, Math.ceil((new Date(user.locked_until) - Date.now()) / 60000));
    await logSecurityEvent("login_blocked_locked", { userId: user.id, req });
    return res.status(429).json({
      error: `Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      code: "ACCOUNT_LOCKED", retryAfterMinutes: minutes,
    });
  }

  const valid = await bcrypt.compare(String(password), user.password_hash);
  if (!valid) {
    // Atomic count, so parallel guesses cannot slip past the limit.
    const { rows: upd } = await pool.query(
      `UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = $1 RETURNING failed_login_count`, [user.id]);
    await logSecurityEvent("login_failed", { userId: user.id, req, detail: { reason: "wrong_password", count: upd[0].failed_login_count } });
    if (upd[0].failed_login_count >= MAX_FAILED_LOGINS) {
      await pool.query(
        `UPDATE users SET locked_until = now() + ($2 || ' minutes')::interval, failed_login_count = 0 WHERE id = $1`,
        [user.id, String(LOCK_MINUTES)]);
      await logSecurityEvent("account_locked", { userId: user.id, req, detail: { minutes: LOCK_MINUTES } });
      notifyUser(user.id, "account_locked", { minutes: LOCK_MINUTES }).catch((e) => console.error("[auth] lock notice failed:", e.message));
    }
    return res.status(401).json(GENERIC);
  }

  // Success: clear the counters, and quietly upgrade an older, weaker hash.
  let upgradedHash = null;
  if (bcrypt.getRounds(user.password_hash) < BCRYPT_ROUNDS) upgradedHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
  await pool.query(
    `UPDATE users SET failed_login_count = 0, locked_until = NULL, password_hash = COALESCE($2, password_hash) WHERE id = $1`,
    [user.id, upgradedHash]);
  await logSecurityEvent("login_success", { userId: user.id, req });

  const { password_hash, ...safeUser } = user;
  const fullUser = await attachProfile(safeUser);
  res.json({ user: fullUser, token: signToken(user) });
}

// POST /auth/logout-all — "Sign out of all devices". Every older token stops
// working at once, this device's included.
export async function logoutAll(req, res) {
  await pool.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [req.user.id]);
  await logSecurityEvent("sessions_revoked", { userId: req.user.id, req, detail: { by: "self" } });
  res.json({ ok: true });
}

// POST /auth/change-password — needs the current password; ends all other sessions
// and hands back a fresh token for this one.
export async function changePassword(req, res) {
  if (req.actingAs) return res.status(403).json({ error: "Not allowed while acting as a department" });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "currentPassword and newPassword are required" });
  if (String(newPassword).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(currentPassword), user.password_hash))) {
    await logSecurityEvent("password_change_failed", { userId: req.user.id, req });
    return res.status(400).json({ error: "Your current password is not correct" });
  }
  const hash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  const { rows: upd } = await pool.query(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING *`, [user.id, hash]);
  await logSecurityEvent("password_changed", { userId: user.id, req });
  res.json({ ok: true, token: signToken(upd[0]) });
}

// Public (no auth — registration hasn't created a token yet). Lets the
// registration form recognize a referral code as it's typed and show whose
// it is, without exposing anything beyond name/role — see
// FarmerRegisterWizard.jsx step 4 ("Photo & password").
export async function referralLookup(req, res) {
  const code = String(req.query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "code is required" });
  const { rows } = await pool.query(
    `SELECT name, role_type FROM users WHERE referral_code = $1`,
    [code]
  );
  if (!rows[0]) return res.status(404).json({ error: "No member found with that referral code" });
  res.json({ name: rows[0].name, roleType: rows[0].role_type });
}

export async function me(req, res) {
  const { rows } = await pool.query(
    "SELECT id, name, email, phone, role_type, sex, photo_url, state, lga, ward, unit, department_head_of, referral_code, referred_by_code FROM users WHERE id = $1",
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  const fullUser = await attachProfile(rows[0]);
  res.json({ user: fullUser });
}

// ---------------------------------------------------------------------
// Forgot / reset password — unrelated to registration, left as-is.
// ---------------------------------------------------------------------

export async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  const { rows } = await pool.query(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
  const user = rows[0];

  // Always respond the same way whether or not the account exists, so
  // this endpoint can't be used to check which emails are registered.
  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    // FRONTEND_ORIGIN can be a comma-separated list (see server.js CORS
    // setup) — the reset link always uses the first entry.
    const primaryOrigin = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim();
    const resetUrl = `${primaryOrigin}/reset-password?token=${rawToken}&uid=${user.id}`;
    if (process.env.OTP_DEBUG_LOG === "true") console.log(`[otp-debug] reset url: ${resetUrl}`);
    const reset = renderTemplate("password_reset", { name: user.name, minutes: RESET_TTL_MINUTES, url: resetUrl });
    sendMail({ to: user.email, subject: reset.subject, html: reset.html, text: reset.text, raw: true, template: "password_reset", userId: user.id });
  }

  res.json({ message: "If an account exists for that email, a reset link has been sent." });
}

export async function resetPassword(req, res) {
  const { uid, token, newPassword } = req.body;
  if (!uid || !token || !newPassword) {
    return res.status(400).json({ error: "uid, token, and newPassword are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const { rows } = await pool.query(
    `SELECT * FROM password_resets
     WHERE user_id = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [uid]
  );
  const record = rows[0];
  if (!record || record.token_hash !== hashToken(token)) {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }
  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: "This reset link has expired — request a new one" });
  }

  const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1, failed_login_count = 0, locked_until = NULL WHERE id = $2`,
    [password_hash, uid]
  );
  await logSecurityEvent("password_reset", { userId: uid, req });
  await pool.query(`UPDATE password_resets SET consumed_at = now() WHERE id = $1`, [record.id]);

  res.json({ message: "Password updated — you can now log in with your new password." });
}

// ---------------------------------------------------------------------
// Profile photo (passport) upload — unrelated to registration, left as-is.
// ---------------------------------------------------------------------
export async function uploadProfilePhoto(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const photoUrl = req.file.publicUrl;
  await pool.query(`UPDATE users SET photo_url = $1 WHERE id = $2`, [photoUrl, req.user.id]);
  res.json({ photoUrl });
}
