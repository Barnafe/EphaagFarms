// Phase 5, money in: savings deposits, loan repayments and Boost Cash deposits are paid through Paystack only
// (the payer adds Paystack's fee). Nothing is typed in and nothing waits for a person to verify it.
import { pool } from "../db/pool.js";
import { paystackConfigured } from "./paystack.js";
import { createPayment, startCheckout, verifyAndSettle, registerPaymentType } from "./payments.js";
import { computeAndStoreIndices } from "../utils/indicesEngine.js";
import { createPayout } from "./payouts.js";

const httpError = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, expose: true, ...extra });
const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function emailFor(u) {
  if (u.email) return u.email;
  return `${String(u.phone || u.id).replace(/[^a-z0-9]/gi, "")}@${process.env.FARMER_PLACEHOLDER_EMAIL_DOMAIN || "farmers.ephaag.app"}`;
}
async function checkout(user, payment, returnPath) {
  const { rows } = await pool.query("SELECT id, email, phone FROM users WHERE id = $1", [user.id]);
  const started = await startCheckout(payment, { email: emailFor(rows[0] || {}), returnPath: returnPath(payment) });
  return { reference: started.reference, authorizationUrl: started.authorization_url, amount: Number(started.net_amount), fee: Number(started.fee_amount), total: Number(started.gross_amount) };
}
const needPaystack = () => { if (!paystackConfigured()) throw httpError("Online payment is unavailable right now. Please try again later.", 503); };

/** A payment still open for the same thing: reuse its page instead of creating a second one. */
async function openPayment(type, subjectId, net) {
  const { rows } = await pool.query(
    `SELECT * FROM gateway_payments WHERE type = $1 AND subject_id = $2 AND status IN ('initiated','pending') AND net_amount = $3 AND authorization_url IS NOT NULL AND created_at > now() - interval '1 hour' ORDER BY created_at DESC LIMIT 1`, [type, subjectId, net]);
  if (!rows[0]) return null;
  const p = rows[0];
  return { reference: p.reference, authorizationUrl: p.authorization_url, amount: Number(p.net_amount), fee: Number(p.fee_amount), total: Number(p.gross_amount), reused: true };
}
const settleOpen = async (type, subjectId) => {
  const { rows } = await pool.query(`SELECT reference FROM gateway_payments WHERE type = $1 AND subject_id = $2 AND status IN ('initiated','pending')`, [type, subjectId]);
  for (const r of rows) await verifyAndSettle(r.reference).catch(() => null);
};

// ---------------------------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------------------------
registerPaymentType("savings", {
  async apply(gp, client) {
    const amt = Number(gp.net_amount);
    if (!(amt >= 2500) || amt % 500 !== 0) return { refuse: { reason: "amount_mismatch" } };
    await client.query(`INSERT INTO savings_deposits (user_id, amount, insurance_portion, main_portion) VALUES ($1,$2,500,$3)`, [gp.user_id, amt, amt - 500]);
    return { after: async () => { computeAndStoreIndices(gp.user_id).catch(() => {}); } };
  },
});
export async function startSavingsPayment(user, amount, windowOpen) {
  needPaystack();
  const amt = Number(amount);
  if (!windowOpen) throw httpError("Deposits are only accepted between the 1st and 5th of each month");
  if (!Number.isFinite(amt) || amt < 2500) throw httpError("Minimum deposit is ₦2,500");
  if (amt % 500 !== 0) throw httpError("Amount must end in 500");
  const reuse = await openPayment("savings", user.id, amt);
  if (reuse) return reuse;
  const payment = await createPayment({ type: "savings", userId: user.id, subjectId: user.id, netAmount: amt, meta: { account: "main" } });
  return checkout(user, payment, (p) => `/dashboard/farmer?savingsPayment=${encodeURIComponent(p.reference)}`);
}

// ---------------------------------------------------------------------------------------------
// Loan repayments: any part, never more than what is still owed
// ---------------------------------------------------------------------------------------------
async function loanBalance(runner, loan) {
  const { rows } = await runner.query(`SELECT COALESCE(SUM(amount),0) AS paid FROM loan_repayments WHERE loan_id = $1`, [loan.id]);
  const owed = loan.loan_type === "business_fast_cash" ? Number(loan.amount) * (1 + Number(loan.interest_rate ?? 100) / 100) : Number(loan.amount);
  return { owed, paid: Number(rows[0].paid), outstanding: Math.round((owed - Number(rows[0].paid)) * 100) / 100 };
}
registerPaymentType("repayment", {
  async apply(gp, client) {
    const { rows } = await client.query(`SELECT * FROM loans WHERE id = $1 FOR UPDATE`, [gp.subject_id]);
    const loan = rows[0];
    if (!loan || loan.status !== "disbursed") return { refuse: { reason: "loan_closed" } };
    const b = await loanBalance(client, loan);
    if (b.outstanding <= 0) return { refuse: { reason: "loan_closed" } };
    if (Number(gp.net_amount) > b.outstanding + 0.001) return { refuse: { reason: "amount_exceeds_balance" } };
    await client.query(`INSERT INTO loan_repayments (loan_id, amount, method, verified, gateway_reference, paid_via) VALUES ($1,$2,'paystack',TRUE,$3,'paystack')`, [loan.id, gp.net_amount, gp.reference]);
    return { after: async () => { computeAndStoreIndices(loan.farmer_id).catch(() => {}); } };
  },
});
export async function startRepaymentPayment(user, loanId, amount) {
  needPaystack();
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt < 100) throw httpError("Enter the amount you want to pay (at least ₦100).");
  const { rows } = await pool.query(`SELECT * FROM loans WHERE id = $1 AND farmer_id = $2`, [loanId, user.id]);
  const loan = rows[0];
  if (!loan) throw httpError("Loan not found", 404);
  if (loan.status !== "disbursed") throw httpError("This loan isn't active yet", 409);
  await settleOpen("repayment", loan.id);   // money may already have arrived: apply it first
  const b = await loanBalance(pool, loan);
  if (b.outstanding <= 0) throw httpError("This loan has already been fully repaid", 409);
  if (amt > b.outstanding) throw httpError(`That's more than the ${naira(b.outstanding)} still outstanding on this loan. The most you can pay is ${naira(b.outstanding)}.`, 400, { outstanding: b.outstanding });
  const reuse = await openPayment("repayment", loan.id, amt);
  if (reuse) return reuse;
  const payment = await createPayment({ type: "repayment", userId: user.id, subjectId: loan.id, netAmount: amt, meta: { loanId: loan.id } });
  return { ...(await checkout(user, payment, (p) => `/dashboard/farmer?repaymentPayment=${encodeURIComponent(p.reference)}`)), outstandingAfter: Math.round((b.outstanding - amt) * 100) / 100 };
}

// ---------------------------------------------------------------------------------------------
// Boost Cash deposit
// ---------------------------------------------------------------------------------------------
registerPaymentType("boost_deposit", {
  async apply(gp, client) {
    const { rows } = await client.query(`SELECT * FROM boost_cash_deposits WHERE id = $1 FOR UPDATE`, [gp.subject_id]);
    const d = rows[0];
    if (!d) return { refuse: { reason: "purchase_missing" } };
    if (d.paid_at) return { refuse: { reason: "duplicate_payment" } };
    await client.query(`UPDATE boost_cash_deposits SET paid_at = now(), verified_at = now(), gateway_reference = $2 WHERE id = $1`, [d.id, gp.reference]);
    return {};
  },
});
export async function startBoostPayment(user, depositId) {
  needPaystack();
  const { rows } = await pool.query(`SELECT * FROM boost_cash_deposits WHERE id = $1 AND farmer_id = $2`, [depositId, user.id]);
  const d = rows[0];
  if (!d) throw httpError("Deposit not found", 404);
  await settleOpen("boost_deposit", d.id);
  const { rows: again } = await pool.query(`SELECT paid_at FROM boost_cash_deposits WHERE id = $1`, [d.id]);
  if (again[0].paid_at) throw httpError("This deposit has already been paid", 409);
  const reuse = await openPayment("boost_deposit", d.id, Number(d.deposit_amount));
  if (reuse) return reuse;
  const payment = await createPayment({ type: "boost_deposit", userId: user.id, subjectId: d.id, netAmount: Number(d.deposit_amount), meta: { depositId: d.id } });
  return checkout(user, payment, (p) => `/dashboard/farmer?boostPayment=${encodeURIComponent(p.reference)}`);
}

// ---------------------------------------------------------------------------------------------
// A loan is paid out when its last approval is given (a Boost Cash loan also needs its deposit)
// ---------------------------------------------------------------------------------------------
export async function queueLoanPayout(loan, runner = pool) {
  if (loan.loan_type === "boost_cash" && !loan.deposit_verified) return null;
  const r = await createPayout({ kind: "loan_disbursement", userId: loan.farmer_id, subjectId: loan.id, amount: Number(loan.amount), meta: { reference: loan.reference }, runner });
  return r.payout; // the caller starts the sending once its transaction is committed
}
