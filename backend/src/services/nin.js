// NIN verification through NIMC (via a verification provider). The provider is Dojah's NIN lookup;
// it is reached only through this file, so another provider can be swapped in here.
//   DOJAH_BASE_URL   https://api.dojah.io (live) or https://sandbox.dojah.io (sandbox)
//   DOJAH_APP_ID, DOJAH_SECRET_KEY
// The NIN itself is never stored or logged: only an HMAC (for duplicate detection) and its last 4 digits.
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const TOKEN_MINUTES = 30;

export function ninConfigured() {
  return !!(process.env.DOJAH_SECRET_KEY && process.env.DOJAH_APP_ID);
}

const secret = () => process.env.JWT_SECRET || "dev-secret";
export const isValidNin = (nin) => /^\d{11}$/.test(String(nin || ""));
export const ninHash = (nin) => crypto.createHmac("sha256", `nin:${secret()}`).update(String(nin)).digest("hex");
export const ninLast4 = (nin) => String(nin).slice(-4);

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const titleCase = (s) => clean(s).toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** Ask the provider for the NIMC record. Throws { code: "NIN_NOT_FOUND" | "NIN_UNAVAILABLE" }. */
export async function lookupNin(nin) {
  if (!ninConfigured()) throw Object.assign(new Error("NIN verification is not available right now."), { code: "NIN_UNAVAILABLE", status: 503 });
  const base = (process.env.DOJAH_BASE_URL || "https://api.dojah.io").replace(/\/+$/, "");
  let res, body = null;
  try {
    res = await fetch(`${base}/api/v1/kyc/nin/advance?nin=${encodeURIComponent(nin)}`, {
      headers: { Authorization: process.env.DOJAH_SECRET_KEY, AppId: process.env.DOJAH_APP_ID, Accept: "application/json" },
      signal: AbortSignal.timeout(Number(process.env.NIN_TIMEOUT_MS || 15000)),
    });
    body = await res.json().catch(() => null);
  } catch {
    throw Object.assign(new Error("NIN verification is not available right now."), { code: "NIN_UNAVAILABLE", status: 503 });
  }
  if (res.status === 400 || res.status === 404 || res.status === 422) {
    throw Object.assign(new Error("We could not find that NIN. Check the 11 digits and try again."), { code: "NIN_NOT_FOUND", status: 404 });
  }
  const e = body?.entity;
  if (!res.ok || !e) throw Object.assign(new Error("NIN verification is not available right now."), { code: "NIN_UNAVAILABLE", status: 503 });

  const first = titleCase(e.first_name), middle = titleCase(e.middle_name), last = titleCase(e.last_name);
  const address = [e.residence_address_line_1, e.residence_address_line_2, e.residence_town, e.residence_lga, e.residence_state].map(clean).filter(Boolean).join(", ");
  const gender = String(e.gender || "").toLowerCase().startsWith("f") ? "female" : String(e.gender || "").toLowerCase().startsWith("m") ? "male" : null;
  const dob = /^\d{4}-\d{2}-\d{2}/.test(String(e.date_of_birth || "")) ? String(e.date_of_birth).slice(0, 10) : null;
  if (!first || !last || !dob) throw Object.assign(new Error("The NIMC record is incomplete, so it cannot be used."), { code: "NIN_NOT_FOUND", status: 404 });
  return { fullName: [first, middle, last].filter(Boolean).join(" "), dateOfBirth: dob, gender, permanentAddress: address || null, state: clean(e.residence_state) || null, lga: clean(e.residence_lga) || null };
}

/** A short-lived signed proof that this identity was just verified. The registration form carries it. */
export function signIdentityToken(nin, identity) {
  return jwt.sign({ purpose: "nin", h: ninHash(nin), l4: ninLast4(nin), id: identity }, secret(), { expiresIn: `${TOKEN_MINUTES}m` });
}
export function readIdentityToken(token) {
  try {
    const p = jwt.verify(String(token || ""), secret());
    return p.purpose === "nin" && p.id && p.h ? { hash: p.h, last4: p.l4, identity: p.id } : null;
  } catch { return null; }
}
