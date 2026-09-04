// Category and display metadata aren't stored in the backend's
// standard_prices table (which only holds crop/unit/price) — kept here and
// merged with live prices at render time. `icon` is an emoji tile (no real
// product photography exists yet) and `description` is genuine, factual
// copy about the crop — not invented marketing claims (no fake ratings or
// "X sold" counters).
export const catalogMeta = {
  Maize: {
    id: "maize",
    category: "Grains",
    icon: "🌽",
    description: "Dried, cleaned maize sourced from Ephaag member farmers, sold by the bag.",
    sizes: ["50kg bag", "100kg bag"],
  },
  "Rice (paddy)": {
    id: "rice",
    category: "Grains",
    icon: "🌾",
    description: "Unmilled paddy rice, sold by the bag — ready for processing or direct purchase.",
    sizes: ["50kg bag", "100kg bag"],
  },
  Cassava: {
    id: "cassava",
    category: "Tubers",
    icon: "🥔",
    description: "Fresh-harvested cassava tubers, sold by the ton for processing or bulk supply.",
    sizes: null,
  },
  Yam: {
    id: "yam",
    category: "Tubers",
    icon: "🍠",
    description: "Fresh yam tubers, graded by size — pick the size that fits what you need.",
    sizes: ["Small", "Medium", "Large"],
  },
  Tomatoes: {
    id: "tomatoes",
    category: "Vegetables",
    icon: "🍅",
    description: "Fresh tomatoes sold by the crate, sourced from Ephaag member farms.",
    sizes: null,
  },
  Pepper: {
    id: "pepper",
    category: "Vegetables",
    icon: "🌶️",
    description: "Fresh pepper sold by the basket, sourced from Ephaag member farms.",
    sizes: null,
  },
};

const FALLBACK_ICONS = { Grains: "🌾", Tubers: "🥔", Vegetables: "🥬", Other: "🧺" };

export function mergeCatalog(prices) {
  return prices.map((p) => {
    const meta = catalogMeta[p.crop];
    // DB-provided values (set via the admin "Add Catalog" form) win when
    // present — that's what lets a newly-added crop carry its own
    // category/description/icon instead of always falling back to generic
    // ones. catalogMeta.js is still consulted for older/blank rows so
    // nothing that already looked good regresses.
    const category = p.category || meta?.category || "Other";
    return {
      id: meta?.id || p.crop.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      crop: p.crop,
      category,
      icon: p.icon || meta?.icon || FALLBACK_ICONS[category] || "🧺",
      // Real product photo, set by admin in the "Add Catalog" form — wins
      // over the emoji icon when present (see ProductCatalog.jsx /
      // ProductDetailPanel.jsx, which fall back to the icon tile when
      // there's no photo yet, e.g. older catalog rows).
      imageUrl: p.image_url || null,
      description:
        p.description || meta?.description || `Standard-priced ${p.crop.toLowerCase()}, sold by the ${p.unit}.`,
      unit: p.unit,
      price: Number(p.price),
      sizes: meta?.sizes || null,
    };
  });
}
