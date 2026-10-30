# Phase 4: investor payments (v35)

Every investor payment goes through Paystack. The payer covers Paystack's processing fee on top (same as buyers, farmers and corps members).

## Flow
1. The investor applies (monthly or bulk) and picks a payment mode (monthly only): **auto** (saved card) or **manual** (Pay now each month).
2. Finance reviews, the agreement is signed and uploaded, Finance gives the final approval. **The application now moves to `awaiting_payment`; it is no longer activated by Finance.**
3. The investor pays online: the one-time amount (bulk) or the **first month** (monthly). The verified payment **activates** the investment: ROI schedule created; for monthly plans month 1 is recorded as paid and month 2 falls due one month later. Receipt by email/SMS; Finance is notified like every other payment.
4. Monthly plans, each later month:
   * **Pay now**: the investor pays the month due through Paystack (`POST /api/investments/me/pay`).
   * **Automatic**: the job `investment-auto-charge` (daily 07:00) charges the saved card on the due date. One attempt only. A decline (or no saved card) tells the investor on all channels and Finance by email straight away; **no retry**, the investor uses Pay now. If Paystack cannot be reached it is not treated as a decline and is retried on the next run.
   * The card (Paystack's reusable token, never the card number) is saved only when the plan is in automatic mode and the investor pays by card. Switch mode or remove the card any time (`PATCH /me/payment-mode`, `DELETE /me/card`).
5. Money rules: a second payment for the same month/activation is refused as a duplicate; a wrong amount is refused with a reason; a payment that arrives for a rejected application is refused (`investment_closed`). Refused money waits under "Needs attention" in the Refund room. The typed-in "log payment" endpoint is gone (410).

## Late monthly payments: notices and the 2% penalty
* **Notices (email + SMS)**: one **2 days before** the due date (warning of the penalty), then **every day** after the due date until it is paid. Job `investment-reminders` (daily 08:00); "Run reminder check now" in Finance runs it on demand.
* **Penalty**: after the due date the system charges **2% of the overdue share's capital** (the plan's monthly amount, e.g. 2% of ₦10,000 = ₦200), **once for each month (30 days) the payment stays unpaid**, until the investor pays. Paying stops it; what was already charged stays owed. Job `investment-late-penalties` (daily 06:30, also run before the daily notices). The percent is the setting `investment_late_penalty_percent` (default 2).
* **Collection**: never charged to a card. It is **deducted from the investor's ROI payout** when Finance approves it (oldest penalty first). Finance sees the deduction before approving; anything a payout cannot cover carries to the next payout. Investor sees the overdue banner, the penalty so far, and the deduction on the ROI table. Bulk plans have no monthly penalties.

## Exception: payment received outside Paystack
Admin only (`POST /api/investments/applications/:id/record-offline`, blocked while acting as a department). A written reason is required. It records the amount with no fee against the current obligation (activation or the oldest month due), flags it for review, and every admin is told. Shown in the Finance > Investments tab.

## Tests
`backend/test/api/payments-investments.test.mjs` (16 tests) and browser journeys 11, 12 and 13.

## Assumptions to confirm
* Payment comes **after** Finance's final approval of the signed agreement.
* The investor pays Paystack's fee on top, like the other payment types.
* "Capital for the overdue share" is read as the monthly payment amount of the overdue month.
* A month still unpaid after 30 days gets a second penalty, after 60 days a third, and so on.
