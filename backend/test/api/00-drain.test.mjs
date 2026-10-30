// Runs first. The Python suites that run before the API suites leave messages waiting, and the sender works
// through them a few per second. Let that backlog clear so no suite's timing depends on how many were left.
import test, { after } from "node:test";
import { api, db, loginAdmin } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

after(async () => { await db.end(); await pool.end(); });

test("messages left by earlier suites are sent before the API suites start", async () => {
  const admin = await loginAdmin();
  const end = Date.now() + 150000;
  while (Date.now() < end) {
    const { rows } = await db.query("SELECT count(*)::int AS n FROM messages WHERE status = 'queued' AND next_attempt_at <= now() + interval '5 seconds'");
    if (rows[0].n === 0) return;
    await api("/system/jobs/message-queue/run", { method: "POST", token: admin });
    await new Promise((r) => setTimeout(r, 500));
  }
});
