# Phase 6: loan scoring

Built on v38. The scoring engine now works out "productive funds utilization" from system data, the admin sets a minimum total score, and `applyForLoan` enforces it using the last completed calendar quarter's score.

## Agreed decisions (22 Oct 2026)
1. Productive funds utilization (12 points) is worked out from system data.
2. The Unit Leader recommendation stays a yes/no gate with no points.
3. A minimum total score is required to apply; the admin sets it on an admin screen.
4. Nobody is exempt: recommendation tickets and first-time applicants are held to the same minimum.
5. The score that counts is the last completed calendar quarter's (delegated to Claude). A brand-new farmer must finish one quarter first.

## The score (50 points)
| Index | Max | How it is worked out in a quarter |
|---|---|---|
| Savings record | 6 | months with a deposit / 3 |
| Loan repayment | 12 | verified repayments / 3 |
| Training attendance | 20 | sessions attended / 6 |
| Productive funds utilization | 12 | 6 if the farmer declared produce in the quarter, plus 6 if they listed produce for sale |
| Unit Leader recommendation | none | yes/no gate, no points |

Funds utilization, after a loan: if a loan was paid out (status `disbursed`, from `loan_status_history`) inside the quarter, only produce declared or listed AFTER the latest payout counts. A farmer with no loan simply needs the activity somewhere in the quarter.

## How it is enforced
- `indicesEngine.js`: `scoreQuarter(farmer, quarterStart)` scores one quarter with an upper bound; `getLoanScoreStatus` recomputes (and stores) the last completed quarter every time, so the score is never stale; `getMinimumScore` reads the admin setting `loan_min_total_score` (not set = 0 = no minimum).
- `loanController.applyForLoan`: right after the loan type is validated and before anything else, a farmer under the minimum gets `403` with `code: "SCORE_TOO_LOW"`, the score and minimum as percentages, and a plain message. A farmer who joined this quarter is told they can apply when the quarter ends. A recommendation ticket stays unused when the application is refused. The Phase 8 gate (verified NIN, complete profile) still runs first.
- Farmers see percentages only (as before); Finance and Unit Leaders see points on the applicant view (`GET /api/loans/:id/applicant-indices`, now with a `counting` block).
- Declaring or listing produce recomputes the current quarter right away (so the farmer sees progress).

## New API and screens
- `GET /api/loans/scoring-settings`, `PUT /api/loans/scoring-settings { minimumScore }` (admin only, 0 to 50, blocked while acting as a department).
- Admin Hub > Loan scoring (`/admin/loan-scoring`): set the minimum.
- Farmer Loan Office: new "Your loan score" card with the counting quarter, the percentage, the minimum and what to do.
- Unit Leader review: shows the score that counts and the minimum.

## Tests
- `backend/test/api/loan-scoring.test.mjs` (11 tests): admin-only settings and validation, no minimum = anyone can apply, funds utilization from declared/listed produce, blocking and exactly-at-minimum, tickets not exempt, brand-new farmer, current quarter not counted, payout-date rule, stored history.
- Browser journey 17 (admin sets the minimum, farmer sees the score and is blocked, lowers it, farmer applies).
- Fixed on the way: the Finance email on the ticket path was sent while holding a database connection (caught by the pool guard); two corps tests and one Python test still used wording from before the NYSC AGROALLIED SAED rename.

## Assumptions to confirm
- Unset minimum = no minimum (nothing blocks until the admin sets one). Set it before launch.
- The half-and-half split for funds utilization (declared 6 + listed 6) and "any activity in the quarter" (not a quantity) are Claude's choice; easy to change in `scoreQuarter`.
- The minimum is entered in points out of 50; farmers see it as a percentage.
