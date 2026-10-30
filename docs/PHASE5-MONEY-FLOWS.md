# Phase 5: money flows (v38)

Every naira in goes through Paystack (the payer adds Paystack's fee) and every naira out goes by Paystack transfer once the last approval is given. Nothing is typed in and nothing waits for a person to "verify" or "disburse", apart from real exceptions, which notify the admins.

## Money in
| What | How |
|---|---|
| Savings deposit | `POST /api/farmers/me/savings/deposit {amount}` returns a Paystack page (same rules as before: 1st-5th, at least 2,500, multiples of 500). The deposit is recorded only when Paystack confirms, once. |
| Loan repayment | `POST /api/loans/:id/repay {amount}`: **any part**, at least 100, never more than what is still owed (the error shows the most that can be paid). Two instalments covering the same balance: the second is refused as a surplus and waits in the Refund room. Recorded and verified automatically. |
| Boost Cash deposit | declare as before, then `POST /api/loans/boost-deposits/:id/pay`. Paystack's confirmation marks it paid **and** verified (the one-month wait starts then). |
Retired (410): typed-in repayment log, repayment verify, Boost deposit verify, manual disburse, "mark farmer settlement paid".
"Never beyond the loan duration" is read as: you can never pay more than the loan owes. Savings deposits keep their existing rules (any amount that fits them).

## Bank account (money out needs one)
`/api/bank-account`: choose the bank, enter the 10-digit number once; **Paystack confirms the account name** and creates the transfer recipient. Only the last 4 digits are ever shown again. Farmers (Profile) and investors (Profile) have the card. A payout with no bank account waits (`held`) and the person is told; it is sent as soon as they add one.

## Money out (payouts)
One engine (`services/payouts.js`, table `payouts`, one row per loan / withdrawal / ROI record so nothing is paid twice):
* **Loan disbursement**: created at 3EI Governance final approval (a Boost Cash loan also needs its verified deposit). The loan becomes `disbursed` only when the transfer succeeds.
* **Savings withdrawal**: Finance's approval is the last step; it then becomes `approved` and `paid` when the transfer succeeds.
* **Share interest / capital**: **no approval**. Asking is enough (the existing due-date rules still apply) and the payout is created immediately.
* **ROI payout**: when Finance approves it, net of any late-payment penalty.
* **Produce settlement** (farmers sourced by Procurement): created when the sourcing is saved.
Safeguards (admin, **Admin Hub > Payouts**): a **pause switch** (nothing is sent while on) and a **daily cap** (the rest is held until tomorrow or the cap is raised; admins are told). Sent by the job `run-payouts` every 2 minutes and immediately after approval.
Failures: a failed transfer (for example an empty Paystack balance) alerts every admin and tells the person it is delayed, stays visible under Payouts > Failed and can be retried with one click (new Paystack reference). If Paystack cannot be reached nothing is lost: the payout goes back in the queue. A lost webhook is covered by a re-check of transfers pending for over 2 minutes. Transfer webhooks use the same signed shared webhook as payments (`transfer.success|failed|reversed`).

## Tests
`backend/test/api/money-flows.test.mjs` (10 tests), the ROI payout assertions in `payments-investments.test.mjs`, and browser journeys 15 and 16. The Paystack stand-in simulates banks, account resolution and transfers (`/__transfermode`: success, pending, fail, down).

## Before going live
* Paystack **transfers must be enabled** on the account and the balance funded. Switch off OTP confirmation for transfers (Paystack dashboard > Settings > Preferences) or transfers stay pending.
* Payouts need the live Paystack key; Finance should keep an eye on the balance (a failed payout says why).
