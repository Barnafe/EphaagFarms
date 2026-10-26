// Nigerian phone numbers -> E.164 (+234XXXXXXXXXX). Returns null if invalid.
export function normalizeNgPhone(input) {
  if (input === null || input === undefined) return null;
  let d = String(input).replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("234")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  // National significant number: 10 digits, mobile lines start 7, 8 or 9.
  if (!/^[789]\d{9}$/.test(d)) return null;
  return `+234${d}`;
}
