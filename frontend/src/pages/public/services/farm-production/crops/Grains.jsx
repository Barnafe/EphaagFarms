import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function Grains() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Crop production → Grains"
        title="Grains"
        description="Maize, rice, sorghum and millet grown across company-owned farmland, planted to the local growing season."
        badge="🌽"
      />
      <RoomBackLink to="/services/farm-production/crops" label="Crop production" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we grow</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Our grain fields carry maize, rice, sorghum and millet — staple crops planted
            in line with the rainy-season calendar and rotated across fields to keep soil
            fertility up over successive seasons.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Field preparation and planting timed to the rains, with crop rotation across seasons.</li>
            <li>• Weeding and pest control on a fixed schedule through the growing period.</li>
            <li>• Harvested grain dried, bagged and moved into the same supply pool as sourced produce.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in grain produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
