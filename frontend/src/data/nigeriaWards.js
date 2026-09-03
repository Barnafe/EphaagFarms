// Ward-level data for the cascading State -> LGA -> Ward picker.
// Source: temikeezy/nigeria-geojson-data (MIT licensed, github.com/temikeezy/nigeria-geojson-data),
// trimmed to just ward names (no coordinates) to keep bundle size down.
//
// This is a third-party community dataset, not an official INEC/NPC list —
// it covers 774/774 LGAs and 8,809 wards, but ~7% of LGA name spellings
// don't line up exactly with our own NIGERIA_STATES_LGAS list (e.g. minor
// punctuation/spacing differences, or a handful of alternate LGA names).
// wardsForLga() normalizes names to close most of that gap; when a specific
// state+LGA genuinely isn't found, the caller should fall back to a manual
// text input rather than block registration — see Register.jsx.
import RAW_WARDS from "./nigeriaWardsData.json";

// Our own state list spells a couple of states differently than the source
// dataset.
const STATE_NAME_ALIASES = {
  FCT: "Federal Capital Territory",
  Nasarawa: "Nassarawa",
};

function normalize(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findStateBlock(stateName) {
  const direct = RAW_WARDS[STATE_NAME_ALIASES[stateName] || stateName];
  if (direct) return direct;
  const targetNorm = normalize(stateName);
  const key = Object.keys(RAW_WARDS).find((k) => normalize(k) === targetNorm);
  return key ? RAW_WARDS[key] : null;
}

/**
 * Returns an array of ward names for a given state + LGA, or an empty
 * array if the LGA isn't found in the dataset (caller should fall back to
 * a free-text input in that case, never block on it).
 */
export function wardsForLga(stateName, lgaName) {
  if (!stateName || !lgaName) return [];
  const stateBlock = findStateBlock(stateName);
  if (!stateBlock) return [];
  const direct = stateBlock[lgaName];
  if (direct) return direct;
  const targetNorm = normalize(lgaName);
  const key = Object.keys(stateBlock).find((k) => normalize(k) === targetNorm);
  return key ? stateBlock[key] : [];
}
