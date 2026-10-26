import crypto from "node:crypto";

// Corps access-fee payment provider (phase 3).
//
// Paystack (NGN) when PAYSTACK_SECRET_KEY is set. Without it the provider is
// "manual": the member's payment stays pending until an admin confirms it by
// hand (TRC -> Corps -> Payments). Unlike farmer shares there is NO simulated
// "auto-paid" mode — a missing key never gives anyone free access.

export function corperPaymentMode() {
  return process.env.PAYSTACK_SECRET_KEY ? "paystack" : "manual";
}

export async function paystackRequest(path, options = {}) {
  const res = await fetch(`${process.env.PAYSTACK_BASE_URL || "https://api.paystack.co"}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

// Naira (may have kobo) -> whole kobo, avoiding float drift (e.g. 1500.1 * 100).
export function toKobo(naira) {
  return Math.round(Number(naira) * 100);
}

// Pure check of a Paystack "verify" payload against the payment we created.
// Returns { ok: true } or { ok: false, code, message }. Never accepts a
// payment for the wrong amount or currency, or one that isn't "success".
export function checkPaystackTransaction(data, payment) {
  if (!data) return { ok: false, code: "no_data", message: "Couldn't confirm the payment yet — please try again in a moment" };
  if (data.status !== "success") {
    return { ok: false, code: "not_success", message: `Payment not completed (status: ${data.status})` };
  }
  if (Number(data.amount) !== toKobo(payment.amount) || data.currency !== "NGN") {
    return { ok: false, code: "mismatch", message: "The amount paid doesn't match this payment — please contact support" };
  }
  if (data.reference && data.reference !== payment.reference) {
    return { ok: false, code: "reference", message: "This payment reference doesn't match" };
  }
  return { ok: true };
}

// Paystack signs each webhook body with HMAC-SHA512 (secret key) in the
// x-paystack-signature header. Constant-time compare.
export function verifyPaystackSignature(rawBody, signature, secret = process.env.PAYSTACK_SECRET_KEY) {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
