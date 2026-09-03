// Each public "service room" (Investment, Farm Production, Produce Sourcing,
// Farmer Financing, Logistics & Tracking, Seminal) gets its own accent pairing
// from the existing brand palette — same six colors throughout the site,
// just recombined so each department reads as its own place.

export const themes = {
  investment: {
    heroFrom: "#122e16", // canopy-900
    heroTo: "#1c4720", // canopy-800
    rowColor: "rgba(219, 165, 50, 0.14)", // harvest-400 furrow lines
    accent: "text-harvest-400",
    badge: "bg-harvest-400",
    badgeText: "text-canopy-900",
  },
  farmProduction: {
    heroFrom: "#2e2513", // soil-900
    heroTo: "#1c4720", // canopy-800
    rowColor: "rgba(156, 196, 139, 0.16)", // canopy-200 furrow lines
    accent: "text-canopy-200",
    badge: "bg-canopy-400",
    badgeText: "text-white",
  },
  produceSourcing: {
    heroFrom: "#a97918", // harvest-600
    heroTo: "#2c6b2f", // canopy-600
    rowColor: "rgba(255, 255, 255, 0.18)",
    accent: "text-harvest-50",
    badge: "bg-canopy-900",
    badgeText: "text-harvest-400",
  },
  farmerFinancing: {
    heroFrom: "#5c0a10", // clay-900
    heroTo: "#901018", // clay-800
    rowColor: "rgba(219, 165, 50, 0.14)",
    accent: "text-harvest-400",
    badge: "bg-harvest-400",
    badgeText: "text-clay-900",
  },
  logistics: {
    heroFrom: "#1b1811", // ink-900
    heroTo: "#122e16", // canopy-900
    rowColor: "rgba(219, 165, 50, 0.12)",
    accent: "text-harvest-400",
    badge: "bg-clay-600",
    badgeText: "text-white",
  },
  seminal: {
    heroFrom: "#1c4720", // canopy-800
    heroTo: "#a97918", // harvest-600
    rowColor: "rgba(255, 255, 255, 0.16)",
    accent: "text-harvest-50",
    badge: "bg-white",
    badgeText: "text-canopy-800",
  },
};
