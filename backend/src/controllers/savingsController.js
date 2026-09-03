import { pool } from "../db/pool.js";
import { computeAndStoreIndices } from "../utils/indicesEngine.js";

// --- Farmer: view + deposit + withdraw --------------------------------
// Two accounts: "main" and "insurance". Every deposit auto-splits ₦500 to
// insurance, remainder to main. Insurance is never farmer-withdrawable —
// only the company (admin) can move it, as emergency/bridge assistance.
// Main-account withdrawals are farmer-requested, then Finance-approved.
// 2026-08-29: the "due date" rule is now pinned down — main savings can't
// be withdrawn at all until a full year has passed since the farmer's
// FIRST deposit (account-level maturity, not per-deposit) — see
// [[ephaag-farms-farmer-room-specs]] memory.

const DEPOSIT_WINDOW_START_DAY = 1;
const DEPOSIT_WINDOW_END_DAY = 5;
const MAIN_WITHDRAWAL_LOCK_YEARS = 1;

function isWithinDepositWindow() {
  // Test/ops-only escape hatch, server-side env var only — never
  // reachable via any client input, so farmers can't bypass the real
  // window. Lets the deposit flow be tested outside the 1st-5th without
  // weakening the actual business rule for real users.
  if (process.env.SAVINGS_DEPOSIT_WINDOW_OVERRIDE === "true") return true;
  const day = new Date().getDate();
  return day >= DEPOSIT_WINDOW_START_DAY && day <= DEPOSIT_WINDOW_END_DAY;
}

// Main savings can't be withdrawn until 1 full year after the farmer's
// FIRST-ever deposit — returns null (never unlocked) if they haven't saved
// anything yet.
async function mainWithdrawalUnlocksAt(userId) {
  const { rows } = await pool.query(
    `SELECT MIN(created_at) AS first_deposit FROM savings_deposits WHERE user_id = $1`,
    [userId]
  );
  const first = rows[0]?.first_deposit;
  if (!first) return null;
  const unlockDate = new Date(first);
  unlockDate.setFullYear(unlockDate.getFullYear() + MAIN_WITHDRAWAL_LOCK_YEARS);
  return unlockDate;
}

async function getBalances(userId) {
  const { rows: depositRows } = await pool.query(
    `SELECT
       COALESCE(SUM(main_portion), 0) AS main_total,
       COALESCE(SUM(insurance_portion), 0) AS insurance_total
     FROM savings_deposits WHERE user_id = $1`,
    [userId]
  );
  const { rows: withdrawalRows } = await pool.query(
    `SELECT account_type,
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid,
       COALESCE(SUM(amount) FILTER (WHERE status = 'requested'), 0) AS pending
     FROM savings_withdrawals WHERE user_id = $1 GROUP BY account_type`,
    [userId]
  );
  const w = { main: { paid: 0, pending: 0 }, insurance: { paid: 0, pending: 0 } };
  for (const row of withdrawalRows) {
    w[row.account_type] = { paid: Number(row.paid), pending: Number(row.pending) };
  }
  const mainTotal = Number(depositRows[0].main_total);
  const insuranceTotal = Number(depositRows[0].insurance_total);
  return {
    mainBalance: mainTotal - w.main.paid,
    mainAvailable: mainTotal - w.main.paid - w.main.pending,
    insuranceBalance: insuranceTotal - w.insurance.paid,
  };
}

export async function mySavings(req, res) {
  const balances = await getBalances(req.user.id);
  const unlocksAt = await mainWithdrawalUnlocksAt(req.user.id);
  const { rows: deposits } = await pool.query(
    `SELECT * FROM savings_deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  const { rows: withdrawals } = await pool.query(
    `SELECT * FROM savings_withdrawals WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({
    ...balances,
    mainWithdrawalUnlocksAt: unlocksAt,
    canWithdrawMain: !!unlocksAt && new Date() >= unlocksAt,
    depositWindowOpen: isWithinDepositWindow(),
    deposits: deposits.map((d) => ({
      id: d.id,
      amount: Number(d.amount),
      insurancePortion: Number(d.insurance_portion),
      mainPortion: Number(d.main_portion),
      createdAt: d.created_at,
    })),
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      accountType: w.account_type,
      amount: Number(w.amount),
      status: w.status,
      requestedAt: w.requested_at,
      handledAt: w.handled_at,
    })),
  });
}

export async function deposit(req, res) {
  const { amount } = req.body;
  const amt = Number(amount);

  if (!isWithinDepositWindow()) {
    return res.status(400).json({
      error: `Deposits are only accepted between the ${DEPOSIT_WINDOW_START_DAY}st and ${DEPOSIT_WINDOW_END_DAY}th of each month`,
    });
  }
  if (!amt || amt < 2500) {
    return res.status(400).json({ error: "Minimum deposit is ₦2,500" });
  }
  if (amt % 500 !== 0) {
    return res.status(400).json({ error: "Amount must end in 500" });
  }

  const insurancePortion = 500;
  const mainPortion = amt - insurancePortion;

  try {
    const { rows } = await pool.query(
      `INSERT INTO savings_deposits (user_id, amount, insurance_portion, main_portion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, amt, insurancePortion, mainPortion]
    );
    const balances = await getBalances(req.user.id);
    // Real-time indices recompute (2026-08-11 spec) — fire-and-forget,
    // never blocks the deposit response.
    computeAndStoreIndices(req.user.id).catch((err) => console.error("indices recompute failed", err));
    res.status(201).json({
      deposit: {
        id: rows[0].id,
        amount: amt,
        insurancePortion,
        mainPortion,
        createdAt: rows[0].created_at,
      },
      ...balances,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not record deposit" });
  }
}

export async function requestWithdrawal(req, res) {
  const { amount } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "amount is required" });

  const unlocksAt = await mainWithdrawalUnlocksAt(req.user.id);
  if (!unlocksAt || new Date() < unlocksAt) {
    return res.status(400).json({
      error: unlocksAt
        ? `Your savings capital can't be withdrawn until ${unlocksAt.toISOString().slice(0, 10)} — a full year after your first deposit`
        : "You don't have any savings deposits yet",
    });
  }

  const { mainAvailable } = await getBalances(req.user.id);
  if (amt > mainAvailable) {
    return res.status(400).json({ error: "Amount exceeds your available main savings balance" });
  }

  const { rows } = await pool.query(
    `INSERT INTO savings_withdrawals (user_id, account_type, amount)
     VALUES ($1, 'main', $2) RETURNING *`,
    [req.user.id, amt]
  );
  res.status(201).json({ withdrawal: rows[0] });
}

// --- Admin (Finance): review main-savings withdrawal requests ------------

export async function adminListSavings(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name AS farmer_name,
            COALESCE(d.main_total, 0) AS main_total,
            COALESCE(d.insurance_total, 0) AS insurance_total
     FROM users u
     LEFT JOIN (
       SELECT user_id, SUM(main_portion) AS main_total, SUM(insurance_portion) AS insurance_total
       FROM savings_deposits GROUP BY user_id
     ) d ON d.user_id = u.id
     WHERE u.role_type = 'farmer' AND (d.main_total IS NOT NULL OR d.insurance_total IS NOT NULL)
     ORDER BY u.name ASC`
  );
  const { rows: withdrawals } = await pool.query(
    `SELECT sw.*, u.name AS farmer_name FROM savings_withdrawals sw
     JOIN users u ON u.id = sw.user_id
     ORDER BY sw.requested_at DESC`
  );
  res.json({
    farmers: rows.map((r) => ({
      userId: r.user_id,
      farmerName: r.farmer_name,
      mainTotal: Number(r.main_total),
      insuranceTotal: Number(r.insurance_total),
    })),
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      userId: w.user_id,
      farmerName: w.farmer_name,
      accountType: w.account_type,
      amount: Number(w.amount),
      status: w.status,
      requestedAt: w.requested_at,
      handledAt: w.handled_at,
    })),
  });
}

export async function adminDecideWithdrawal(req, res) {
  const { id } = req.params;
  const { decision } = req.body;
  if (!["paid", "declined"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'paid' or 'declined'" });
  }
  const { rows } = await pool.query(
    `UPDATE savings_withdrawals SET status = $1, handled_at = now(), handled_by = $2
     WHERE id = $3 AND status = 'requested' RETURNING *`,
    [decision, req.user.id, id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Withdrawal not found or already handled" });
  res.json({ withdrawal: rows[0] });
}

// Company applying insurance funds as emergency/bridge assistance — this
// is never farmer-initiated, so admin creates an already-'paid' row
// directly rather than going through the request/approve flow.
export async function adminApplyInsurance(req, res) {
  const { userId, amount, note } = req.body;
  const amt = Number(amount);
  if (!userId || !amt || amt <= 0) {
    return res.status(400).json({ error: "userId and a positive amount are required" });
  }
  const { insuranceBalance } = await getBalances(userId);
  if (amt > insuranceBalance) {
    return res.status(400).json({ error: "Amount exceeds that farmer's insurance balance" });
  }
  const { rows } = await pool.query(
    `INSERT INTO savings_withdrawals (user_id, account_type, amount, status, note, handled_at, handled_by)
     VALUES ($1, 'insurance', $2, 'paid', $3, now(), $4) RETURNING *`,
    [userId, amt, note || null, req.user.id]
  );
  res.status(201).json({ withdrawal: rows[0] });
}

export { getBalances };
