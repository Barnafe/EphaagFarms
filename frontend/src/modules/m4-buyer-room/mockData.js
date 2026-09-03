// Mock data only — replace with real API calls once the backend is connected.
// Standardized prices come from the Federal/CEO pricing approval workflow (Module 5).

export const catalogItems = [
  {
    id: "maize",
    crop: "Maize",
    category: "Grains",
    unit: "bag",
    price: 38000,
    sizes: ["50kg bag", "100kg bag"],
  },
  {
    id: "rice",
    crop: "Rice (paddy)",
    category: "Grains",
    unit: "bag",
    price: 52000,
    sizes: ["50kg bag", "100kg bag"],
  },
  {
    id: "cassava",
    crop: "Cassava",
    category: "Tubers",
    unit: "ton",
    price: 95000,
    sizes: null,
  },
  {
    id: "yam",
    crop: "Yam",
    category: "Tubers",
    unit: "tuber",
    price: 2500,
    sizes: ["Small", "Medium", "Large"],
  },
  {
    id: "tomatoes",
    crop: "Tomatoes",
    category: "Vegetables",
    unit: "crate",
    price: 18000,
    sizes: null,
  },
  {
    id: "pepper",
    crop: "Pepper",
    category: "Vegetables",
    unit: "basket",
    price: 12000,
    sizes: null,
  },
];

export const standingCommitment = {
  active: false,
  totalCommitted: 0,
  balanceRemaining: 0,
  durationYears: 1,
};

export const orderHistory = [
  {
    id: "o1",
    reference: "ORD-20260520-7QX2",
    items: [{ crop: "Maize", quantity: 20, unit: "bag", size: "50kg bag", lineTotal: 760000 }],
    total: 760000,
    deliveryLocation: "Kaduna, Kaduna State",
    status: "delivered",
    date: "2026-05-20",
  },
  {
    id: "o2",
    reference: "ORD-20260710-M9J4",
    items: [{ crop: "Tomatoes", quantity: 50, unit: "crate", size: null, lineTotal: 900000 }],
    total: 900000,
    deliveryLocation: "Kaduna, Kaduna State",
    status: "in_transit",
    date: "2026-07-10",
  },
];
