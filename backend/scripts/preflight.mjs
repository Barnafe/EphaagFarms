// Run before going live:   npm run preflight   (from the project root or backend/)
// Reads the same environment the server will use (.env locally, or paste your host's
// variables in front:  NODE_ENV=production DATABASE_URL=... npm run preflight).
import "dotenv/config";
import { checkEnvironment, summarise, formatReport } from "../src/utils/preflight.js";

const results = checkEnvironment(process.env);
console.log(formatReport(results));
const s = summarise(results);
console.log(`\n${s.ok} passed, ${s.warn} warnings, ${s.fail} must be fixed.`);

// Also try the database, because a wrong connection string is the most common first-deploy problem.
if (process.env.DATABASE_URL) {
  try {
    const { pool } = await import("../src/db/pool.js");
    const r = await pool.query("SELECT now() AS now, current_database() AS db");
    console.log(`PASS  Database reachable (${r.rows[0].db}).`);
    await pool.end();
  } catch (e) {
    console.log(`FAIL  Database not reachable: ${e.message}`);
    s.fail++;
  }
}
process.exit(s.fail ? 1 : 0);
