import bcrypt from "bcryptjs";
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

  const password_hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role_type, email_verified)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified = TRUE
     RETURNING id, email`,
    [name, email, password_hash]
  );

  console.log(`Admin account ready: ${rows[0].email} (password: ${password})`);
  await pool.end();
}

seedAdmin().catch((err) => {
  console.error("Failed to seed admin:", err.message);
  process.exit(1);
});
