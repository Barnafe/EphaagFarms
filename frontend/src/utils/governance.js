// Our own governance structure is called the "3EI Governance model" — it is NOT
// presented as a copy of the federal government's structure anywhere in the product.
//
// NAMING ONLY. The top rank is still stored in the database (and checked in code,
// routes and middleware) as the value "Federal"; renaming stored values would risk
// existing data and every rank check for no user benefit. Anything a person can SEE
// goes through rankLabel() so they only ever read "3EI Governance".
export const GOVERNANCE_MODEL = "3EI Governance model";
export const TOP_RANK_VALUE = "Federal"; // stored/legacy value — never shown to users
export const TOP_RANK_LABEL = "3EI Governance";

export function rankLabel(rank) {
  return rank === TOP_RANK_VALUE ? TOP_RANK_LABEL : rank;
}
