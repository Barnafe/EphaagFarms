import { pool } from "../db/pool.js";
import { getSetting } from "../utils/settings.js";

// Late share payments are NOT refused: the shareholder is told the fee, agrees, and pays.
//   fee      = share amount x 2% per month, spread per day (2% / 30 per day), whole days late,
//              counted from the day the purchase fell due, no grace before it starts
//   after one complete month (30 days) the fee stops growing
//   then a 10-day grace period to pay (share price + the capped fee), otherwise the share is lost completely
export const DEFAULT_LATE_CONFIG = Object.freeze({ percentPerMonth: 2, capDays: 30, graceDays: 10 });
const DAY = 24 * 3600 * 1000;

export async function getLateConfig(runner = pool) {
  const [percent, capDays, graceDays] = await Promise.all([
    getSetting("share_late_percent", DEFAULT_LATE_CONFIG.percentPerMonth, runner),
    getSetting("share_late_cap_days", DEFAULT_LATE_CONFIG.capDays, runner),
    getSetting("share_grace_days", DEFAULT_LATE_CONFIG.graceDays, runner),
  ]);
  return { percentPerMonth: Number(percent), capDays: Number(capDays), graceDays: Number(graceDays) };
}

/** Where a share purchase stands today: on_time | late | grace | closed (| the purchase's own status if not pending). */
export function lateStatus(purchase, cfg = DEFAULT_LATE_CONFIG, now = new Date()) {
  const total = Number(purchase.total);
  if (purchase.status !== "pending") return { state: purchase.status, daysLate: 0, lateFee: 0, total, amountDue: total };
  if (!purchase.expires_at) return { state: "on_time", daysLate: 0, lateFee: 0, total, amountDue: total };
  const due = new Date(purchase.expires_at);
  if (now.getTime() <= due.getTime()) return { state: "on_time", daysLate: 0, lateFee: 0, total, amountDue: total, dueAt: due };

  const daysLate = Math.ceil((now.getTime() - due.getTime()) / DAY); // 1 from the first moment after it fell due
  const feeDays = Math.min(daysLate, cfg.capDays);
  const lateFee = Math.round(total * (cfg.percentPerMonth / 100) * (feeDays / 30) * 100) / 100;
  const feeStopsAt = new Date(due.getTime() + cfg.capDays * DAY);
  const graceEndsAt = new Date(due.getTime() + (cfg.capDays + cfg.graceDays) * DAY);
  let state = "late";
  if (daysLate > cfg.capDays) state = now.getTime() <= graceEndsAt.getTime() ? "grace" : "closed";
  return {
    state, daysLate, feeDays, lateFee, total, amountDue: Math.round((total + lateFee) * 100) / 100,
    feeStopsGrowing: daysLate >= cfg.capDays, feeStopsAt, graceEndsAt, dueAt: due,
    percentPerMonth: cfg.percentPerMonth, graceDays: cfg.graceDays,
  };
}
