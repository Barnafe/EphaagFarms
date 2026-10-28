import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";

const ActingAsContext = createContext(null);
const STORAGE_KEY = "ephaag_acting_as";

// "Login As" (2026-09-03 spec) doesn't need a real credential swap or a
// second token — every /admin/* route is already gated by role_type='admin'
// alone (not by department_head_of), so an admin account can already do
// everything a department head can, on every department page, the moment
// they're logged in. What was actually missing was the UX: a clear "you are
// now acting as Procurement" framing so navigating into a department feels
// like stepping into that seat, plus an easy way back out. This context is
// exactly that label — it drives the "Acting as: X" banner and the Exit
// button in AdminDashboardShell, nothing more. sessionStorage (not
// localStorage) so it clears itself when the browser tab closes, same
// lifetime as "being inside" that department for this session.
//
// Back-button guard (replaces the 2026-09-05 "trap"): once acting as a
// department, the device back button must never surface an admin page — the
// Exit button (ActingAsBanner.jsx) is the only sanctioned way out. The old
// trap re-pushed the current URL on EVERY back press, which made back inert
// after one step (Finance → Budget → Back → Back did nothing, and the router
// had already rendered the previous page before the URL was put back). Now
// back/forward move through the department's own tabs and sections normally
// (see hooks/useUrlState.js); the guard only steps in when a back/forward
// would land OUTSIDE the department page it started from, and sends the user
// straight back into it (replace, before anything is painted).
// Exiting clears actingAs and the stored department path first (see
// handleExit), which lets the very next back/forward through normally.
const PATH_KEY = "ephaag_acting_path";

export function ActingAsProvider({ children }) {
  const [actingAs, setActingAsState] = useState(() => sessionStorage.getItem(STORAGE_KEY) || null);
  const navigate = useNavigate();

  // homePath: the department page being entered (e.g. "/admin/finance").
  function setActingAs(department, homePath = null) {
    setActingAsState(department);
    if (department) {
      sessionStorage.setItem(STORAGE_KEY, department);
      if (homePath) sessionStorage.setItem(PATH_KEY, homePath);
      // Written to the server's security log (best effort — never blocks the screen).
      apiFetch("/security/acting-as", { method: "POST", body: { department } }).catch(() => {});
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(PATH_KEY);
    }
  }

  useEffect(() => {
    if (!actingAs) return undefined;

    function guard() {
      const home = sessionStorage.getItem(PATH_KEY);
      if (!home) return; // path unknown (older session): leave back alone rather than trap it
      const here = window.location.pathname;
      if (here === home || here.startsWith(`${home}/`)) return; // still inside the department: normal back
      navigate(home, { replace: true });
    }

    window.addEventListener("popstate", guard);
    return () => window.removeEventListener("popstate", guard);
  }, [actingAs, navigate]);

  return (
    <ActingAsContext.Provider value={{ actingAs, setActingAs }}>{children}</ActingAsContext.Provider>
  );
}

export function useActingAs() {
  return useContext(ActingAsContext);
}
