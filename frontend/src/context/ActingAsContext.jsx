import { createContext, useContext, useEffect, useRef, useState } from "react";

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
// Back-button trap (2026-09-05 spec): once acting as a department, the
// device back button must never surface any admin page — the Exit button
// (ActingAsBanner.jsx) is the only sanctioned way out. While actingAs is
// set, every popstate (back/forward) is caught and immediately cancelled by
// re-pushing the current URL, so the browser's back gesture is inert for as
// long as you're "inside" a department. Exiting clears actingAs first (see
// handleExit), which lets the very next back/forward through normally.
export function ActingAsProvider({ children }) {
  const [actingAs, setActingAsState] = useState(() => sessionStorage.getItem(STORAGE_KEY) || null);
  const trapInstalled = useRef(false);

  function setActingAs(department) {
    setActingAsState(department);
    if (department) sessionStorage.setItem(STORAGE_KEY, department);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  useEffect(() => {
    if (!actingAs) {
      trapInstalled.current = false;
      return;
    }

    // Establish one extra history entry to absorb the first back-press,
    // then re-arm it on every subsequent popstate so back can never move
    // past this point while actingAs is set.
    if (!trapInstalled.current) {
      window.history.pushState({ actingAsTrap: true }, "", window.location.href);
      trapInstalled.current = true;
    }

    function reArmTrap() {
      window.history.pushState({ actingAsTrap: true }, "", window.location.href);
    }

    window.addEventListener("popstate", reArmTrap);
    return () => window.removeEventListener("popstate", reArmTrap);
  }, [actingAs]);

  return (
    <ActingAsContext.Provider value={{ actingAs, setActingAs }}>{children}</ActingAsContext.Provider>
  );
}

export function useActingAs() {
  return useContext(ActingAsContext);
}
