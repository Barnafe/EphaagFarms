import pg from "pg";
import "dotenv/config";

// Neon (and most managed Postgres hosts) require SSL, and Node's default
// TLS trust store handles Neon's cert chain fine — but on some hosts an
// extra hop through a connection pooler presents a cert that Node won't
// auto-verify against, so we relax verification specifically for that
// case rather than failing closed. Controlled by DB_SSL so a local
// Postgres (no SSL at all) keeps working with no flag set.
const useSsl = process.env.DB_SSL === "true" || /\bsslmode=require\b/.test(process.env.DATABASE_URL || "");

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
