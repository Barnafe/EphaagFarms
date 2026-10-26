// The approved EPHAAG financing banner — the single source of truth for
// farmer loan, savings and share figures on the frontend. These mirror the
// backend (loanController.js / farmerSharesController.js); if the banner
// ever changes, change both places together.

export const naira = (n) => `₦${Number(n || 0).toLocaleString()}`;

// --- Section A: loans ------------------------------------------------------
export const LOAN_TYPE_LABELS = {
  aided: "LT1 · Progressive Savings Loan",
  boost_cash: "LT2 · Business Boost",
  business_fast_cash: "LT3 · Business Enlargement",
};

// LT1 — 0% interest. savings -> loan, repayment months.
export const AIDED_LEVELS = [
  { level: 1, savings: 10000, loan: 20000, months: 5 },
  { level: 2, savings: 20000, loan: 40000, months: 8 },
  { level: 3, savings: 30000, loan: 60000, months: 10 },
  { level: 4, savings: 40000, loan: 120000, months: 12 },
  { level: 5, savings: 50000, loan: 150000, months: 12 },
  { level: 6, savings: 60000, loan: 180000, months: 12 },
];

// LT2 — 25% deposit, 1-90 day maturity period, 5-month repayment.
export const BOOST_TIERS = [
  { deposit: 12500, loan: 50000 },
  { deposit: 25000, loan: 100000 },
  { deposit: 50000, loan: 200000 },
  { deposit: 75000, loan: 300000 },
];
export const BOOST_MONTHS = 5;

// LT3 — 100% interest (repay double), 8-month repayment, faithful participants only.
export const FAST_CASH_TIERS = [
  { loan: 100000, repay: 200000 },
  { loan: 200000, repay: 400000 },
  { loan: 300000, repay: 600000 },
];
export const FAST_CASH_MONTHS = 8;

// --- Section B: farmers' shares ---------------------------------------------
export const SHARE_PRICE = 25000;
export const SHARE_LOCK_YEARS = 5;
export const SHARE_YEAR_RATES = [20, 30, 35, 40, 45]; // Yr1..Yr5, % of capital
export const MAX_SHARES_PER_PURCHASE = 10;
export const SHARE_TABLE_ROWS = [1, 2, 3, 4, 5, 10]; // the banner's rows

export function shareRow(count) {
  const capital = count * SHARE_PRICE;
  const years = SHARE_YEAR_RATES.map((pct) => Math.round(capital * (pct / 100)));
  const totalRoi = years.reduce((a, b) => a + b, 0);
  return { count, capital, years, totalRoi, payout: capital + totalRoi };
}
