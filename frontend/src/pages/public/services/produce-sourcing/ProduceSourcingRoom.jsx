import { Link } from "react-router-dom";
import RoomHero from "../../../../components/public-services/RoomHero.jsx";
import RoomBackLink from "../../../../components/public-services/RoomBackLink.jsx";
import PriceTable from "../../../../components/public-services/PriceTable.jsx";
import { themes } from "../../../../utils/serviceThemes.js";

const priceRows = [
  { crop: "Maize", unit: "per bag", price: "₦38,000" },
  { crop: "Rice (paddy)", unit: "per bag", price: "₦52,000" },
  { crop: "Cassava", unit: "per ton", price: "₦95,000" },
  { crop: "Yam", unit: "per tuber", price: "₦2,500" },
  { crop: "Tomatoes", unit: "per crate", price: "₦18,000" },
  { crop: "Pepper", unit: "per basket", price: "₦12,000" },
];

export default function ProduceSourcingRoom() {
  return (
    <div>
      <RoomHero
        theme={themes.produceSourcing}
        eyebrow="Produce sourcing"
        title="Standardized pricing, sourced directly from farmers"
        description="EPHAAG Farms buys directly from its farmer network at one published price per crop — no bargaining, no middlemen, and no price that changes depending on who's buying."
        badge="₦"
      />
      <RoomBackLink to="/" label="Back to home" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-ink-900">How pricing works</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Prices aren't negotiated order by order. Once a year, EPHAAG Farms holds a
            research and review meeting with farmers and buyers to agree on a standardized
            price for each crop — the same price applies nationwide until the next review.
            This protects farmers from underpricing and gives buyers a price they can plan
            around.
          </p>
        </div>

        <div className="mt-8">
          <h2 className="font-display text-xl font-semibold text-ink-900">Current standard prices</h2>
          <p className="mt-2 text-sm text-ink-600">Last reviewed at the most recent annual pricing meeting.</p>
          <div className="mt-4">
            <PriceTable rows={priceRows} theme={themes.produceSourcing} />
          </div>
        </div>

        <div className="mt-8 card">
          <h2 className="font-display text-lg font-semibold text-ink-900">How sourcing is coordinated</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>• Local reps in every region match buyer orders to nearby farmers by crop and location.</li>
            <li>• A single order can be split across multiple farmers if that's what it takes to fill it.</li>
            <li>• Every order also passes through processing before it reaches Store and Transport — see Logistics & tracking for what happens next.</li>
          </ul>
        </div>

        <div className="mt-10 rounded-card bg-gradient-to-br from-canopy-800 to-canopy-900 p-8 text-center text-white">
          <h3 className="font-display text-xl font-bold">Ready to place an order?</h3>
          <p className="mt-2 text-sm text-canopy-100/90">Register as a buyer to browse the live catalog and check out.</p>
          <Link to="/register" className="mt-5 inline-block rounded-card bg-harvest-400 px-6 py-3 text-sm font-semibold text-canopy-900">
            Register today
          </Link>
        </div>
      </div>
    </div>
  );
}
