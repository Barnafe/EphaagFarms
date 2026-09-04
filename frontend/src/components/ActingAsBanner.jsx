import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useActingAs } from "../context/ActingAsContext.jsx";

// Shown at the top of a department's own DashboardShell whenever that
// department is being visited via "Login As" (see LoginAsPage.jsx /
// ActingAsContext.jsx). Self-contained — reads actingAs straight from
// context, so any department page can just drop this in without wiring
// props. Renders nothing when actingAs is empty (i.e. the department was
// reached directly from the Departments grid, not via Login As).
export default function ActingAsBanner() {
  const navigate = useNavigate();
  const { actingAs, setActingAs } = useActingAs();

  if (!actingAs) return null;

  function handleExit() {
    setActingAs(null);
    navigate("/admin");
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-card border border-harvest-400/40 bg-harvest-400/10 px-4 py-2.5">
      <p className="text-sm text-canopy-100">
        <span className="font-medium text-white">Acting as: {actingAs}</span> — navigating and
        acting just as that department's head would.
      </p>
      <button
        type="button"
        onClick={handleExit}
        className="flex shrink-0 items-center gap-1 rounded-card px-2 py-1 text-xs font-medium text-canopy-100 hover:bg-canopy-800 hover:text-white"
      >
        <X size={14} />
        Exit
      </button>
    </div>
  );
}
