// Mock data only — replace with real API calls once the backend is connected.
// This is the internal EPHAAG staff view: assigning drivers and generating
// shipment documents. The driver's own view lives in the Transporter's Room
// (Module 7) — a registered driver never sees this screen.

export const readyForDispatch = [
  {
    id: "d1",
    orderReference: "ORD-20260710-M9J4",
    items: [{ crop: "Cassava", quantity: 10, unit: "ton" }],
    deliveryLocation: "Port Harcourt, Rivers State",
    driverId: null,
    shipmentReference: null,
  },
];

export const availableDrivers = [
  { id: "drv1", name: "Ibrahim Sule", fleetType: "Company fleet" },
  { id: "drv2", name: "Grace Umoh", fleetType: "Independent" },
  { id: "drv3", name: "Tunde Are", fleetType: "Independent" },
];
