// Mock data only — replace with real API calls once the backend is connected.
// Jobs here are created when the Transport Department (internal, admin-side)
// assigns this driver to a shipment.

export const myAssignedJobs = [
  {
    id: "j1",
    shipmentReference: "SHP-20260719-9K2L",
    orderReference: "ORD-20260718-N4W6",
    items: [{ crop: "Maize", quantity: 60, unit: "bag" }],
    deliveryLocation: "Lagos, Lagos State",
    status: "en_route", // "assigned" | "en_route" | "delivered"
    proofOfDelivery: null,
  },
];
