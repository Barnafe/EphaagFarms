// Mock data only — replace with real API calls once the backend is connected.
// Tasks here are created when the Store Department (internal, admin-side)
// allocates this distributor to an order.

export const myAllocationTasks = [
  {
    id: "t1",
    orderReference: "ORD-20260710-M9J4",
    items: [{ crop: "Cassava", quantity: 10, unit: "ton" }],
    deliveryLocation: "Port Harcourt, Rivers State",
    status: "assigned", // "assigned" | "confirmed"
  },
];
