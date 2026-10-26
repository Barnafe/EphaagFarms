import { pool } from "../db/pool.js";

// Small key/value store for admin-editable settings (fee rates, alert phone,
// payout switches...). Values are JSON.
export async function getSetting(key, fallback = null, runner = pool) {
  const { rows } = await runner.query("SELECT value FROM app_settings WHERE key = $1", [key]);
  return rows[0] ? rows[0].value : fallback;
}

export async function setSetting(key, value, userId = null) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), userId]
  );
}
