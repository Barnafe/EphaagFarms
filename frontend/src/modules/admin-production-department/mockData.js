// Mock data only — replace with real API calls once the backend is connected.
// Harvest logs here feed the SAME stock pool as Store Department's stock
// levels (Module 8) — sourced produce and company-grown produce sit in one
// combined store, per user's decision. Kept as independent mock data for now
// since there's no shared backend yet.

export const farms = [
  { id: "f1", name: "Ephaag Farm — Kaduna", state: "Kaduna", crop: "Maize", sizeHectares: 40, status: "active" },
  { id: "f2", name: "Ephaag Farm — Benue", state: "Benue", crop: "Cassava", sizeHectares: 25, status: "active" },
  { id: "f3", name: "Ephaag Farm — Kano (North)", state: "Kano", crop: "Tomatoes", sizeHectares: 12, status: "fallow" },
];

export const harvestLog = [
  { id: "h1", farmId: "f1", crop: "Maize", quantity: 80, unit: "bag", date: "2026-07-10" },
  { id: "h2", farmId: "f2", crop: "Cassava", quantity: 6, unit: "ton", date: "2026-07-15" },
];
