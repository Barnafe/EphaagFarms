# 2026-10-20 — Banner alignment + payment audit

The approved financing banner is the source of truth for farmer loans, savings levels and shares.

## Banner alignment
- **Farmers' shares**: fixed ₦25,000 per share; 20/30/35/40/45% for years 1-5 (flat 45% after year 5); each share is its own record (own interest, withdrawals, capital). No agreement: checkout -> pay -> system verifies -> redirect to share details. Direct "create share" endpoint removed. Paystack when `PAYSTACK_SECRET_KEY` is set, else a labelled simulated payment (`PAYMENT_ALLOW_SIMULATED=false` disables it).
- **LT1 Progressive Savings Loan**: six fixed levels (savings -> loan, months); level advances when a loan is fully repaid and verified; capped at level 6.
- **LT2 Business Boost**: deposits/loans limited to 12.5k->50k, 25k->100k, 50k->200k, 75k->300k; 5 months.
- **LT3 Business Enlargement**: loans 100k/200k/300k; repay double (was not counted in the repayment tracker); 8 months.
- Public Farmer Financing page, loan forms and labels now read from `frontend/src/data/financingBanner.js`.

## Payment bugs fixed
Investor: bad `paymentMode`/amount returned a 500 (now a clear 400); bulk plans stored a stray mode; a second application hid the active plan's schedule; "most recent application" was ordered by a random UUID (added `created_at`); logging payments worked on non-active plans; underpayments accepted; the next due amount copied the last typed amount; paying on the due date could count as late; double-clicks could log a month twice; schedule never stopped at the plan term.
Loans: repayments accepted negative/zero/non-numeric/over-the-balance amounts; LT3's 100% interest ignored in repayment progress; repeated applications of the same loan type; the UI never let a farmer apply again after a completed loan.
Finance department: transfers CREDITED the source account (money created); negative amounts accepted on deposits, withdrawals, transfers, payables, receivables, payments; completing a payment twice double-debited the account and double-counted the payable; withdrawals/transfers/payments could overdraw an account; overpaying payables/receivables.
Buyers: negative order quantities increased the standing balance; standing commitment could be re-set repeatedly for a free refill; balance deduction was not atomic.
Finance dashboard: pending investment count always 0 (wrong status). Settlement "mark paid" could be applied twice.
