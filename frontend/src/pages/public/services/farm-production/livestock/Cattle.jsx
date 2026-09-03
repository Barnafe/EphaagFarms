import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function Cattle() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Livestock farming → Cattle"
        title="Cattle farming"
        description="Beef and dairy cattle raised for meat, milk and breeding stock on company-owned ranch land."
        badge="🐄"
      />
      <RoomBackLink to="/services/farm-production/livestock" label="Livestock farming" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we raise</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Our cattle operation covers both beef and dairy lines. Beef cattle are raised
            through to market weight on a managed feeding regime; dairy cattle are kept for
            ongoing milk production. Select stock is also retained for breeding to grow the
            herd over time.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Rotational grazing paired with supplementary feed to keep pasture healthy year-round.</li>
            <li>• Scheduled veterinary checks, vaccination and deworming for the whole herd.</li>
            <li>• Milk collected and handled under cold-chain conditions before it reaches the supply pool.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in cattle produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
