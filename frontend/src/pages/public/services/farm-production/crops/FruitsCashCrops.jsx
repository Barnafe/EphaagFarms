import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function FruitsCashCrops() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Crop production → Fruits & Cash Crops"
        title="Fruits & cash crops"
        description="Fruit orchards alongside cash crops such as groundnut and soybean, grown for both direct sale and processing."
        badge="🍊"
      />
      <RoomBackLink to="/services/farm-production/crops" label="Crop production" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we grow</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            This line covers fruit orchards alongside cash crops like groundnut and soybean.
            Fruit is grown for direct fresh sale, while cash crops feed both direct sale and
            onward processing once they reach the Processor's Room.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Orchard upkeep — pruning, pest control — on a fixed seasonal schedule.</li>
            <li>• Cash crops rotated with grains and legumes to protect soil health.</li>
            <li>• Harvested produce moved into the same supply pool as sourced produce.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in fruit or cash crop produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
