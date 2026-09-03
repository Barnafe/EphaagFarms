// Mock data only — replace with real API calls once the backend is connected.
// Pipeline position: Procurement (source) → Processor (process) → Store
// (hold stock, allocate) → Transport (move) → Delivered.

export const stockLevels = [
  { crop: "Maize", unit: "bag", quantity: 120 },
  { crop: "Tomatoes", unit: "crate", quantity: 40 },
  { crop: "Cassava", unit: "ton", quantity: 18 },
];

export const ordersAwaitingAllocation = [
  {
    id: "al1",
    orderReference: "ORD-20260718-N4W6",
    items: [{ crop: "Maize", quantity: 60, unit: "bag" }],
    deliveryLocation: "Lagos, Lagos State",
    distributorId: null,
  },
];

export const availableDistributors = [
  { id: "dst1", name: "Northgate Distribution Ltd" },
  { id: "dst2", name: "FreshLink Logistics" },
];
