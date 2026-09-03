import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function Vegetables() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Crop production → Vegetables"
        title="Vegetables"
        description="Tomatoes, peppers, onions and leafy greens grown for fresh supply, on a shorter cycle than grains or tubers."
        badge="🍅"
      />
      <RoomBackLink to="/services/farm-production/crops" label="Crop production" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we grow</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Our vegetable beds carry tomatoes, peppers, onions and leafy greens — fast-cycle
            crops planted in succession so fresh supply keeps coming through the season
            rather than arriving all at once.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Succession planting to keep a steady harvest rather than a single large one.</li>
            <li>• Irrigation and pest control managed closely given the shorter growing cycle.</li>
            <li>• Harvested produce moved quickly into the supply pool to preserve freshness.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in vegetable produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
