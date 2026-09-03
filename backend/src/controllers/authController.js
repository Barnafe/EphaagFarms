import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { generateReference } from "../utils/reference.js";
import { attachProfile } from "../utils/profileLoader.js";
import { sendMail } from "../utils/email.js";

const RESET_TTL_MINUTES = 30;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role_type: user.role_type, name: user.name },
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
// Admin is included as a selectable role here too, but gated behind a
// setup code (ADMIN_SETUP_CODE in .env) so it isn't a wide-open "anyone
// can become admin" hole — admin has access to Finance/Loan approvals and
// other sensitive internal tools.
// ---------------------------------------------------------------------
export async function register(req, res) {
  const { name, email, phone, password, role_type, sex, state, lga, ward, unit, setupCode, ...extra } = req.body;

  if (!name || !password || !role_type) {
    return res.status(400).json({ error: "name, password, and role_type are required" });
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

  if (role_type === "admin") {
    const expected = process.env.ADMIN_SETUP_CODE?.trim();
    if (!expected || (setupCode || "").trim() !== expected) {
      return res.status(403).json({ error: "Incorrect admin setup code" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role_type, sex, state, lga, ward, unit, email_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)
       RETURNING id, name, email, role_type, sex, state, lga, ward, unit`,
      [name, email || null, phone || null, password_hash, role_type, sex || null, state, lga, ward, unit]
    );
    const user = rows[0];

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
            additional_income_type, additional_income)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          user.id,
          crops,
          extra.maritalStatus || null,
          extra.dateOfBirth || null,
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

    // Non-blocking, purely a nice-to-have — registration never depends on
    // this succeeding.
    if (user.email) {
      sendMail({
        to: user.email,
        subject: "Welcome to EPHAAG Farms",
        html: `<p>Hi ${user.name},</p><p>Your EPHAAG Farms account has been created — you're all set.</p>`,
      });
    }

    const fullUser = await attachProfile(user);
    res.status(201).json({ user: fullUser, token: signToken(user) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "An account with that email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
}

export async function login(req, res) {
  // Field is still named `email` on the wire for backward compatibility,
  // but it now accepts either an email or a phone number — many farmers
  // register with only a phone number, so they need to be able to log in
  // with it too.
  const { email: identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: "email/phone and password are required" });
  }

  const { rows } = await pool.query(
    "SELECT * FROM users WHERE email = $1 OR phone = $1",
    [identifier]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  const { password_hash, ...safeUser } = user;
  const fullUser = await attachProfile(safeUser);
  res.json({ user: fullUser, token: signToken(user) });
}

export async function me(req, res) {
  const { rows } = await pool.query(
    "SELECT id, name, email, phone, role_type, sex, photo_url, state, lga, ward, unit, department_head_of FROM users WHERE id = $1",
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
    sendMail({
      to: user.email,
      subject: "Reset your EPHAAG Farms password",
      html: `<p>Hi ${user.name},</p>
        <p>Click the link below to set a new password. This link expires in ${RESET_TTL_MINUTES} minutes.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
    });
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

  const password_hash = await bcrypt.hash(newPassword, 10);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [password_hash, uid]);
  await pool.query(`UPDATE password_resets SET consumed_at = now() WHERE id = $1`, [record.id]);

  res.json({ message: "Password updated — you can now log in with your new password." });
}

// ---------------------------------------------------------------------
// Profile photo (passport) upload — unrelated to registration, left as-is.
// ---------------------------------------------------------------------
export async function uploadProfilePhoto(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const photoUrl = `/uploads/photos/${req.file.filename}`;
  await pool.query(`UPDATE users SET photo_url = $1 WHERE id = $2`, [photoUrl, req.user.id]);
  res.json({ photoUrl });
}
