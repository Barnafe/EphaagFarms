import { pool } from "../db/pool.js";
import { generateReference, REF_PREFIX } from "../utils/reference.js";

// "Buy Share" (2026-08-13 spec, REWORKED 2026-08-29) — registered-farmer-only
// investment product, NOT the same as the general Investor role's
// Monthly/Bulk plans (investment_applications table). Per the user's
// explicit instruction, this now reuses "the same investment terms and
// conditions for ephaag" as that Investor module: Claude's interpretation
// of that phrase is the Investor Monthly plan's ROI table (10/20/30/40/50%
// cumulative over years 1-5) — which is exactly a flat, linear 10% of
// capital per completed year (10,20,30,40,50 are equal 10-point steps).
// Flagged to the user: this specific numeric read of "same terms" (as
// opposed to the Bulk plan's 20/25/30/35/50% table) hasn't been explicitly
// confirmed.
//
// Rules, as given: fixed ₦25,000 per share. Capital is locked and can
// NEVER be withdrawn before a full 5 years have passed — there's no more
// farmer-chosen term. Interest (10% of capital) becomes withdrawable once
// per completed year, starting after year 1, for years 1 through 5 —
// withdrawal is optional each year, not automatic. Interest is always
// calculated on the original capital only, never on any previously
// (un)withdrawn interest — simple, non-compounding.

const SHARE_PRICE = 25000;
const BUY_SHARE_LOCK_YEARS = 5;
const BUY_SHARE_ANNUAL_ROI_PCT = 10;

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
  const withdrawnYears = interestWithdrawals.map((w) => w.year_number);
  const annualInterest = Math.round(Number(s.amount) * (BUY_SHARE_ANNUAL_ROI_PCT / 100));

  const interestYears = [];
  for (let year = 1; year <= BUY_SHARE_LOCK_YEARS; year++) {
    const unlocked = elapsed >= year;
    interestYears.push({
      year,
      amount: annualInterest,
      unlocked,
      withdrawn: withdrawnYears.includes(year),
      withdrawable: unlocked && !withdrawnYears.includes(year) && s.status !== "capital_withdrawn",
    });
  }

  return {
    id: s.id,
    reference: s.reference,
    amount: Number(s.amount),
    annualRoiPct: BUY_SHARE_ANNUAL_ROI_PCT,
    annualInterest,
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
  const reference = generateReference(REF_PREFIX.share || "SHR");
  const { rows } = await pool.query(
    `INSERT INTO farmer_shares (reference, farmer_id, amount, duration_years, roi_pct, expires_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + make_interval(years => $4)) RETURNING *`,
    [reference, req.user.id, SHARE_PRICE, BUY_SHARE_LOCK_YEARS, BUY_SHARE_ANNUAL_ROI_PCT]
  );
  res.status(201).json({ share: mapShare(rows[0], []) });
}

export async function withdrawInterest(req, res) {
  const { id } = req.params;
  const { year } = req.body;
  const yearNum = Number(year);
  if (!yearNum || yearNum < 1 || yearNum > BUY_SHARE_LOCK_YEARS) {
    return res.status(400).json({ error: `year must be between 1 and ${BUY_SHARE_LOCK_YEARS}` });
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

  const annualInterest = Math.round(Number(share.amount) * (BUY_SHARE_ANNUAL_ROI_PCT / 100));
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

export const ROI_PCT = BUY_SHARE_ANNUAL_ROI_PCT;
export const PRICE = SHARE_PRICE;
export const LOCK_YEARS = BUY_SHARE_LOCK_YEARS;
