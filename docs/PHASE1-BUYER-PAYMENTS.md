# Phase 1: buyer checkout with real Paystack payment

> **Updated in v34:** refunds now exist only in the admin **Refund room** (see `LATE-FEES-AND-REFUND-ROOM.md`). Anything below about automatic refunds, a "Refunds due" list, "Mark refunded" or refunds through Finance is replaced by that.

Baseline: v29 (foundations). New migration `003_payments.sql`.

## What changed
- **Orders**: an upfront order is saved as `awaiting_payment` (expires in 24 hours, editable), then the buyer goes to Paystack's hosted page (card or bank transfer). The order becomes `payment_confirmed` and appears in Procurement's queue **only after the server verifies the payment** (webhook or return-page check, whichever arrives first). Amount, currency and reference must match exactly.
- **Fee**: added to the buyer's total and shown as its own line. The server works it out so EPHAAG nets the listed price (default 1.5% + ₦100, ₦100 waived under ₦2,500, cap ₦2,000). All four numbers are editable in Finance -> Payment confirmations -> Settings (Paystack also adds VAT and charges more for international cards).
- **One ledger** (`gateway_payments`) for every Paystack payment, with a Finance list: type, net, fee, total, "recorded" tick, CSV export (opens in Excel).
- **One webhook address**: `/api/payments/paystack-webhook` routes each event by reference to the right payment type. The old corps address still works; corps code is unchanged except that its event logic is now a function both addresses call.
- **Safe against repeats**: a payment row is locked while it is settled, so a webhook, a return-page check, a double tap and the scheduled re-check can never confirm an order twice.
- **Automatic rules (no Finance clear/reject step)**. Money that cannot be used is **refused on the spot**: a wrong amount or currency, a payment for an order that expired or was cancelled, a second payment for an order already paid. The order is untouched, the payer is told on screen and by message, and the payment goes on Finance's **Refunds due** list (refund through Paystack with one button, or mark it refunded with the Paystack reference). A setting "return refused payments automatically through Paystack" exists and is **off** until you decide. *Review only* (proceeds, for information): an order at or above a size threshold; no order is flagged for size until you set one.
- **Duplicate orders**: the same items for the same amount, ordered again within 24 hours (editable), shows a notice at checkout: "You have already paid for this" (with Proceed to pay again) or "already waiting for payment" (with Pay for the existing order). Pending payments are checked with Paystack first, so a payment that went through but whose confirmation has not arrived yet is still reported as paid.
- **Unpaid orders**: Pay now (new attempt, or re-use a fresh one), Cancel, and automatic expiry after 24 hours. Before expiring or cancelling, the app asks Paystack, so a payment that did arrive is never lost. Once an order is expired or cancelled it gets no payment link; Paystack cannot cancel a checkout page the buyer already opened, so a payment from a stale page is refused and returned.
- **Standing commitment**: pay through Paystack; the balance is credited only after verification, and only the amount (not the fee). Orders paid from the balance skip the gateway, carry no fee and go straight to Procurement. Balances typed in before this change keep working and are listed under "Unfunded commitments (legacy)".
- **Refunds (v34)**: no refund action on orders or in Finance. Exceptions are handled in the admin Refund room (full refund, written reason required).
- **Messages**: receipt to the buyer; email to Finance heads (or all admins if no Finance head is set in Positions) for every payment and every flag.
- **Jobs**: `expire-unpaid` (every 10 min) and `payment-recheck` (every 15 min; payments pending from the last 48 hours).
- **Audit**: `order_events` records every step with who and when. Fee, threshold and expiry changes go to the security log. Refund, flag decisions and settings are refused while an admin is "acting as" a department.

## Needs from you
Your Paystack **test** secret key (`PAYSTACK_SECRET_KEY`), your real site address in `FRONTEND_ORIGIN`, and the webhook address above entered in the Paystack dashboard.

## Paystack test-mode checklist (you run this; my environment cannot reach Paystack)
1. Set the test key and webhook URL. In Finance -> Payment confirmations -> Settings the red "not configured" banner should disappear.
2. As a buyer, add something to the cart and pay with a Paystack **test card**. You should return to "Payment received", get a receipt email, and see the order in Procurement. Finance gets an email and sees it under Auto-confirmed.
3. Start a payment and close the Paystack window. The order shows "Awaiting payment" with Pay now and Cancel.
4. Pay by **bank transfer** (test mode). The return page should say "Waiting for your transfer" until Paystack confirms.
5. Fund a standing commitment. The balance should rise by the amount only, and an order paid from it should show no fee.
6. In Paystack's dashboard, check the **net settled** for a payment equals the listed price (fee VAT and card type can make it differ a little: adjust the fee settings).
7. Replay a webhook from the Paystack dashboard: nothing should happen twice.

## Assumptions to confirm
24-hour expiry. Duplicate window 24 hours and "same items" = same crops, quantities, sizes and total, whatever the delivery address. A balance order skips Finance entirely (the balance is already verified money). Corps payments are unchanged here (Phase 3 moves them onto the shared calculator).

## Not included
Automated refunds, PDF invoices, part payments, delivery fees. Share, corps, investor, savings and payout payments are Phases 2 to 5.
