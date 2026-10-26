import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { getSetting } from "../utils/settings.js";
import { paystackConfigured, calculateFee, getFeeConfig } from "../services/paystack.js";
import { createPayment, startCheckout, verifyAndSettle, registerPaymentType, reviewThreshold, notifyFinance, TYPE_LABEL, refusalText } from "../services/payments.js";
import { notifyUser } from "../services/messaging.js";
import "../services/paymentTemplates.js";

// Farmers' "Shared Capital Investment and Rewards" — registered-farmer-only,
// NOT the same product as the Investor role's Monthly/Bulk plans.
//
// Rebuilt 2026-10-20 to match the approved financing banner exactly
// (see [[ephaag-finance-banner]]); the banner is the single source of truth:
//
//  - ONE share = ₦25,000, always. A farmer buys whole shares (1, 2, 3 ...).
//    The old "any amount from ₦2,500" rule is gone.
//  - Capital is locked for 5 years from purchase.
//  - Yearly return on the ORIGINAL capital only (simple, never compounding):
//    Year 1 = 20%, Year 2 = 30%, Year 3 = 35%, Year 4 = 40%, Year 5 = 45%.
//    (So one share returns ₦42,500 interest over 5 years: ₦67,500 with the
//    capital back — the banner's 1-share row.)
//  - If the capital is left in past year 5 the rate holds flat at 45% for
//    every later year (carried over from the earlier agreed rule — the
//    banner stops at year 5).
//  - EVERY SHARE IS ITS OWN THING. Buying 4 shares creates 4 separate
//    records, each with its own reference, purchase date, interest years,
//    interest withdrawals and capital withdrawal. Nothing is ever merged
//    or pooled, and withdrawing from one share never touches another.
//  - NO AGREEMENT. Farmers are already members, so the flow is:
//    choose how many shares -> pay -> system verifies the payment ->
//    the shares are created and the farmer is sent to their details.

export const SHARE_PRICE = 25000;
export const MAX_SHARES_PER_PURCHASE = 10; // the banner's table runs 1-5 and 10
const BUY_SHARE_LOCK_YEARS = 5;

// Year 1-5 rates; any year after 5 stays flat at the year-5 rate.
const YEAR_RATE_PCT = { 1: 20, 2: 30, 3: 35, 4: 40, 5: 45 };
const MAX_TABLED_YEAR = 5;
const FLAT_RATE_AFTER_YEAR_5 = YEAR_RATE_PCT[MAX_TABLED_YEAR];

function rateForYear(year) {
  return YEAR_RATE_PCT[year] ?? FLAT_RATE_AFTER_YEAR_5;
}

// Calendar anniversary — the same yardstick for interest years AND the
// capital lock. (Interest used to be measured in 365.25-day years while
// the capital lock used calendar years, so the two could disagree by a day.)
function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// How many full years have passed between `from` and `at`.
function completedYearsAt(from, at) {
  let n = 0;
  while (addYears(from, n + 1) <= at) n++;
  return n;
}

// ---------------------------------------------------------------------
// Payment provider
// ---------------------------------------------------------------------
// Paystack (NGN) when PAYSTACK_SECRET_KEY is set. The SIMULATED payment exists
// only for local testing: it must be switched on explicitly
// (PAYMENT_ALLOW_SIMULATED=true) and it never runs when the server is in
// production. A missing gateway key in production means "Online payment
// unavailable": it never means free shares.

export function paymentProvider() {
  if (paystackConfigured()) return "paystack";
  if (process.env.NODE_ENV !== "production" && process.env.PAYMENT_ALLOW_SIMULATED === "true") return "simulated";
  return null;
}

if (process.env.NODE_ENV === "production" && process.env.PAYMENT_ALLOW_SIMULATED === "true") {
  console.warn("[shares] PAYMENT_ALLOW_SIMULATED=true is ignored in production: simulated payments are for local testing only.");
}

const shareExpiryHours = async (runner) => {
  const v = Number(await getSetting("share_expiry_hours", 24, runner));
  return Number.isFinite(v) && v > 0 ? v : 24;
};

// A farmer with no email is sent to Paystack under a placeholder address on a
// domain you control (FARMER_PLACEHOLDER_EMAIL_DOMAIN). Receipts for such
// farmers go by SMS instead; the placeholder never receives anything.
function paystackEmailFor(user) {
  if (user.email) return user.email;
  const domain = process.env.FARMER_PLACEHOLDER_EMAIL_DOMAIN || "farmers.ephaag.app";
  return `${String(user.phone || user.id).replace(/[^a-z0-9]/gi, "")}@${domain}`;
}

// ---------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------

function mapShare(s, interestWithdrawals) {
  const purchasedAt = new Date(s.purchased_at);
  const capitalUnlocksAt = addYears(purchasedAt, BUY_SHARE_LOCK_YEARS);
  const now = new Date();
  const capitalOut = s.status === "capital_withdrawn";
  // Once capital is out the share stops earning: nothing after that moment
  // counts, but years already completed by then stay claimable.
  const cutoff = capitalOut && s.capital_withdrawn_at ? new Date(s.capital_withdrawn_at) : now;
  const completedYears = completedYearsAt(purchasedAt, cutoff);
  const withdrawnYears = interestWithdrawals.map((w) => w.year_number);
  const amount = Number(s.amount);

  // Every completed year (so history never disappears), plus the single
  // next year still counting down while the share is active.
  const maxYearToShow = capitalOut
    ? Math.max(completedYears, ...(withdrawnYears.length ? withdrawnYears : [0]), 1)
    : Math.max(MAX_TABLED_YEAR, completedYears + 1, ...(withdrawnYears.length ? withdrawnYears : [0]));

  const interestYears = [];
  for (let year = 1; year <= maxYearToShow; year++) {
    const unlocksAt = addYears(purchasedAt, year);
    const unlocked = unlocksAt <= now;
    const earned = unlocksAt <= cutoff; // year fully completed before capital left
    const pct = rateForYear(year);
    interestYears.push({
      year,
      pct,
      amount: Math.round(amount * (pct / 100)),
      unlocksAt,
      unlocked,
      withdrawn: withdrawnYears.includes(year),
      withdrawable: unlocked && earned && !withdrawnYears.includes(year),
    });
  }

  const currentYearNumber = Math.min(Math.max(completedYears, 1), maxYearToShow);
  const currentYearPct = rateForYear(currentYearNumber);

  const expectedTotalInterest = [1, 2, 3, 4, 5].reduce(
    (sum, y) => sum + Math.round(amount * (rateForYear(y) / 100)),
    0
  );

  return {
    id: s.id,
    reference: s.reference,
    purchaseId: s.purchase_id || null,
    amount,
    currentYearPct,
    currentYearInterest: Math.round(amount * (currentYearPct / 100)),
    purchasedAt: s.purchased_at,
    capitalUnlocksAt,
    capitalWithdrawable: !capitalOut && now >= capitalUnlocksAt,
    status: s.status,
    capitalWithdrawnAt: s.capital_withdrawn_at,
    interestYears,
    expectedTotalInterest, // years 1-5, matches the banner's "Total ROI"
    expectedPayoutAtYear5: amount + expectedTotalInterest, // "ROI + Capital"
    totalInterestWithdrawn: interestWithdrawals.reduce((sum, w) => sum + Number(w.amount), 0),
  };
}

function mapPurchase(p) {
  const unpaid = p.status === "pending";
  return {
    id: p.id,
    reference: p.reference,
    quantity: p.quantity,
    unitPrice: Number(p.unit_price),
    total: Number(p.total),                       // the goods: shares x price (capital is exactly this)
    fee: Number(p.fee_amount || 0),               // Paystack's processing fee, paid by the farmer
    amountCharged: Number(p.amount_charged ?? p.total),
    status: p.status,
    provider: p.provider,
    authorizationUrl: unpaid ? p.authorization_url || null : null,
    createdAt: p.created_at,
    paidAt: p.paid_at,
    expiresAt: p.expires_at || null,
    canPay: unpaid && (!p.expires_at || new Date(p.expires_at) > new Date()),
  };
}

async function loadSharesWithWithdrawals(whereSql, params) {
  const { rows: shares } = await pool.query(
    `SELECT * FROM farmer_shares WHERE ${whereSql} ORDER BY purchased_at DESC, reference ASC`,
    params
  );
  const { rows: withdrawals } = shares.length
    ? await pool.query(`SELECT * FROM share_interest_withdrawals WHERE share_id = ANY($1::uuid[])`, [
        shares.map((s) => s.id),
      ])
    : { rows: [] };
  return shares.map((s) => mapShare(s, withdrawals.filter((w) => w.share_id === s.id)));
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

export async function shareTerms(req, res) {
  res.json({
    sharePrice: SHARE_PRICE,
    maxSharesPerPurchase: MAX_SHARES_PER_PURCHASE,
    lockYears: BUY_SHARE_LOCK_YEARS,
    yearRatesPct: YEAR_RATE_PCT,
    flatRateAfterYear5Pct: FLAT_RATE_AFTER_YEAR_5,
    provider: paymentProvider(),
  });
}

export async function myShares(req, res) {
  const shares = await loadSharesWithWithdrawals(`farmer_id = $1`, [req.user.id]);
  const { rows: pending } = await pool.query(
    `SELECT * FROM share_purchases WHERE farmer_id = $1 AND status = 'pending' AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ shares, pendingPurchases: pending.map(mapPurchase) });
}

export async function shareDetail(req, res) {
  const shares = await loadSharesWithWithdrawals(`id = $1 AND farmer_id = $2`, [req.params.id, req.user.id]);
  if (!shares[0]) return res.status(404).json({ error: "Share not found" });
  res.json({ share: shares[0] });
}

// ---------------------------------------------------------------------
// Buy: checkout -> pay -> verify -> shares created
// ---------------------------------------------------------------------

// What the processing fee will be, shown before the farmer pays.
export async function quote(req, res) {
  const quantity = Number(req.query.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SHARES_PER_PURCHASE) {
    return res.status(400).json({ error: `Choose a whole number of shares from 1 to ${MAX_SHARES_PER_PURCHASE}` });
  }
  const goods = quantity * SHARE_PRICE;
  const provider = paymentProvider();
  const q = provider === "paystack" ? calculateFee(goods, await getFeeConfig()) : { net: goods, fee: 0, gross: goods };
  res.json({ quantity, goodsTotal: q.net, fee: q.fee, amountCharged: q.gross, provider });
}

const PAID_STATUS = ["paid"];

// Has this farmer already bought (or started buying) exactly this many shares recently?
// Pending payments are checked with Paystack first so a payment that really went
// through is reported as paid.
async function findDuplicatePurchase(farmerId, quantity) {
  const hours = Number(await getSetting("duplicate_window_hours", 24)) || 24;
  const { rows } = await pool.query(
    `SELECT * FROM share_purchases WHERE farmer_id = $1 AND quantity = $2 AND created_at > now() - ($3 || ' hours')::interval
       AND status IN ('pending','paid') ORDER BY created_at DESC LIMIT 5`, [farmerId, quantity, String(hours)]);
  for (const p of rows) {
    if (p.status === "pending") {
      await settleAttempts(p).catch(() => null);
      const { rows: now } = await pool.query("SELECT status, paid_at FROM share_purchases WHERE id = $1", [p.id]);
      p.status = now[0].status; p.paid_at = now[0].paid_at;
    }
  }
  const paid = rows.find((p) => PAID_STATUS.includes(p.status));
  if (paid) return { kind: "paid", purchase: paid };
  const unpaid = rows.find((p) => p.status === "pending" && (!p.expires_at || new Date(p.expires_at) > new Date()));
  if (unpaid) return { kind: "unpaid", purchase: unpaid };
  return null;
}

// Step 1 — the farmer picks how many shares. The purchase is SAVED FIRST (carrying the
// price and the fee); only then is Paystack started and the payment link stored on it,
// so a failed save can never leave a payment with no purchase.
export async function checkout(req, res) {
  const quantity = Number(req.body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SHARES_PER_PURCHASE) {
    return res.status(400).json({
      error: `Choose a whole number of shares from 1 to ${MAX_SHARES_PER_PURCHASE} (each share is ₦${SHARE_PRICE.toLocaleString()})`,
    });
  }
  const provider = paymentProvider();
  if (!provider) {
    return res.status(503).json({ error: "Online payment is unavailable right now. Please try again later." });
  }

  // Same number of shares already bought or waiting? Tell the farmer on screen and let them choose.
  if (req.body?.confirmDuplicate !== true) {
    const dup = await findDuplicatePurchase(req.user.id, quantity);
    if (dup) {
      const p = dup.purchase;
      return res.status(409).json({
        code: "DUPLICATE_PURCHASE", kind: dup.kind,
        error: dup.kind === "paid"
          ? `You already paid for ${quantity} share${quantity === 1 ? "" : "s"} (${p.reference}). Do you want to pay for them again?`
          : `You already have an unpaid purchase of ${quantity} share${quantity === 1 ? "" : "s"} (${p.reference}).`,
        duplicate: { id: p.id, reference: p.reference, status: p.status, paidAt: p.paid_at, total: Number(p.total), amountCharged: Number(p.amount_charged ?? p.total), expiresAt: p.expires_at, canPay: dup.kind === "unpaid" },
      });
    }
  }

  const total = quantity * SHARE_PRICE;
  const hours = await shareExpiryHours();
  const reference = generateReference("SPR");
  const q = provider === "paystack" ? calculateFee(total, await getFeeConfig()) : { fee: 0, gross: total };
  const { rows } = await pool.query(
    `INSERT INTO share_purchases (reference, farmer_id, quantity, unit_price, total, fee_amount, amount_charged, provider, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' hours')::interval) RETURNING *`,
    [reference, req.user.id, quantity, SHARE_PRICE, total, q.fee, q.gross, provider, String(hours)]
  );
  let purchase = rows[0];

  if (provider === "paystack") {
    try {
      const attempt = await startSharePayment(purchase);
      purchase = (await pool.query("SELECT * FROM share_purchases WHERE id = $1", [purchase.id])).rows[0];
      if (attempt.alreadyPaid) purchase = (await pool.query("SELECT * FROM share_purchases WHERE id = $1", [purchase.id])).rows[0];
    } catch (err) {
      console.error("Could not start payment for share purchase", reference, err.message);
      // The purchase stays saved and unpaid so the farmer can use "Pay again".
      return res.status(err.status || 502).json({ error: err.message || "Couldn't start the payment. Please try again.", code: "PAYMENT_NOT_STARTED", purchase: mapPurchase(purchase) });
    }
  }
  res.status(201).json({ purchase: mapPurchase(purchase) });
}

// A fresh Paystack attempt for an unpaid purchase. The channel only exists while the
// purchase is payable; anything paid in the meantime is settled first.
async function startSharePayment(purchase) {
  const { rows: fresh } = await pool.query("SELECT * FROM share_purchases WHERE id = $1", [purchase.id]);
  const p = fresh[0];
  if (p.status === "paid") return { alreadyPaid: true };
  if (p.status !== "pending") throw Object.assign(new Error(p.status === "expired" ? "This purchase has expired. Please start a new one." : "This purchase can no longer be paid."), { status: 409, expose: true });
  if (p.expires_at && new Date(p.expires_at) < new Date()) throw Object.assign(new Error("This purchase has expired. Please start a new one."), { status: 409, expose: true });

  const { rows: pending } = await pool.query(
    `SELECT * FROM gateway_payments WHERE subject_id = $1 AND type = 'share' AND status IN ('initiated','pending') ORDER BY created_at DESC`, [p.id]);
  for (const g of pending) {
    const r = await verifyAndSettle(g.reference).catch(() => null);
    if (r?.outcome === "success") return { alreadyPaid: true };
  }
  const reuse = pending.find((g) => g.authorization_url && new Date(g.created_at) > new Date(Date.now() - 3600 * 1000));
  if (reuse) {
    const { rows: again } = await pool.query("SELECT * FROM gateway_payments WHERE id = $1", [reuse.id]);
    if (["initiated", "pending"].includes(again[0].status)) {
      await pool.query(`UPDATE share_purchases SET authorization_url = $2 WHERE id = $1`, [p.id, again[0].authorization_url]);
      return { payment: again[0] };
    }
  }
  const { rows: u } = await pool.query("SELECT email, phone FROM users WHERE id = $1", [p.farmer_id]);
  const isFirst = pending.length === 0 && !(await pool.query(`SELECT 1 FROM gateway_payments WHERE reference = $1`, [p.reference])).rowCount;
  const payment = await createPayment({
    type: "share", userId: p.farmer_id, subjectId: p.id, netAmount: Number(p.total),
    meta: { quantity: p.quantity, purchaseReference: p.reference }, ...(isFirst ? { reference: p.reference } : {}),
  });
  const started = await startCheckout(payment, { email: paystackEmailFor(u[0] || {}), returnPath: `/dashboard/farmer?sharePayment=${encodeURIComponent(p.reference)}` });
  await pool.query(`UPDATE share_purchases SET authorization_url = $2, fee_amount = $3, amount_charged = $4 WHERE id = $1`, [p.id, started.authorization_url, payment.fee_amount, payment.gross_amount]);
  return { payment: started };
}

// Creates the shares for a verified payment: ONE row per share, inside the caller's
// transaction with the purchase locked, so verifying twice (double-click, page refresh,
// two tabs, webhook + return page together) can never create the shares twice.
async function createSharesForPurchase(client, purchase, providerReference) {
  for (let i = 0; i < purchase.quantity; i++) {
    await client.query(
      `INSERT INTO farmer_shares (reference, farmer_id, amount, duration_years, roi_pct, expires_at, purchase_id)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + make_interval(years => $4), $6)`,
      [generateReference(REF_PREFIX.share || "SHR"), purchase.farmer_id, purchase.unit_price, BUY_SHARE_LOCK_YEARS, YEAR_RATE_PCT[1], purchase.id]
    );
  }
  await client.query(
    `UPDATE share_purchases SET status = 'paid', paid_at = now(), provider_reference = $2 WHERE id = $1`,
    [purchase.id, providerReference || null]
  );
}

// Used by the simulated provider (local testing only).
async function fulfilSimulatedPurchase(purchaseId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM share_purchases WHERE id = $1 FOR UPDATE`, [purchaseId]);
    if (rows[0].status === "pending") await createSharesForPurchase(client, rows[0], "SIMULATED");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// What a verified Paystack payment means for a share purchase.
registerPaymentType("share", {
  async apply(payment, client) {
    const { rows } = await client.query("SELECT * FROM share_purchases WHERE id = $1 FOR UPDATE", [payment.subject_id]);
    const purchase = rows[0];
    if (!purchase) return { refuse: { reason: "purchase_missing" } };
    // The channel for expired or cancelled purchases is closed: money from a stale page is refused and returned.
    if (purchase.status === "expired") return { refuse: { reason: "purchase_expired" } };
    if (purchase.status === "cancelled") return { refuse: { reason: "purchase_cancelled" } };
    if (purchase.status === "paid") return { refuse: { reason: "duplicate_payment" } };

    await createSharesForPurchase(client, purchase, payment.provider_ref);
    const flags = [];
    const threshold = await reviewThreshold(client, "share_review_threshold");
    if (threshold !== null && Number(purchase.total) >= threshold) {
      flags.push({ kind: "review", reason: "large_purchase", detail: `purchase of ₦${Number(purchase.total).toLocaleString()} is above the review threshold` });
    }
    return {
      flags,
      after: async () => {
        const { rows: u } = await pool.query("SELECT name FROM users WHERE id = $1", [purchase.farmer_id]);
        await notifyUser(purchase.farmer_id, "share_receipt", {
          reference: purchase.reference, quantity: purchase.quantity, goodsTotal: Number(payment.net_amount),
          fee: Number(payment.fee_amount), amountCharged: Number(payment.gross_amount), paymentReference: payment.reference,
        });
        await notifyFinance("payment_finance_notice", {
          typeLabel: TYPE_LABEL.share, payer: u[0]?.name || "farmer", netAmount: Number(payment.net_amount), fee: Number(payment.fee_amount),
          grossAmount: Number(payment.gross_amount), reference: payment.reference, review: flags[0]?.detail || "",
        });
      },
    };
  },
});

// Settles every unfinished payment attempt for a purchase (webhook missed, two tabs...).
async function settleAttempts(purchase) {
  const { rows } = await pool.query(`SELECT reference FROM gateway_payments WHERE subject_id = $1 AND type = 'share' AND status IN ('initiated','pending')`, [purchase.id]);
  let unreachable = false;
  for (const g of rows) {
    const r = await verifyAndSettle(g.reference);
    if (r?.unreachable) unreachable = true;
  }
  return { unreachable };
}

// Step 2 — after paying (or any time the farmer asks "Check my payment"), the system
// verifies the payment itself: the farmer's word that they paid is never trusted. The
// answer is always a plain outcome the screen can explain:
//   success | pending | failed | refused | expired
export async function verifyPurchase(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM share_purchases WHERE reference = $1 AND farmer_id = $2`,
    [req.params.reference, req.user.id]
  );
  let purchase = rows[0];
  if (!purchase) return res.status(404).json({ error: "Purchase not found" });

  let unreachable = false;
  if (purchase.status === "pending") {
    if (purchase.provider === "paystack") {
      if (paystackConfigured()) unreachable = (await settleAttempts(purchase)).unreachable;
    } else if (purchase.provider === "simulated") {
      if (paymentProvider() !== "simulated") {
        return res.status(503).json({ error: "Simulated payments are disabled" });
      }
      await fulfilSimulatedPurchase(purchase.id);
    } else {
      return res.status(400).json({ error: "Unknown payment provider" });
    }
    purchase = (await pool.query(`SELECT * FROM share_purchases WHERE id = $1`, [purchase.id])).rows[0];
  }

  if (purchase.status === "paid") {
    const shares = await loadSharesWithWithdrawals(`purchase_id = $1 AND farmer_id = $2`, [purchase.id, req.user.id]);
    return res.json({ outcome: "success", purchase: mapPurchase(purchase), shares });
  }

  const { rows: pays } = await pool.query(
    `SELECT status, refusal_reason FROM gateway_payments WHERE subject_id = $1 AND type = 'share' ORDER BY created_at DESC`, [purchase.id]);
  const refused = pays.find((g) => g.status === "refused");
  let outcome = "pending";
  if (refused) outcome = "refused";
  else if (["expired", "cancelled"].includes(purchase.status)) outcome = "expired";
  else if (pays.length && pays.every((g) => g.status === "failed")) outcome = "failed";
  res.json({
    outcome, unreachable, purchase: mapPurchase(purchase), shares: [],
    refusalReason: refused?.refusal_reason || null,
    refusalText: refused?.refusal_reason ? refusalText(refused.refusal_reason) : null,
  });
}

// "Pay again": a new Paystack attempt for a purchase that is still open.
export async function payPurchase(req, res) {
  const { rows } = await pool.query(`SELECT * FROM share_purchases WHERE reference = $1 AND farmer_id = $2`, [req.params.reference, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: "Purchase not found" });
  if (rows[0].provider !== "paystack") return res.status(400).json({ error: "This purchase is not paid through Paystack" });
  if (!paystackConfigured()) return res.status(503).json({ error: "Online payment is unavailable right now. Please try again later." });
  const r = await startSharePayment(rows[0]);
  const purchase = (await pool.query("SELECT * FROM share_purchases WHERE id = $1", [rows[0].id])).rows[0];
  if (r.alreadyPaid) return res.json({ alreadyPaid: true, message: `Good news: ${purchase.reference} has already been paid, so nothing more is needed.`, purchase: mapPurchase(purchase) });
  res.json({ purchase: mapPurchase(purchase) });
}

export async function cancelPurchase(req, res) {
  const { rows } = await pool.query(`SELECT * FROM share_purchases WHERE reference = $1 AND farmer_id = $2`, [req.params.reference, req.user.id]);
  const purchase = rows[0];
  if (!purchase) return res.status(404).json({ error: "Purchase not found" });
  if (purchase.status !== "pending") return res.status(409).json({ error: "Only an unpaid purchase can be cancelled" });
  // If a payment actually went through, do not cancel: it is settled instead.
  if (purchase.provider === "paystack" && paystackConfigured()) await settleAttempts(purchase).catch(() => null);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`UPDATE share_purchases SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`, [purchase.id]);
    if (!rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Your payment has just been received, so this purchase can no longer be cancelled." }); }
    await client.query(`UPDATE gateway_payments SET status = 'abandoned', updated_at = now() WHERE subject_id = $1 AND type = 'share' AND status IN ('initiated','pending')`, [purchase.id]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  res.json({ ok: true });
}

// Unpaid purchases expire after 24 hours (scheduled job). A payment that did arrive is settled first.
export async function expireSharePurchases({ now = new Date() } = {}) {
  const { rows } = await pool.query(`SELECT * FROM share_purchases WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < $1`, [now]);
  let expired = 0, settled = 0;
  for (const p of rows) {
    if (p.provider === "paystack" && paystackConfigured()) await settleAttempts(p).catch(() => null);
    const { rowCount } = await pool.query(`UPDATE share_purchases SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [p.id]);
    if (rowCount) {
      expired++;
      await pool.query(`UPDATE gateway_payments SET status = 'abandoned', updated_at = now() WHERE subject_id = $1 AND type = 'share' AND status IN ('initiated','pending')`, [p.id]);
    } else settled++;
  }
  return { expired, settledBeforeExpiry: settled };
}

// ---------------------------------------------------------------------
// Withdrawals — always per share
// ---------------------------------------------------------------------

export async function withdrawInterest(req, res) {
  const { id } = req.params;
  const yearNum = Number(req.body?.year);
  if (!Number.isInteger(yearNum) || yearNum < 1) {
    return res.status(400).json({ error: "year must be a whole number, 1 or greater" });
  }

  const { rows: existing } = await pool.query(
    `SELECT * FROM farmer_shares WHERE id = $1 AND farmer_id = $2`,
    [id, req.user.id]
  );
  const share = existing[0];
  if (!share) return res.status(404).json({ error: "Share not found" });

  const yearEnds = addYears(share.purchased_at, yearNum);
  if (yearEnds > new Date()) {
    return res.status(400).json({ error: `Year ${yearNum}'s interest isn't unlocked yet` });
  }
  // After capital has been withdrawn the share stops earning: a year that
  // only finished AFTER the capital left was never earned.
  if (share.status === "capital_withdrawn" && share.capital_withdrawn_at && yearEnds > new Date(share.capital_withdrawn_at)) {
    return res.status(400).json({ error: `Year ${yearNum} finished after this share's capital was withdrawn, so it earned no interest` });
  }

  const annualInterest = Math.round(Number(share.amount) * (rateForYear(yearNum) / 100));
  try {
    const { rows } = await pool.query(
      `INSERT INTO share_interest_withdrawals (share_id, year_number, amount)
       VALUES ($1, $2, $3) RETURNING *`,
      [id, yearNum, annualInterest]
    );
    res.status(201).json({ withdrawal: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: `Year ${yearNum}'s interest has already been withdrawn` });
    }
    throw err;
  }
}

export async function withdrawCapital(req, res) {
  const { id } = req.params;
  const { rows: existing } = await pool.query(
    `SELECT * FROM farmer_shares WHERE id = $1 AND farmer_id = $2`,
    [id, req.user.id]
  );
  const share = existing[0];
  if (!share) return res.status(404).json({ error: "Share not found" });
  if (share.status === "capital_withdrawn") {
    return res.status(400).json({ error: "Capital has already been withdrawn from this share" });
  }
  const capitalUnlocksAt = addYears(share.purchased_at, BUY_SHARE_LOCK_YEARS);
  if (new Date() < capitalUnlocksAt) {
    return res.status(400).json({
      error: `Capital can't be withdrawn until ${capitalUnlocksAt.toISOString().slice(0, 10)} — a full 5 years after purchase`,
    });
  }
  // The status guard in the WHERE makes a double-click harmless.
  const { rows } = await pool.query(
    `UPDATE farmer_shares SET status = 'capital_withdrawn', capital_withdrawn_at = now()
     WHERE id = $1 AND status <> 'capital_withdrawn' RETURNING *`,
    [id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Capital has already been withdrawn from this share" });
  const { rows: withdrawals } = await pool.query(
    `SELECT * FROM share_interest_withdrawals WHERE share_id = $1`,
    [id]
  );
  res.json({ share: mapShare(rows[0], withdrawals) });
}

export const YEAR_RATES = YEAR_RATE_PCT;
export const LOCK_YEARS = BUY_SHARE_LOCK_YEARS;
