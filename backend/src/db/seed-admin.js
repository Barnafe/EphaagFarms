import bcrypt from "bcrypt";
import "dotenv/config";
import { pool } from "./pool.js";

// Usage: npm run seed:admin -- --email admin@ephaagfarms.com --password somepassword --name "Admin"
// (or just run with no args to get the defaults below — change the password after logging in)

function getArg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

async function seedAdmin() {
  const name = getArg("--name", "Ephaag Admin");
  const email = getArg("--email", "admin@ephaagfarms.com");
  const password = getArg("--password", "change-this-password");

  const password_hash = await bcrypt.hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role_type, email_verified)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified = TRUE
     RETURNING id, email`,
    [name, email, password_hash]
  );

  // The first admin ever seeded is the MAIN admin (the only one who can add or
  // remove other admins). Seeding again never moves that title to someone else.
  const main = await pool.query(
    `UPDATE users SET is_main_admin = TRUE
      WHERE id = $1 AND role_type = 'admin' AND NOT EXISTS (SELECT 1 FROM users WHERE is_main_admin AND id <> $1)
      RETURNING id`,
    [rows[0].id]
  );
  const isMain = !!main.rows[0] || (await pool.query("SELECT 1 FROM users WHERE id = $1 AND is_main_admin", [rows[0].id])).rows.length > 0;

  console.log(`Admin account ready: ${rows[0].email} (password: ${password})${isMain ? " [main admin]" : ""}`);
  await pool.end();
}

seedAdmin().catch((err) => {
  console.error("Failed to seed admin:", err.message);
  process.exit(1);
});
