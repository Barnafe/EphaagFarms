// The connection-pool guard itself must catch the deadlock pattern, or a green run means nothing.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pool } from "../../src/db/pool.js";

after(() => pool.end());

test("the guard records a pool.query made while a connection is held (and not otherwise)", async () => {
  const log = path.join(os.tmpdir(), `guard-selftest-${Date.now()}.log`);
  const real = process.env.POOL_GUARD_LOG;
  process.env.POOL_GUARD_LOG = log;
  try {
    // fine: use the pool, or use the held client for everything
    await pool.query("SELECT 1");
    const ok = await pool.connect();
    await ok.query("SELECT 1");
    ok.release();
    await pool.query("SELECT 1");
    assert.equal(fs.existsSync(log), false, "no false alarm for correct use");

    // the v28 sign-up bug: hold a connection and ask the pool for another
    const held = await pool.connect();
    await pool.query("SELECT 1");
    held.release();
    assert.equal(fs.existsSync(log), true, "violation recorded");
    assert.match(fs.readFileSync(log, "utf8"), /pool\.query while holding a connection/);

    // releasing twice is harmless
    const c = await pool.connect();
    c.release(); c.release();
    await pool.query("SELECT 1");
  } finally {
    process.env.POOL_GUARD_LOG = real;
    fs.rmSync(log, { force: true });
  }
});
