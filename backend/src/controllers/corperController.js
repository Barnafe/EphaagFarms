import { pool } from "../db/pool.js";
import {
  SECTIONS,
  SECTION_KEYS,
  coerceSection,
  mapCorperProfile,
  computeCompletion,
} from "../utils/corperProfile.js";
import { loadAccess } from "./corperPaymentController.js";

async function loadProfileBundle(userId) {
  const { rows } = await pool.query(
    `SELECT cp.*, u.photo_url
     FROM corper_profiles cp JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  const profile = mapCorperProfile(row);
  // `access` tells every screen whether the access fee is paid (see phase 3).
  return { profile, completion: computeCompletion(profile, !!row.photo_url), access: await loadAccess(userId) };
}

// GET /api/corpers/me
export async function getMyProfile(req, res) {
  try {
    const bundle = await loadProfileBundle(req.user.id);
    if (!bundle) return res.status(404).json({ error: "Corps member profile not found" });
    res.json(bundle);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load profile" });
  }
}

// PUT /api/corpers/me/profile/:section — saves one profile tab at a time.
// Only fields belonging to that tab are ever written, and each is
// validated against the shared spec (utils/corperProfile.js).
export async function updateMySection(req, res) {
  const { section } = req.params;
  if (!SECTION_KEYS.includes(section)) {
    return res.status(404).json({ error: "Unknown profile section" });
  }

  const { cols, error } = coerceSection(section, req.body || {});
  if (error) return res.status(400).json({ error });

  // The three consent flags are NOT NULL (default false) — an unanswered
  // (null) value from the form just means "leave as is", never "clear".
  for (const c of ["consent_terms", "consent_data", "consent_media"]) {
    if (cols[c] === null) delete cols[c];
  }
  // Sharing details with NYSC is required for every corps member (data
  // protection: NYSC only ever gets consenting members). An explicit "no" is
  // refused; leaving the field out leaves it as it was.
  if (cols.consent_data === false) {
    return res.status(400).json({ error: "Consent to share your details with NYSC is required for corps members" });
  }
  if (!Object.keys(cols).length) return res.status(400).json({ error: "Nothing to update" });

  if (section === "documents" && cols.consent_terms === true) {
    cols.consent_terms_at = new Date().toISOString();
  }

  try {
    const names = Object.keys(cols);
    const sets = names.map((c, i) => `${c} = $${i + 1}`);
    const values = names.map((c) => cols[c]);
    values.push(req.user.id);
    const { rowCount } = await pool.query(
      `UPDATE corper_profiles SET ${sets.join(", ")}, updated_at = now() WHERE user_id = $${values.length}`,
      values
    );
    if (!rowCount) return res.status(404).json({ error: "Corps member profile not found" });
    res.json(await loadProfileBundle(req.user.id));
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That state code is already registered to another account" });
    }
    console.error(err);
    res.status(500).json({ error: "Could not save profile" });
  }
}

export const _sections = SECTIONS;
