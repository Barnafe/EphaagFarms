import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.png";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/products-services", label: "Products/Services" },
  { to: "/research-education", label: "Research & education" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Header() {
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);

  // Shared between the desktop row and the mobile dropdown so the two
  // never drift out of sync with each other.
  const authLinks = session ? (
    <>
      <Link
        to={session.type === "admin" ? "/admin" : `/dashboard/${session.role}`}
        onClick={() => setOpen(false)}
        className="btn whitespace-nowrap border border-white/30 px-3 py-1.5 text-white hover:border-white"
      >
        My dashboard
      </Link>
      <button
        onClick={() => {
          setOpen(false);
          logout();
        }}
        className="btn whitespace-nowrap border border-white/30 px-3 py-1.5 text-white hover:border-white"
      >
        Log out
      </button>
    </>
  ) : (
    <>
      <Link
        to="/login/admin"
        onClick={() => setOpen(false)}
        className="btn whitespace-nowrap border border-white/30 px-3 py-1.5 text-white hover:border-white"
      >
        Login (admin)
      </Link>
      <Link
        to="/login/member"
        onClick={() => setOpen(false)}
        className="btn whitespace-nowrap border border-white/30 px-3 py-1.5 text-white hover:border-white"
      >
        Login (member)
      </Link>
      <Link to="/register" onClick={() => setOpen(false)} className="btn-primary whitespace-nowrap px-3 py-1.5">
        Register
      </Link>
    </>
  );

  return (
    <header className="bg-canopy-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <img src={logo} alt="Ephaag Farms" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
          <span className="font-display text-lg font-semibold text-white sm:text-xl">Ephaag Farms</span>
        </Link>

        {/* Desktop nav + actions — only shown once there's genuinely enough
            room for the logo + 5 links + 3 buttons on one line (xl+).
            Anything narrower (including most laptop windows) gets the
            hamburger below instead of a squeezed, wrapping row. */}
        <nav className="hidden gap-0.5 text-sm xl:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded px-2.5 py-2 font-medium ${
                  isActive
                    ? "bg-canopy-800 text-white border-b-2 border-clay-600"
                    : "text-canopy-100 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden shrink-0 gap-1.5 xl:flex">{authLinks}</div>

        {/* Hamburger toggle — covers everything below xl, including normal
            laptop widths (~1024-1280px), so the nav never gets a chance to
            wrap into a messy multi-row mess. */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center rounded p-2 text-white hover:bg-canopy-800 xl:hidden"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile/tablet dropdown panel */}
      {open && (
        <div className="border-t border-white/10 bg-canopy-900 px-4 pb-5 pt-2 xl:hidden">
          <nav className="flex flex-col gap-1 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded px-3 py-2.5 font-medium ${
                    isActive ? "bg-canopy-800 text-white" : "text-canopy-100 hover:bg-canopy-800 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">{authLinks}</div>
        </div>
      )}
    </header>
  );
}
