import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import ConsultancyCard from "../../components/public-services/ConsultancyCard.jsx";
import HeroCarousel from "../../components/HeroCarousel.jsx";
import { services } from "../../data/services.js";

const stats = [
  { num: "5", label: "Roles on one platform" },
  { num: "3EI", label: "Governance model" },
  { num: "Nationwide", label: "Open from day one" },
];

const whyPoints = [
  "Standard prices that are fair to farmers and buyers",
  "Local accountability through 3EI Governance",
  "Tracking from sourcing to delivery",
  "Free training for farmers",
];

export default function Home() {
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView(); }, [hash]);
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
          Farmers, buyers, transporters, distributors and investors on one platform.
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
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 text-center sm:grid-cols-3">
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
          <p className="mt-3 text-sm text-ink-600">From sourcing and production to delivery.</p>
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
              One platform, so no one carries price, financing or delivery risk alone.
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
              There is a place for farmers, buyers and investors.
            </p>
            <Link to="/register" className="mt-6 inline-block rounded-card bg-white px-6 py-3 text-sm font-semibold text-clay-600">
              Register today
            </Link>
          </div>
        </div>
      </div>

      <section id="consultancy" className="bg-soil-50 py-14">
        <div className="mx-auto max-w-2xl px-6">
          <ConsultancyCard />
        </div>
      </section>
    </div>
  );
}
