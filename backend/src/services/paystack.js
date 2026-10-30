import { getSetting } from "../utils/settings.js";
import { paystackRequest, toKobo, verifyPaystackSignature } from "../utils/paymentProvider.js";

export { toKobo, verifyPaystackSignature };

export const DEFAULT_FEE_CONFIG = Object.freeze({
  percent: 1.5,        // % of the amount charged
  flat: 100,           // naira added on top of the percentage...
  waiverUnder: 2500,   // ...except for charges under this amount
  cap: 2000,           // the most Paystack charges as a fee
});

export function paystackConfigured() {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

export async function getFeeConfig(runner) {
  const stored = await getSetting("paystack_fee", null, runner);
  return { ...DEFAULT_FEE_CONFIG, ...(stored || {}) };
}

/**
 * The payer covers Paystack's fee. Work out what to charge so that, after
 * Paystack takes its fee from the amount charged, EPHAAG nets exactly the
 * listed price. Done in whole kobo so there is no floating-point drift.
 * Paystack adds VAT on its fees and charges more for international cards, so
 * the numbers are editable settings and the result is "at least" the net.
 */
export function calculateFee(netNaira, cfg = DEFAULT_FEE_CONFIG) {
  const net = toKobo(netNaira);
  if (!Number.isFinite(net) || net <= 0) throw Object.assign(new Error("Amount must be greater than zero"), { status: 400 });
  const pct = Number(cfg.percent) / 100;
  const flat = toKobo(cfg.flat);
  const waiver = toKobo(cfg.waiverUnder);
  const cap = toKobo(cfg.cap);

  let gross = Math.ceil(net / (1 - pct));                    // percentage only (flat waived)
  if (gross >= waiver) {
    gross = Math.ceil((net + flat) / (1 - pct));             // percentage + flat
    if (gross - net > cap) gross = net + cap;                // fee is capped
  } else if (gross - net > cap) {
    gross = net + cap;
  }
  return { net: net / 100, fee: (gross - net) / 100, gross: gross / 100 };
}

/** What Paystack itself would take from `gross` (used by tests to prove EPHAAG nets the price). */
export function paystackFeeOn(grossNaira, cfg = DEFAULT_FEE_CONFIG) {
  const gross = toKobo(grossNaira);
  const pct = Number(cfg.percent) / 100;
  let fee = gross * pct + (gross >= toKobo(cfg.waiverUnder) ? toKobo(cfg.flat) : 0);
  fee = Math.min(fee, toKobo(cfg.cap));
  return Math.round(fee) / 100;
}

function unavailable() {
  return Object.assign(new Error("Online payment is unavailable right now. Please try again later."), { status: 503, expose: true });
}

export async function initializeTransaction({ email, amountNaira, reference, callbackUrl, metadata = {}, channels }) {
  if (!paystackConfigured()) throw unavailable();
  const r = await paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email, amount: toKobo(amountNaira), currency: "NGN", reference,
      callback_url: callbackUrl, metadata, ...(channels ? { channels } : {}),
    }),
  });
  if (!r.ok || !r.body?.status || !r.body?.data?.authorization_url) {
    console.error("Paystack initialize failed", r.body);
    throw Object.assign(new Error("Could not start the payment. Please try again."), { status: 502, expose: true });
  }
  return r.body.data; // { authorization_url, access_code, reference }
}

/** Ask Paystack what really happened to a reference. Returns the `data` object or null. */
export async function verifyTransaction(reference) {
  if (!paystackConfigured()) return null;
  const r = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!r.ok) return null;
  return r.body?.data || null;
}

export function callbackUrl(path) {
  const base = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");
  return `${base}${path}`;
}

/** Ask Paystack to return a payment to the payer (their original payment method). */
export async function requestRefund(reference) {
  if (!paystackConfigured()) return { ok: false, error: "Paystack is not configured" };
  try {
    const r = await paystackRequest("/refund", { method: "POST", body: JSON.stringify({ transaction: reference }) });
    if (!r.ok || r.body?.status === false) return { ok: false, error: r.body?.message || "Paystack could not start the refund" };
    return { ok: true, reference: r.body?.data?.id ? String(r.body.data.id) : null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Charge a saved card (Paystack "authorization") without the investor being present.
 * Returns Paystack's data (status "success" | "failed" | "pending" ...). Throws when Paystack
 * cannot be reached or does not answer, which is NOT a declined charge.
 */
export async function chargeAuthorization({ email, amountNaira, reference, authorizationCode, metadata = {} }) {
  if (!paystackConfigured()) throw unavailable();
  const r = await paystackRequest("/transaction/charge_authorization", {
    method: "POST",
    body: JSON.stringify({ email, amount: toKobo(amountNaira), currency: "NGN", reference, authorization_code: authorizationCode, metadata }),
  });
  if (r.body?.data) return r.body.data;
  if (r.ok === false && r.body?.message && /authorization|card/i.test(String(r.body.message))) {
    return { status: "failed", reference, gateway_response: r.body.message };
  }
  throw Object.assign(new Error("Paystack did not answer"), { status: 502 });
}

// ---------------------------------------------------------------------------
// Banks, account-name check and transfers (money out)
// ---------------------------------------------------------------------------
let bankCache = { at: 0, banks: null };
export async function listBanks() {
  if (!paystackConfigured()) throw unavailable();
  if (bankCache.banks && Date.now() - bankCache.at < 24 * 3600 * 1000) return bankCache.banks;
  const r = await paystackRequest("/bank?country=nigeria&perPage=200&use_cursor=false", { method: "GET" });
  if (!r.ok || !Array.isArray(r.body?.data)) throw Object.assign(new Error("Could not load the list of banks. Please try again."), { status: 502, expose: true });
  bankCache = { at: Date.now(), banks: r.body.data.filter((b) => b.active !== false).map((b) => ({ code: String(b.code), name: b.name })) };
  return bankCache.banks;
}

/** The account holder's name as the bank gives it. */
export async function resolveAccount(accountNumber, bankCode) {
  if (!paystackConfigured()) throw unavailable();
  const r = await paystackRequest(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, { method: "GET" });
  if (r.ok && r.body?.data?.account_name) return String(r.body.data.account_name);
  if (r.status && r.status >= 500) throw Object.assign(new Error("Could not check the account right now. Please try again."), { status: 502, expose: true });
  throw Object.assign(new Error("We could not find that account. Check the bank and the 10-digit account number."), { status: 422, expose: true });
}

export async function createTransferRecipient({ name, accountNumber, bankCode }) {
  if (!paystackConfigured()) throw unavailable();
  const r = await paystackRequest("/transferrecipient", {
    method: "POST", body: JSON.stringify({ type: "nuban", name, account_number: accountNumber, bank_code: bankCode, currency: "NGN" }),
  });
  if (!r.ok || !r.body?.data?.recipient_code) throw Object.assign(new Error("Could not save that bank account. Please try again."), { status: 502, expose: true });
  return r.body.data.recipient_code;
}

/** Send money. Throws when Paystack cannot be reached (nothing was sent); otherwise returns Paystack's data. */
export async function initiateTransfer({ amountNaira, recipientCode, reference, reason }) {
  if (!paystackConfigured()) throw unavailable();
  const r = await paystackRequest("/transfer", {
    method: "POST", body: JSON.stringify({ source: "balance", amount: toKobo(amountNaira), recipient: recipientCode, reference, reason, currency: "NGN" }),
  });
  if (r.body?.data) return { ...r.body.data, ok: r.ok };
  if (r.status && r.status < 500) return { status: "failed", reference, ok: false, message: r.body?.message || "Paystack refused the transfer" };
  throw Object.assign(new Error("Paystack did not answer"), { status: 502 });
}

export async function fetchTransfer(reference) {
  if (!paystackConfigured()) throw unavailable();
  const r = await paystackRequest(`/transfer/verify/${encodeURIComponent(reference)}`, { method: "GET" });
  return r.ok ? r.body?.data || null : null;
}
