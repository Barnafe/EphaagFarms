import { useState } from "react";
import { Search } from "lucide-react";

// Shopping-site-style product grid (Jumia/Temu-like): search + category
// pills up top, then a card grid. Each card shows the item's icon tile,
// name, price, and unit — click anywhere on the card to open the full
// product detail panel (ProductDetailPanel), same "click item → full
// details open" flow as a real shopping site.
//
// Note on colors: product cards are deliberately white (like a real
// shopping site), which sits inside the app's otherwise dark dashboard
// theme (.dash-scope inverts the ink-* text classes to light colors for
// the dark background). Text inside these white cards uses plain
// text-gray-* instead of text-ink-* so it stays dark-on-white and isn't
// caught by that inversion.
export default function ProductCatalog({ items, onSelect }) {
  const categories = ["All", ...new Set(items.map((i) => i.category))];
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");

  const visible = items.filter((i) => {
    const inCategory = activeCategory === "All" || i.category === activeCategory;
    const matchesQuery = i.crop.toLowerCase().includes(query.trim().toLowerCase());
    return inCategory && matchesQuery;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-soil-200 bg-white p-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search produce — maize, yam, tomatoes…"
            className="w-full rounded-card border border-soil-200 py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-canopy-400 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activeCategory === c
                  ? "border-canopy-600 bg-canopy-600 text-white"
                  : "border-soil-200 text-gray-600 hover:border-canopy-400"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <div className="rounded-card border border-soil-200 bg-white p-6 text-center text-sm text-gray-500">
          No produce matches "{query}".
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="group flex flex-col overflow-hidden rounded-card border border-soil-200 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg hover:border-canopy-400"
          >
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-canopy-50 to-soil-50 text-5xl transition group-hover:scale-105">
              {item.icon}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <span className="w-fit rounded-full bg-soil-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {item.category}
              </span>
              <p className="font-medium leading-tight text-gray-900">{item.crop}</p>
              <p className="text-xs text-gray-500">per {item.unit}</p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <p className="font-semibold text-canopy-800">₦{item.price.toLocaleString()}</p>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canopy-600 text-base leading-none text-white transition group-hover:bg-canopy-800">
                  +
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
