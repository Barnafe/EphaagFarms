import crypto from "node:crypto";
import pg from "pg";

export const API = process.env.API_URL || "http://localhost:4000";
export const STRICT = process.env.API_STRICT_URL || "http://localhost:4001";
export const S3 = process.env.S3_URL;
export const MAIL = process.env.MAIL_URL;
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uniq = () => crypto.randomBytes(4).toString("hex");

export async function call(base, path, { method = "GET", token, body, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData) && typeof body !== "string") { h["Content-Type"] = "application/json"; body = JSON.stringify(body); }
  const res = await fetch(`${base}${path}`, { method, headers: h, body });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}
export const api = (path, opts) => call(API, `/api${path}`, opts);
export const strict = (path, opts) => call(STRICT, `/api${path}`, opts);

export async function loginAdmin(base = API) {
  const r = await call(base, "/api/auth/login", { method: "POST", body: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } });
  if (r.status !== 200) throw new Error(`admin login failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.token;
}

let seq = 0;
/** Registers an investor (no extra fields needed) and returns { email, password, token, id }. */
export async function newUser({ phoneOnly = false, base = API } = {}) {
  const id = `${uniq()}${++seq}`;
  const password = "Passw0rd!x";
  const body = { name: `Test ${id}`, password, role_type: "investor", sex: "male" };
  let email = null, phone = null;
  if (phoneOnly) phone = `0803${String(Math.floor(1000000 + Math.random() * 8999999))}`; else email = `u${id}@example.test`;
  Object.assign(body, email ? { email } : { phone });
  const r = await call(base, "/api/auth/register", { method: "POST", body });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { email, phone, password, token: r.data.token, id: r.data.user.id };
}

export async function mailState() { return (await fetch(`${MAIL}/__state`)).json(); }
export async function mailReset() { await fetch(`${MAIL}/__reset`); }
export async function waitForMessage(where, params, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const { rows } = await db.query(`SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT 1`, params);
    if (rows[0]) return rows[0];
    await sleep(150);
  }
  return null;
}
export async function waitStatus(id, status, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const { rows } = await db.query("SELECT * FROM messages WHERE id = $1", [id]);
    if (rows[0]?.status === status) return rows[0];
    await sleep(150);
  }
  const { rows } = await db.query("SELECT * FROM messages WHERE id = $1", [id]);
  return rows[0];
}

// ---- payments ----------------------------------------------------------------
export const PAY = process.env.API_PAY_URL || "http://localhost:4003";
export const PAYSTACK = process.env.PAYSTACK_URL;
export const pay = (path, opts) => call(PAY, `/api${path}`, opts);
const ps = async (path) => (await fetch(`${PAYSTACK}${path}`)).json();
export const paystack = {
  tx: (reference) => ps(`/__tx?reference=${encodeURIComponent(reference)}`),
  set: (reference, qs) => ps(`/__set?reference=${encodeURIComponent(reference)}&${qs}`),
  success: (reference, extra = "") => ps(`/__set?reference=${encodeURIComponent(reference)}&status=success${extra ? "&" + extra : ""}`),
  down: (on) => ps(`/__down?on=${on ? 1 : 0}`),
  refundFail: (on) => ps(`/__refundfail?on=${on ? 1 : 0}`),
  chargeFail: (on) => ps(`/__chargefail?on=${on ? 1 : 0}`),
  transferMode: (mode) => ps(`/__transfermode?mode=${mode}`),
  setTransfer: (reference, status) => ps(`/__transfer?reference=${encodeURIComponent(reference)}&status=${status}`),
  webhook: (reference, { bad = false, target = `${PAY}/api/payments/paystack-webhook`, event } = {}) =>
    ps(`/__webhook?reference=${encodeURIComponent(reference)}&target=${encodeURIComponent(target)}${bad ? "&bad=1" : ""}${event ? `&event=${event}` : ""}`),
};

/** A buyer (individual) with an email; returns { email, token, id }. */
export async function newBuyer() {
  const id = `${uniq()}${++seq}`;
  const password = "Passw0rd!x";
  const email = `b${id}@example.test`;
  const r = await call(API, "/api/auth/register", { method: "POST", body: { name: `Buyer ${id}`, email, password, role_type: "buyer", sex: "male", buyerType: "individual", address: "1 Test Street, Bauchi" } });
  if (r.status !== 201) throw new Error(`buyer register failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { email, password, token: r.data.token, id: r.data.user.id };
}

export async function firstCrop() {
  const { rows } = await db.query("SELECT crop, sell_price FROM standard_prices ORDER BY crop LIMIT 1");
  return rows[0];
}

export function orderBody(crop, quantity = 2, paidVia = "upfront") {
  return { items: [{ crop, quantity }], deliveryLocation: "Bauchi", contactPhone1: "08031110000", contactPhone2: "08032220000", contactEmail: "buyer@example.test", paidVia };
}

/** A registered farmer. { phoneOnly: true } registers with a phone number and no email. */
export async function newFarmer({ phoneOnly = false } = {}) {
  const id = `${uniq()}${++seq}`;
  const password = "Passw0rd!x";
  const body = { name: `Farmer ${id}`, password, role_type: "farmer", sex: "male", state: "Bauchi", lga: "Bauchi", ward: "Ward A", unit: "Unit 1", crops: "Maize,Cassava" };
  let email = null, phone = null;
  if (phoneOnly) phone = `0803${String(Math.floor(1000000 + Math.random() * 8999999))}`; else email = `f${id}@example.test`;
  Object.assign(body, email ? { email } : { phone });
  const r = await call(API, "/api/auth/register", { method: "POST", body });
  if (r.status !== 201) throw new Error(`farmer register failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { email, phone, password, token: r.data.token, id: r.data.user.id };
}

/** A corps member (NYSC). { phoneOnly: true } registers without an email. */
export async function newCorper({ phoneOnly = false } = {}) {
  const id = `${uniq()}${++seq}`;
  const password = "Passw0rd!x";
  const n = Math.floor(Math.random() * 900000) + 100000;
  const body = {
    name: `Corper ${id}`, password, role_type: "corper", sex: "male", phone: `0803${String(Math.floor(1000000 + Math.random() * 8999999))}`,
    callUpNumber: `NYSC/${id}`, stateCode: `PL/26B/${n}`, serviceYear: 2026, batch: "B", stream: "II", stateOfDeployment: "Plateau",
    ppa: "Test PPA", discipline: "Agriculture", consentTerms: true, consentData: true,
  };
  let email = null;
  if (!phoneOnly) { email = `c${id}@example.test`; body.email = email; }
  const r = await call(API, "/api/auth/register", { method: "POST", body });
  if (r.status !== 201) throw new Error(`corper register failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { email, phone: body.phone, password, token: r.data.token, id: r.data.user.id };
}
