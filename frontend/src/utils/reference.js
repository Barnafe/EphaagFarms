// Shared reference ID generator used across every trackable record in the
// system: orders, loans, investments, shipments, etc. Keeping this in one
// place means every module produces IDs in the same recognizable format.
//
// Format: {PREFIX}-{YYYYMMDD}-{4-character code}
// Example: ORD-20260723-4F2K

export function generateReference(prefix) {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${y}${m}${d}-${code}`;
}

// Suggested prefixes, kept here so every module uses the same one:
export const REF_PREFIX = {
  order: "ORD",
  loan: "LN",
  investment: "INV",
  shipment: "SHP",
};
