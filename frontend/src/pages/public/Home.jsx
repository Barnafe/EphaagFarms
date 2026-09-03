import { Link } from "react-router-dom";
import HeroCarousel from "../../components/HeroCarousel.jsx";

const stats = [
  { num: "6", label: "Roles on one platform" },
  { num: "5", label: "Governance tiers, top to bottom" },
  { num: "6", label: "Internal departments" },
  { num: "Nationwide", label: "Open from day one" },
];

const services = [
  { icon: "$", color: "bg-canopy-600", title: "Produce sourcing", desc: "Standardized pricing, direct from farmers, coordinated through local reps in every region.", to: "/services/produce-sourcing" },
  { icon: "🌾", color: "bg-canopy-900", title: "Farm production", desc: "We also grow — company-owned farms across multiple crops, adding directly to what we supply.", to: "/services/farm-production" },
  { icon: "%", color: "bg-clay-600", title: "Farmer financing", desc: "Aid and interest loans to fund production, reviewed by farmers' own local leaders.", to: "/services/farmer-financing" },
  { icon: "→", color: "bg-harvest-400", title: "Logistics & tracking", desc: "From processing to delivery, every shipment carries a reference you can trace.", to: "/services/logistics" },
  { icon: "+", color: "bg-clay-600", title: "Seminal", desc: "Free training courses, with materials and sessions hosted online.", to: "/services/seminal" },
  { icon: "≈", color: "bg-canopy-600", title: "Investment plans", desc: "Monthly or bulk investment plans with transparent, year-by-year returns.", to: "/services/investment" },
];

const whyPoints = [
  "Standardized pricing, reviewed and set with both farmers and buyers in mind",
  "Local accountability through a structured, top-to-bottom governance model",
  "Transparent tracking from sourcing through to final delivery",
  "Free ongoing education to help farmers raise their standards",
];

export default function Home() {
  return (
    <div>
      <HeroCarousel />

      <div className="mx-auto max-w-3xl px-6 py-14 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="h-2 w-2 rotate-45 bg-clay-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-clay-600">
            One platform, the whole value chain
          </span>
        </div>
        <h1 className="font-body text-3xl font-bold leading-tight text-ink-900 sm:text-4xl">
          Feeding humanity with safe food through sustainable agriculture
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-600">
          Ephaag Farms connects farmers, buyers, processors, transporters, distributors,
          and investors on one platform — sourcing and producing at a fair price, and
          coordinating every step through to delivery.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="btn-primary px-6 py-3 text-sm">
            Register →
          </Link>
          <Link to="/about" className="btn px-6 py-3 text-sm border border-soil-200 text-ink-800 hover:border-clay-600">
            See how it works
          </Link>
        </div>
      </div>

      <div className="bg-canopy-800 py-9">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 text-center sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="font-display text-3xl font-semibold text-harvest-400">{s.num}</p>
              <p className="mt-1 text-xs font-medium text-canopy-100">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-body text-2xl font-bold text-ink-900 sm:text-3xl">Our services</h2>
          <p className="mt-3 text-sm text-ink-600">
            Comprehensive coverage across the agricultural value chain, from sourcing and
            production to delivery.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link
              key={s.title}
              to={s.to}
              className="group relative overflow-hidden card transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-canopy-600 to-clay-600 transition-transform duration-300 group-hover:scale-x-100" />
              <div className={`flex h-11 w-11 rotate-45 items-center justify-center rounded ${s.color}`}>
                <span className="-rotate-45 text-lg font-semibold text-white">{s.icon}</span>
              </div>
              <p className="mt-5 font-medium text-ink-900">{s.title}</p>
              <p className="mt-2 text-sm text-ink-600">{s.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-canopy-800 group-hover:gap-2 transition-all">
                Explore →
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-canopy-900 py-16 text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 sm:grid-cols-2">
          <div>
            <h2 className="font-body text-2xl font-bold sm:text-3xl">Why Ephaag Farms?</h2>
            <p className="mt-4 max-w-md text-sm text-canopy-100/90">
              We sit at the center of the value chain so no single actor bears the risk
              of price volatility, financing gaps, or delivery uncertainty alone.
            </p>
            <ul className="mt-7 space-y-4">
              {whyPoints.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-canopy-100">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-clay-600 text-xs text-white">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-clay-600 to-clay-800 p-8">
            <h3 className="font-body text-xl font-bold">Ready to grow with us?</h3>
            <p className="mt-3 text-sm text-clay-50/90">
              Whether you're a farmer, buyer, or investor, there's a place for you on Ephaag Farms.
            </p>
            <Link to="/register" className="mt-6 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-clay-600">
              Register today
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
