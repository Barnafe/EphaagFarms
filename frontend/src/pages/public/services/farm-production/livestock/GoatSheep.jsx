import { Link } from "react-router-dom";
import RoomHero from "../../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../../components/public-services/RoomBackLink.jsx";
import { themes } from "../../../../../utils/serviceThemes.js";

export default function GoatSheep() {
  return (
    <div>
      <RoomHero
        theme={themes.farmProduction}
        eyebrow="Livestock farming → Goat & Sheep"
        title="Goat & sheep farming"
        description="Small ruminants raised for meat — a lower-cost, faster-turnaround line alongside our larger livestock operations."
        badge="🐐"
      />
      <RoomBackLink to="/services/farm-production/livestock" label="Livestock farming" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">What we raise</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Goats and sheep are raised together on the same pens and grazing land, offering
            a shorter production cycle than cattle. They're a steady meat supply line that
            scales more easily and turns over faster than the larger livestock operations.
          </p>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How it's managed</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Mixed grazing and supplementary feed, with pens rotated to manage pasture.</li>
            <li>• Routine deworming and health checks across the flock.</li>
            <li>• Animals moved to market weight before entering the same supply pool as sourced produce.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Interested in goat or sheep produce?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to see current pricing and place an order.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
