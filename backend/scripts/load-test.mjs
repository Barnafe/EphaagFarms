// Basic load test:  node scripts/load-test.mjs
//   BASE_URL=https://your-site USERS=200 DURATION_SECONDS=60 node scripts/load-test.mjs
// Simulates USERS people at once: logging in, opening their dashboard, browsing
// the public site and checking certificates. Targets (proposed): 95% of
// requests under 800 ms and under 1% errors.
// Run it against a STAGING copy on the real host: the app's per-IP limits will
// (rightly) block one machine, so start the server under test with
// RATE_LIMIT_MULTIPLIER=1000 for the run. Never point it at production.
const BASE = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const USERS = Number(process.env.USERS || 200);
const DURATION = Number(process.env.DURATION_SECONDS || 30) * 1000;
const P95_TARGET_MS = Number(process.env.P95_MS || 800);
const ERROR_TARGET = Number(process.env.ERROR_RATE || 0.01);

const RAMP = Number(process.env.RAMP_SECONDS || 20) * 1000; // people do not all sign in the same instant
const lat = [], loginLat = []; let errors = 0, total = 0;
const errorKinds = {};
const noteError = (label, what) => { const k = `${label}: ${what}`; errorKinds[k] = (errorKinds[k] || 0) + 1; };
async function timed(label, fn) {
  const t = performance.now();
  try {
    const res = await fn();
    const ms = performance.now() - t;
    (label === "login" ? loginLat : lat).push(ms); total++;
    // The certificate check has its own per-IP throttle (a 429 is correct behaviour from one machine).
    if (res.status >= 500 || (res.status === 429 && label !== "certificate-verify")) { errors++; noteError(label, `HTTP ${res.status}`); }
    return res;
  } catch (e) { total++; errors++; noteError(label, String(e.cause?.code || e.cause?.message || e.message)); (label === "login" ? loginLat : lat).push(performance.now() - t); return null; }
}
const j = (path, opts = {}) => fetch(`${BASE}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });

async function register(i) {
  const email = `load${Date.now()}${i}@example.test`;
  const r = await j("/api/auth/register", { method: "POST", body: JSON.stringify({ name: `Load ${i}`, email, password: "Passw0rd!x", role_type: "investor", sex: "male" }) });
  if (r.status !== 201) throw new Error(`register failed ${r.status}: is RATE_LIMIT_MULTIPLIER raised on the server?`);
  return { email, password: "Passw0rd!x" };
}

async function virtualUser(i, stopAt) {
  const u = await register(i);
  await new Promise((r) => setTimeout(r, Math.random() * RAMP));
  // Everyone signs in once at the start (a burst: the heaviest moment, because
  // password hashing is deliberately slow), then keeps using the app.
  const login = await timed("login", () => j("/api/auth/login", { method: "POST", body: JSON.stringify(u) }));
  const token = login && login.status === 200 ? (await login.json()).token : null;
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  while (Date.now() < stopAt) {
    await timed("me", () => j("/api/auth/me", { headers: h }));
    await timed("investments", () => j("/api/investments/me", { headers: h }));
    await timed("health", () => j("/health"));
    await timed("certificate-verify", () => j("/api/certificates/verify/DOES-NOT-EXIST"));
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 600));
  }
}

const stopAt = Date.now() + DURATION;
console.log(`Load test: ${USERS} users for ${DURATION / 1000}s against ${BASE}`);
await Promise.all(Array.from({ length: USERS }, (_, i) => virtualUser(i, stopAt).catch((e) => { console.error(e.message); errors++; })));
const stats = (arr) => { arr.sort((a, b) => a - b); const p = (q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] || 0; return { n: arr.length, p50: p(0.5), p95: p(0.95), p99: p(0.99) }; };
const L = stats(loginLat), R = stats(lat);
const rate = total ? errors / total : 1;
console.log(`sign-ins   n=${L.n}  p50 ${L.p50.toFixed(0)}ms  p95 ${L.p95.toFixed(0)}ms  (password hashing is deliberately slow)`);
console.log(`other      n=${R.n}  p50 ${R.p50.toFixed(0)}ms  p95 ${R.p95.toFixed(0)}ms  p99 ${R.p99.toFixed(0)}ms`);
if (errors) console.log("error kinds:", errorKinds);
console.log(`errors ${errors} of ${total} (${(rate * 100).toFixed(2)}%)`);
const ok = R.p95 <= P95_TARGET_MS && rate <= ERROR_TARGET;
console.log(ok ? "PASS: everyday requests within targets" : `FAIL: targets are p95 <= ${P95_TARGET_MS}ms and errors <= ${ERROR_TARGET * 100}%`);
process.exit(ok ? 0 : 1);
