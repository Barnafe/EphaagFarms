import { createContext, useContext, useState } from "react";

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
export function ActingAsProvider({ children }) {
  const [actingAs, setActingAsState] = useState(() => sessionStorage.getItem(STORAGE_KEY) || null);

  function setActingAs(department) {
    setActingAsState(department);
    if (department) sessionStorage.setItem(STORAGE_KEY, department);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <ActingAsContext.Provider value={{ actingAs, setActingAs }}>{children}</ActingAsContext.Provider>
  );
}

export function useActingAs() {
  return useContext(ActingAsContext);
}
