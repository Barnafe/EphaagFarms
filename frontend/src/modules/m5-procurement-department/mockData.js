// Mock data only — replace with real API calls once the backend is connected.
// In the real system, "pendingOrders" here is the same ORDER table that
// Buyer's Room (Module 4) writes to — mocked separately for now since there's
// no shared backend yet.

export const pendingOrders = [
  {
    id: "o101",
    reference: "ORD-20260722-K3P9",
    items: [{ crop: "Maize", quantity: 30, unit: "bag" }],
    deliveryLocation: "Lagos, Lagos State",
    status: "paid",
    notifiedReps: [],
  },
  {
    id: "o102",
    reference: "ORD-20260721-7QX2",
    items: [{ crop: "Tomatoes", quantity: 40, unit: "crate" }],
    deliveryLocation: "Abuja, FCT",
    status: "sourcing",
    notifiedReps: ["Ward Leader — Kano Ward 2"],
  },
];

export const registeredFarmers = [
  { id: "f1", name: "Musa Ibrahim", crops: ["Maize", "Cassava"], state: "Kaduna", lga: "Zaria", ward: "Ward 3", unit: "Unit 4", repContact: "Unit Leader — Kaduna Unit 4" },
  { id: "f2", name: "Amaka Obi", crops: ["Maize"], state: "Kano", lga: "Dala", ward: "Ward 2", unit: "Unit 1", repContact: "Ward Leader — Kano Ward 2" },
  { id: "f3", name: "Yusuf Bello", crops: ["Tomatoes", "Pepper"], state: "Kano", lga: "Dala", ward: "Ward 2", unit: "Unit 3", repContact: "Ward Leader — Kano Ward 2" },
  { id: "f4", name: "Chidi Eze", crops: ["Cassava", "Yam"], state: "Benue", lga: "Gboko", ward: "Ward 1", unit: "Unit 2", repContact: "LGA Coordinator — Benue Gboko" },
];

export const standardPrices = [
  { crop: "Maize", unit: "bag", price: 38000, lastReviewed: "2026-01" },
  { crop: "Rice (paddy)", unit: "bag", price: 52000, lastReviewed: "2026-01" },
  { crop: "Cassava", unit: "ton", price: 95000, lastReviewed: "2026-01" },
  { crop: "Yam", unit: "tuber", price: 2500, lastReviewed: "2026-01" },
  { crop: "Tomatoes", unit: "crate", price: 18000, lastReviewed: "2026-01" },
  { crop: "Pepper", unit: "basket", price: 12000, lastReviewed: "2026-01" },
];
