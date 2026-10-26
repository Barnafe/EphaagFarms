import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
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
  max: Number(process.env.DB_POOL_MAX || 20),
});

const baseConnect = pool.connect.bind(pool);
const baseQuery = pool.query.bind(pool);

// ---------------------------------------------------------------------------
// Connection hygiene.
//
// 1. release() is made safe to call twice, so code can hand a connection back
//    as soon as its transaction is committed (instead of holding it while it
//    does more work) and still keep its `finally { client.release() }`.
//
// 2. POOL_GUARD=1 (used by the test suite) records any code path that asks the
//    pool for ANOTHER connection (pool.query / pool.connect) while it already
//    holds one. With every connection held that way the server deadlocks under
//    load; v28 had this in sign-up. The test run fails if any is recorded.
// ---------------------------------------------------------------------------
const als = new AsyncLocalStorage();
const guardOn = process.env.POOL_GUARD === "1";

function violation(kind) {
  const stack = new Error().stack.split("\n").slice(3, 9).join(" | ").replace(/\s+/g, " ");
  const line = `${new Date().toISOString()} ${kind}: ${stack}\n`;
  try { appendFileSync(process.env.POOL_GUARD_LOG || "/tmp/pool-guard.log", line); } catch { /* best effort */ }
}

pool.connect = function connect(...args) {
  if (args.length) return baseConnect(...args); // callback style: untouched
  let store;
  if (guardOn) {
    store = als.getStore();
    if (!store) { als.enterWith({ held: 0 }); store = als.getStore(); }
    if (store.held > 0) violation("pool.connect while holding a connection");
  }
  return baseConnect().then((client) => {
    if (guardOn) store.held++;
    const release = client.release.bind(client);
    let released = false;
    client.release = (err) => {
      if (released) return;
      released = true;
      if (guardOn) store.held--;
      release(err);
    };
    return client;
  });
};

pool.query = function query(...args) {
  if (guardOn) {
    const store = als.getStore();
    if (store && store.held > 0) violation("pool.query while holding a connection");
  }
  return baseQuery(...args);
};

/** Run background work (fire-and-forget) outside the caller's connection-tracking context. */
export function detached(fn) {
  return als.exit(fn);
}

/**
 * A connection held on purpose for a long time (e.g. the one carrying a job's
 * advisory lock, which must stay on one session). It is not counted by the
 * guard; the caller must release it, and it should hold at most one.
 */
export async function connectLongLived() {
  const client = await baseConnect();
  const release = client.release.bind(client);
  let released = false;
  client.release = (err) => { if (!released) { released = true; release(err); } };
  return client;
}
