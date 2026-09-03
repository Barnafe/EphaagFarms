import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function FishAquaculture() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Livestock farming → Fish & Aquaculture"
        title="Fish & aquaculture"
        description="Pond and tank-based fish farming, focused on catfish and tilapia, from fingerling to table size."
        badge="🐟"
      />
      <RoomBackLink to="/services/farm-production/livestock" label="Livestock farming" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we raise</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Our aquaculture operation runs earthen ponds and tank systems stocked with
            catfish and tilapia. Fish move through clearly staged grow-out periods — from
            fingerling to juvenile to table size — with water quality and feeding managed
            at each stage.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Regular water quality checks and pond/tank rotation to manage stocking density.</li>
            <li>• Feed formulated per growth stage, with intake monitored to control feed conversion.</li>
            <li>• Harvest timed to table-size weight, then moved into the same supply pool as sourced produce.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in fish produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
