# Phase 3: corps access fee on live Paystack (base: v32)

> **Updated in v34:** refunds now exist only in the admin **Refund room** (see `LATE-FEES-AND-REFUND-ROOM.md`). Anything below about automatic refunds, a "Refunds due" list, "Mark refunded" or refunds through Finance is replaced by that.

New migration `006_corps_payments.sql`. Corps keeps its own tables and behaviour; the Paystack side now runs on the shared ledger and webhook from Phases 1 and 2.

## What changed
- **Shared webhook and ledger.** Every corps Paystack attempt is recorded in the shared ledger under the *same reference* (Type **Corps fee**), so the shared webhook, the return-page check and the scheduled re-check all find it. The **old corps webhook address still works** and now behaves exactly like the shared one (same code path). Corps payments made before this change (no ledger row) are still handled by the original logic.
- **Shared fee calculator.** The member pays Paystack's processing fee on top of the access fee. A corps payment records the **access fee**, the **processing fee** and the **total charged** separately. **Finance income is the access fee only**; the processing fee is shown separately (Finance TRC list, receipts, the Finance ledger) so the books match the Paystack payout.
- **Refund removed.** The admin Refund button and its endpoint are gone (the route now answers 404). Payments refunded before this change stay visible as history (status "refunded"), and access for those members still behaves as before.
- **Non-refundable tick.** Before paying, the member sees "This fee is non-refundable once paid" and must tick to agree; Pay now stays disabled until they do, the server also refuses without it, and the time of the tick is stored.
- **Safer manual confirmation.** When an admin confirms a Paystack payment by hand, the system **asks Paystack first**:
  - Paystack says it was paid: confirmed through the normal verified path (nothing to review).
  - Paystack says it was not received: cannot be confirmed by hand.
  - Paystack cannot be reached: the admin may confirm **only with a reason** (for example a transfer reference). It is logged in the audit log, flagged for Finance review, and shown on the payment. If Paystack later reports the same payment, it is matched to it and **not credited twice**.
  Manual-mode payments (no Paystack key on the server) are confirmed directly as before, since there is nothing to ask.
- **Re-check.** A "Re-check with Paystack" button on a stuck pending payment; the scheduled `payment-recheck` job (every 15 minutes) does the same automatically.
- **Automatic rules (same as orders and shares, no Finance decision step).** A wrong amount or currency, a second payment after the member already paid, and a payment from an attempt the member had cancelled are **refused on the spot**, the member is told on screen and by message, and the payment goes to the Refunds due list. A refused attempt can be replaced: the member simply starts a new payment.
- **Receipts and notices.** Receipt to the member (access fee, processing fee, total, "non-refundable once paid"); Finance is emailed for each automatic confirmation and for each manual one (flagged).
- **Corps payments appear in Finance -> Payment confirmations -> Auto-confirmed** with Type Corps fee, the recorded tick and the export.

## Please confirm (it differs slightly from the plan's wording)
The plan said refunds are removed completely and that a double-charged member is only flagged, with any money back handled in the Paystack dashboard. Under the rules you set for orders and shares, an unusable corps payment (wrong amount, duplicate, cancelled attempt) is refused automatically and **queued for refund** (one-click Paystack refund, or automatic if you switch that setting on). I read "no refunds" as "no refund of a fee that was properly paid for access" and kept returning money that could never be used. If you want corps duplicates left strictly to manual handling in the Paystack dashboard, say so.

## Tests
New API suite `payments-corps.test.mjs` (success, mismatch, failure, duplicate webhooks on both addresses, bad signature, the tick, no refunds, manual confirmation with Paystack up and down, not credited twice, re-check, income equals the access fee, permissions) and a browser journey (tick required, pay on the stand-in, unlocked). The corps Python suites were updated for the tick and the removed refund (they set legacy "refunded" rows directly in the database).
Also fixed while testing: payments are never marked paid if no handler is registered for their type (they roll back and settle later), the jobs now load every payment handler, and the re-check checks the newest payments first.

## Needs from you
Nothing new (Paystack test key, site address, webhook from Phase 1).

## Paystack test-mode checklist (you run this)
1. As a corps member, open Payments: the fee, processing fee and total show; Pay now is disabled until you tick the box.
2. Pay with a test card: you return, see "Access fee paid" with the breakdown, and get a receipt. In Finance the income shows the access fee only.
3. Close the window right after paying: access still unlocks (webhook).
4. With Paystack unreachable (e.g. wrong key temporarily), try Confirm payment as an admin: it must ask for a reason and flag it.
5. Replay the webhook from the Paystack dashboard: nothing is credited twice.

## Not included
Certificate leftovers (Phase 14), corps learning rules (Phase 13).
