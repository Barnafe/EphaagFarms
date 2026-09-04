import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { API_ORIGIN } from "../api/client.js";
import logo from "../assets/logo.png";

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Shared "everything lives behind one constant left menu" shell used by
// every member room (Farmer, Buyer, Processor, Investor, ...). Matches the
// reference layout: logo at the top, a fixed list of rooms down the left
// that never changes no matter what's open, and the active room's content
// on the right. Clicking a menu item swaps the content in place — no more
// "back, back, back to reach the dashboard" navigation.
//
// items: [{ key, label, icon: LucideComponent }]
// activeKey / onSelect: which item is showing + how to switch
export default function DashboardShell({ items, activeKey, onSelect, children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  // Closed by default on EVERY screen size — the whole nav lives behind the
  // hamburger now, not just on mobile, so the working area isn't competing
  // with a permanently-visible menu column. Opening it slides an overlay in
  // over the content rather than pushing it, on desktop and mobile alike.
  const [navOpen, setNavOpen] = useState(false);

  const user = session?.user;

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="flex min-h-screen bg-canopy-950">
      {/* ---------------- Sidebar (hamburger-triggered slide-out overlay, all breakpoints) ---------------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 transform bg-canopy-900 shadow-2xl transition-transform duration-200 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2.5 px-5 py-5">
            <Link to="/" className="flex items-center gap-2.5">
              <img src={logo} alt="Ephaag Farms" className="h-10 w-10 object-contain" />
              <span className="font-display text-lg font-semibold text-white">Ephaag Farms</span>
            </Link>
            <button
              aria-label="Close menu"
              onClick={() => setNavOpen(false)}
              className="rounded p-1 text-canopy-100 hover:bg-canopy-800 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeKey;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onSelect(item.key);
                    setNavOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-clay-700 text-white"
                      : "text-canopy-100 hover:bg-canopy-800 hover:text-white"
                  }`}
                >
                  {Icon && <Icon size={18} className="shrink-0" />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-3 py-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left text-sm font-medium text-canopy-100 hover:bg-canopy-800 hover:text-white"
            >
              <LogOut size={18} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      {navOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-20 bg-black/40"
        />
      )}

      {/* ---------------- Main column (full width now that nav is an overlay, not a static column) ---------------- */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 bg-canopy-900 px-4 py-3 md:px-8">
          <button
            className="flex items-center gap-2 rounded p-1.5 text-white hover:bg-canopy-800"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
            <span className="hidden text-sm font-medium text-canopy-100 sm:block">
              {items.find((i) => i.key === activeKey)?.label}
            </span>
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-card px-2 py-1.5 text-white hover:bg-canopy-800"
            >
              {user?.photoUrl || user?.photo_url ? (
                <img
                  src={`${API_ORIGIN}${user.photoUrl || user.photo_url}`}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-clay-700 text-xs font-semibold">
                  {initials(user?.name)}
                </span>
              )}
              <span className="hidden text-sm sm:block">{user?.name}</span>
              <ChevronDown size={16} />
            </button>

            {menuOpen && (
              <div className="on-light absolute right-0 z-40 mt-2 w-44 rounded-card border border-soil-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSelect("profile");
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-ink-800 hover:bg-soil-50"
                >
                  Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="block w-full px-4 py-2 text-left text-sm text-ink-800 hover:bg-soil-50"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 bg-canopy-950 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
