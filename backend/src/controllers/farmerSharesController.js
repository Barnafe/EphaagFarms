import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";

// "Buy Share" — registered-farmer-only investment product, NOT the same as
// the general Investor role's Monthly/Bulk plans (investment_applications
// table). REWORKED again (2026-09-02) per explicit instruction: farmers
// are "one of us" and get materially better, farmer-specific terms —
// no longer the same flat 10%/yr schedule reused from the Investor module.
//
// Rules, as given:
// - No more fixed price. A share can be bought for any amount from a
//   minimum of ₦2,500 upward (previously a fixed ₦25,000).
// - Capital is locked and can NEVER be withdrawn before a full 5 years
//   have passed from purchase.
// - Interest is a TIERED annual rate applied to the ORIGINAL capital only
//   (never compounding, never calculated on previously withdrawn or
//   unwithdrawn interest): year 1 = 10%, year 2 = 30%, year 3 = 35%,
//   year 4 = 40%, year 5 = 45%. If the farmer doesn't withdraw capital at
//   the 5-year mark and effectively "renews" by leaving it in, the rate
//   holds flat at 45% for every year after year 5 — it never resets or
//   climbs further.
// - Interest for a given year becomes withdrawable once that year is
//   fully elapsed, and withdrawal is optional/once per year — if a
//   farmer skips withdrawing a year's interest, it just sits there; it is
//   never folded into the calculation for any other year.
// - The share's yearly figures ("expected interest") update on their own
//   the moment each year's anniversary passes — interestYears below is
//   recomputed from the purchase date on every read, not stored.

const MIN_SHARE_AMOUNT = 2500;
const BUY_SHARE_LOCK_YEARS = 5;

// Year 1-5 tiered rate; anything beyond year 5 stays flat at the year-5 rate.
const YEAR_RATE_PCT = { 1: 10, 2: 30, 3: 35, 4: 40, 5: 45 };
const MAX_TABLED_YEAR = 5;
const FLAT_RATE_AFTER_YEAR_5 = YEAR_RATE_PCT[MAX_TABLED_YEAR];

function rateForYear(year) {
  return YEAR_RATE_PCT[year] ?? FLAT_RATE_AFTER_YEAR_5;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function yearsElapsed(purchasedAt) {
  const ms = Date.now() - new Date(purchasedAt).getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

function mapShare(s, interestWithdrawals) {
  const capitalUnlocksAt = addYears(s.purchased_at, BUY_SHARE_LOCK_YEARS);
  const elapsed = yearsElapsed(s.purchased_at);
  const completedYears = Math.floor(elapsed);
  const withdrawnYears = interestWithdrawals.map((w) => w.year_number);
  const amount = Number(s.amount);

  // Show every completed year (so history never disappears), plus the
  // single next year that's still counting down — this is what makes the
  // "expected interest" auto-update the moment a year's anniversary passes,
  // and keeps growing past year 5 for as long as the share stays active.
  const maxYearToShow = Math.max(
    MAX_TABLED_YEAR,
    completedYears + 1,
    ...(withdrawnYears.length ? withdrawnYears : [0])
  );

  const interestYears = [];
  for (let year = 1; year <= maxYearToShow; year++) {
    const unlocked = elapsed >= year;
    const pct = rateForYear(year);
    interestYears.push({
      year,
      pct,
      amount: Math.round(amount * (pct / 100)),
      unlocked,
      withdrawn: withdrawnYears.includes(year),
      withdrawable: unlocked && !withdrawnYears.includes(year) && s.status !== "capital_withdrawn",
    });
  }

  // "Current"/next-due figures for a quick-glance summary on the card.
  const currentYearNumber = Math.min(Math.max(completedYears, 1), maxYearToShow);
  const currentYearPct = rateForYear(currentYearNumber);

  return {
    id: s.id,
    reference: s.reference,
    amount,
    currentYearPct,
    currentYearInterest: Math.round(amount * (currentYearPct / 100)),
    purchasedAt: s.purchased_at,
    capitalUnlocksAt,
    capitalWithdrawable: s.status !== "capital_withdrawn" && new Date() >= capitalUnlocksAt,
    status: s.status,
    capitalWithdrawnAt: s.capital_withdrawn_at,
    interestYears,
    totalInterestWithdrawn: interestWithdrawals.reduce((sum, w) => sum + Number(w.amount), 0),
  };
}

export async function myShares(req, res) {
  const { rows: shares } = await pool.query(
    `SELECT * FROM farmer_shares WHERE farmer_id = $1 ORDER BY purchased_at DESC`,
    [req.user.id]
  );
  const { rows: withdrawals } = await pool.query(
    `SELECT * FROM share_interest_withdrawals WHERE share_id = ANY($1::uuid[])`,
    [shares.map((s) => s.id)]
  );
  res.json({
    shares: shares.map((s) => mapShare(s, withdrawals.filter((w) => w.share_id === s.id))),
  });
}

export async function buyShare(req, res) {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < MIN_SHARE_AMOUNT) {
    return res.status(400).json({ error: `A share is a minimum of ₦${MIN_SHARE_AMOUNT.toLocaleString()}` });
  }

  const reference = generateReference(REF_PREFIX.share || "SHR");
  // roi_pct stores the year-1 rate purely for reference/legacy display —
  // the real tiered schedule always comes from YEAR_RATE_PCT in this file,
  // never from this column.
  const { rows } = await pool.query(
    `INSERT INTO farmer_shares (reference, farmer_id, amount, duration_years, roi_pct, expires_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + make_interval(years => $4)) RETURNING *`,
    [reference, req.user.id, amount, BUY_SHARE_LOCK_YEARS, YEAR_RATE_PCT[1]]
  );
  res.status(201).json({ share: mapShare(rows[0], []) });
}

export async function withdrawInterest(req, res) {
  const { id } = req.params;
  const { year } = req.body;
  const yearNum = Number(year);
  if (!yearNum || yearNum < 1) {
    return res.status(400).json({ error: "year must be 1 or greater" });
  }

  const { rows: existing } = await pool.query(
    `SELECT * FROM farmer_shares WHERE id = $1 AND farmer_id = $2`,
    [id, req.user.id]
  );
  const share = existing[0];
  if (!share) return res.status(404).json({ error: "Share not found" });

  const elapsed = yearsElapsed(share.purchased_at);
  if (elapsed < yearNum) {
    return res.status(400).json({ error: `Year ${yearNum}'s interest isn't unlocked yet` });
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
    console.error(err);
    res.status(500).json({ error: "Could not withdraw interest" });
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
  const { rows } = await pool.query(
    `UPDATE farmer_shares SET status = 'capital_withdrawn', capital_withdrawn_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  const { rows: withdrawals } = await pool.query(
    `SELECT * FROM share_interest_withdrawals WHERE share_id = $1`,
    [id]
  );
  res.json({ share: mapShare(rows[0], withdrawals) });
}

export const YEAR_RATES = YEAR_RATE_PCT;
export const MIN_AMOUNT = MIN_SHARE_AMOUNT;
export const LOCK_YEARS = BUY_SHARE_LOCK_YEARS;
