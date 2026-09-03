// Mock data only — replace with real API calls once the backend is connected.
// In the real system, jobs here are created when admin assigns this processor
// to an order from the Parlor (Module 5) — mocked independently for now since
// there's no shared backend yet.

export const assignedJobs = [
  {
    id: "j1",
    reference: "ORD-20260721-7QX2",
    items: [{ crop: "Tomatoes", quantity: 40, unit: "crate" }],
    deliveryLocation: "Abuja, FCT",
    status: "assigned", // "assigned" | "processing" | "complete"
    assignedDate: "2026-07-21",
  },
  {
    id: "j2",
    reference: "ORD-20260718-N4W6",
    items: [{ crop: "Maize", quantity: 60, unit: "bag" }],
    deliveryLocation: "Lagos, Lagos State",
    status: "processing",
    assignedDate: "2026-07-18",
  },
  {
    id: "j3",
    reference: "ORD-20260710-M9J4",
    items: [{ crop: "Cassava", quantity: 10, unit: "ton" }],
    deliveryLocation: "Port Harcourt, Rivers State",
    status: "complete",
    assignedDate: "2026-07-10",
  },
];
