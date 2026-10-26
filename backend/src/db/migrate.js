import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Every migration file is idempotent (CREATE ... IF NOT EXISTS / ADD COLUMN
// IF NOT EXISTS), so all of them run, in name order, on every boot.
async function migrate() {
  const dir = path.join(__dirname, "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    console.log(`Running migration ${f}...`);
    await pool.query(readFileSync(path.join(dir, f), "utf8"));
  }
  console.log("Done. Tables created.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
