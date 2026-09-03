import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function Tubers() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Crop production → Tubers"
        title="Tubers"
        description="Cassava, yam and sweet potato, grown and harvested on rotation across company-owned farmland."
        badge="🥔"
      />
      <RoomBackLink to="/services/farm-production/crops" label="Crop production" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we grow</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Cassava, yam and sweet potato make up our tuber line — crops planted on
            rotation so that fields feeding the supply pool are staggered across the
            season rather than all maturing at once.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Staggered planting so harvest windows overlap rather than cluster.</li>
            <li>• Mounding, weeding and pest control through the growing period.</li>
            <li>• Harvested tubers cleaned and moved into the same supply pool as sourced produce.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in tuber produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
