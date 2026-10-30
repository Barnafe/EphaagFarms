# Phase 8: farmer identity and profile (v37)

## NIN verification (NIMC)
* Registration starts with a **NIN step**. The farmer enters the 11-digit NIN and agrees (consent box). The server asks NIMC through the provider (Dojah "advanced NIN" lookup, `services/nin.js`) and returns the **name, date of birth, gender and permanent address**. The form shows them read-only. A signed 30-minute token (`POST /api/auth/verify-nin`) carries the proof into registration, which then overrides anything typed.
* **The NIN is never stored or logged**: only an HMAC (duplicate detection, one account per NIN) and the last 4 digits.
* A farmer without a NIN, or whose NIN cannot be verified, can still register ("continue without it") and use the basic features. They verify later in Profile (`POST /api/farmers/me/verify-nin`); NIMC data then replaces theirs and locks it.
* Lookups cost money: 10 per hour per IP. Provider down -> `NIN_UNAVAILABLE` and the farmer can continue unverified.
* Env: `DOJAH_BASE_URL` (https://api.dojah.io live, https://sandbox.dojah.io sandbox), `DOJAH_APP_ID`, `DOJAH_SECRET_KEY`. Without them NIN verification reports "not available" and everyone registers unverified.

## What is locked and what can be edited
Locked once verified (from NIMC): full name, gender, date of birth, permanent address. Everything else is editable in Profile: marital status, farm details, crops, additional income, the residential address (below). Unverified farmers can edit their own name, date of birth and permanent address until they verify. The unit can never be typed (`PUT /farmers/me` refuses it).

## Residential address and the automatic unit
`PUT /api/farmers/me/residence` (address, state, LGA, ward, community, street, optional GPS pin) saves the address and **finds the unit automatically** (`services/unitMatching.js`):
1. **GPS pin**: the closest official unit that has a pin, within `unit_match_max_km` (admin setting, default 15 km).
2. else the **community / street names** each unit lists (same ward first, then LGA);
3. else the **only official unit in the ward**;
4. else no unit: the farmer keeps the current unit, is told, and every admin is notified.
Switching a unit sets the farmer's state/LGA/ward/unit to the new unit's, so the new Unit Leader sees them and **a pending loan request moves with them** (leader scope is by jurisdiction). The farmer is notified; every change is logged in `farmer_unit_changes`. Changing address during an active loan is allowed.
Official units live in `unit_catalog`: every unit with a Unit Leader appears automatically, approved unit proposals are added, admins can add or edit (Admin Hub > Units & identity), and a Unit Leader pins their own unit and lists its communities (Rank tab > My unit location).

## Gate on sensitive features
When the gate is on (admin switch, default **on**; test/dev default via `FARMER_GATE_DEFAULT=off`), a farmer needs a **verified NIN and a complete profile** for: applying for a loan, withdrawing savings, buying farm shares and withdrawing share interest/capital. Everything else (dashboard, products, seminars, attendance, savings deposits, feedback, profile) stays open. The API answers 403 `PROFILE_RESTRICTED` with what is missing, and the Farmer's Room shows a banner on every page. Older farmers with blank survey fields see the banner and the missing fields highlighted in Profile.
Complete profile = marital status, date of birth, residential address, unit, farm type, farm size, years of experience, inventory-records answer, annual farm income, additional income type, and at least one crop/livestock item.

## Tests
`backend/test/api/farmer-identity.test.mjs` (9 tests) and browser journeys 1 and 1b. The Dojah lookup is simulated by the Paystack stand-in (test NINs: `0...` not found, `9...` provider error).
