import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function Poultry() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Livestock farming → Poultry"
        title="Poultry farming"
        description="Broilers for meat and layers for egg production, raised on company-owned farms under close health and biosecurity management."
        badge="🐔"
      />
      <RoomBackLink to="/services/farm-production/livestock" label="Livestock farming" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we raise</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Our poultry operation covers two lines: broilers, raised for meat and taken to
            market weight on a controlled feeding schedule, and layers, kept for consistent
            egg production over a longer laying cycle. Both are housed separately to match
            their different feeding, lighting and space needs.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Vaccination and health checks on a fixed schedule, with a resident farm attendant per house.</li>
            <li>• Feed formulated for growth stage — starter, grower and finisher for broilers; layer mash for egg birds.</li>
            <li>• Biosecurity controls at every house entry point to limit disease spread across flocks.</li>
            <li>• Output moves straight into the same supply pool as sourced produce, ready for Processor and Store handling.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in poultry produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
