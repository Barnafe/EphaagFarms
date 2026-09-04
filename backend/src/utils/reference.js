// Matches the frontend's src/utils/reference.js format exactly:
// PREFIX-YYYYMMDD-CODE, e.g. ORD-20260723-4F2K

export function generateReference(prefix) {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${y}${m}${d}-${code}`;
}

export const REF_PREFIX = {
  order: "ORD",
  loan: "LN",
  investment: "INV",
  shipment: "SHP",
  savings: "SAV",
  request: "REQ",
  share: "SHR",
  maintenanceRequest: "MREQ",
  workOrder: "WO",
  maintenanceExpense: "MEXP",
};
