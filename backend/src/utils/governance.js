// Our own governance structure is called the "3EI Governance model".
//
// NAMING ONLY. The top rank is still stored as the value "Federal" in
// farmer_profiles.rank (and in the CHECK constraint, route guards and queries) so
// no existing data or permission check changes. Anything a person can READ —
// API error text, emails, exports — goes through rankLabel().
export const GOVERNANCE_MODEL = "3EI Governance model";
export const TOP_RANK_VALUE = "Federal"; // stored/legacy value — never shown to users
export const TOP_RANK_LABEL = "3EI Governance";

export function rankLabel(rank) {
  return rank === TOP_RANK_VALUE ? TOP_RANK_LABEL : rank;
}
