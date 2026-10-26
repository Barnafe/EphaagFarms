# Phase 2: farmer shares payment (base: v31)

New migration `005_share_payments.sql`. Reuses the Phase 1 payment ledger, fee calculator, webhook and refusal rules.

## What changed
- **Simulated payment** is for local testing only: it must be switched on (`PAYMENT_ALLOW_SIMULATED=true`) and it never runs when `NODE_ENV=production` (a warning is logged if the flag is set there). Without a Paystack key in production the share checkout answers "Online payment is unavailable" and creates nothing. (Before, simulated mode was ON unless you turned it off.)
- **Purchase saved first**, then Paystack is started and the payment link stored on it. A failed Paystack start leaves a saved, unpaid purchase with **Pay again**, never a payment without a purchase.
- **Webhook**: share payments (reference prefix `SPR`) go through the shared webhook, so shares are created even if the browser was closed, and exactly once (the purchase is locked while the shares are created).
- **Fee**: the farmer pays it, shown as its own line before paying. A purchase records the goods total, the fee and the total charged separately. **Each share's capital stays exactly ₦25,000**, so the banner figures and interest tables are untouched.
- **Automatic rules (same as orders, no Finance decision step)**: wrong amount or currency, a purchase that expired or was cancelled, and a second payment for an already-paid purchase are **refused on the spot**, the farmer is told on screen and by message, and the payment goes to Finance's Refunds due list.
- **Expiry**: an unpaid purchase expires after 24 hours (setting). Once expired or cancelled it has no payment link; a payment from a stale page is refused and returned. A payment that did arrive before the job runs is settled first, never lost.
- **Duplicate purchases**: the same number of shares again within 24 hours shows a notice ("You have already paid for this" with Proceed to pay again, or "already waiting for payment" with Pay for the existing purchase).
- **Pending purchase actions**: Check my payment, Pay again, Cancel.
- **Finance**: share payments appear in the Auto-confirmed list as Type **Share**, with the same email to Finance and the "recorded" tick. A purchase at or above an optional threshold gets a review-only mark (it still goes through); nothing is flagged for size until you set one (Settings).
- **Receipts**: to the farmer's real email; farmers with no email get an SMS and are sent to Paystack under `<phone>@FARMER_PLACEHOLDER_EMAIL_DOMAIN`, an address nothing is ever sent to.
- **Jobs**: `expire-share-purchases` (every 10 minutes); the existing `payment-recheck` also covers share payments.
- **Not touched**: interest and capital withdrawals (paying money out is Phase 5). I added regression tests for them: a year's interest unlocks when the year completes and can be taken once; capital is locked for 5 years.

## A deliberate change from the plan
The plan said a correct payment arriving **after expiry** should still create the shares and be flagged. In the Phase 1 review you asked that expired items must not be payable and that the system, not Finance, handles such cases. I applied that rule here too: a late payment is refused and refunded. Tell me if you would rather shares behave as the plan first said.

## Needs from you
Nothing new beyond Phase 1 (Paystack test key, `FRONTEND_ORIGIN`, webhook). Optionally set `FARMER_PLACEHOLDER_EMAIL_DOMAIN` to a domain you control.

## Paystack test-mode checklist (you run this)
1. As a farmer, buy 2 shares with a test card. You should return to "Payment verified, 2 shares are now active", receive a receipt, and Finance sees a **Share** line.
2. Start a purchase and close the browser right after paying: the shares should still appear (webhook).
3. Buy by bank transfer: the purchase shows "We haven't received your payment yet" until Paystack confirms.
4. A farmer with only a phone number: confirm the Paystack page shows the placeholder address and the farmer gets an SMS receipt.
5. Buy the same number of shares twice: the duplicate notice appears.
6. In Paystack, replay the webhook: nothing happens twice.
7. Check the net Paystack settles equals the listed share price (adjust the fee settings if VAT or card mix makes it differ).

## Assumptions to confirm
24-hour purchase expiry, 24-hour duplicate window (same number of shares), late payment refused (above), placeholder domain `farmers.ephaag.app` until you set your own.

## Not included
Paying out interest or capital withdrawals (Phase 5).
