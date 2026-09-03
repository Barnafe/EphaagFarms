import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

const exploreLinks = [
  { to: "/", label: "Home" },
  { to: "/products-services", label: "Products/Services" },
  { to: "/research-education", label: "Research & education" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

const serviceLinks = [
  "Produce sourcing",
  "Farmer financing",
  "Logistics & tracking",
  "Investment plans",
];

export default function Footer() {
  return (
    <footer className="bg-canopy-900 text-canopy-100">
      <div className="mx-auto max-w-6xl px-6 pt-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <img src={logo} alt="Ephaag Farms" className="h-10 w-10 object-contain" />
              <span className="font-display text-base text-white">Ephaag Farms</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-canopy-100/80">
              Feeding humanity with safe food — one platform connecting every
              actor in the agricultural value chain.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-white">Quick links</p>
            <ul className="mt-3 space-y-2 text-sm">
              {exploreLinks.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-white">Services</p>
            <ul className="mt-3 space-y-2 text-sm">
              {serviceLinks.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-white">Contact info</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>Yelwa Makaranta, Opp. College of Agric, Bauchi State</li>
              <li>No. 05, Old Bridge, Bauchi State</li>
              <li>0912 446 0161 · 0901 422 5327</li>
              <li>ephaagfarms@gmail.com</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/10 py-6 sm:flex-row sm:items-center">
          <p
            className="px-4 py-1.5 text-xs font-semibold text-white bg-clay-600"
            style={{ clipPath: "polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%)" }}
          >
            Feeding humanity with safe food
          </p>
          <p className="text-xs text-canopy-100/60">
            © {new Date().getFullYear()} Ephaag Farms. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
