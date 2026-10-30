import { useCallback, useEffect, useState } from "react";
import { Users, ShieldCheck, UserPlus, History as HistoryIcon } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import DeptSectionNav from "../../components/DeptSectionNav.jsx";

import useUrlState from "../../hooks/useUrlState.js";
import { TOP_RANK_VALUE, rankLabel } from "../../utils/governance.js";
const FARMER_RANKS = ["Member", "Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", TOP_RANK_VALUE];

const SECTIONS = [
  {
    key: "farmers",
    label: "Farmer leadership",
    icon: Users,
    description: "Search a farmer and promote or demote their governance rank.",
  },
  {
    key: "hods",
    label: "Department heads",
    icon: ShieldCheck,
    description: "Assign or remove which admin account heads each department.",
  },
  {
    key: "admins",
    label: "Admins",
    icon: UserPlus,
    description: "Promote an existing account to admin, or remove an admin. Main admin only.",
  },
  {
    key: "history",
    label: "History",
    icon: HistoryIcon,
    description: "Full audit trail of every appointment made.",
  },
];

export default function PositionsPage() {
  const [tab, setTab] = useUrlState("tab", null);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState("");
  const [farmers, setFarmers] = useState([]);
  const [rankChoice, setRankChoice] = useState({});

  const [admins, setAdmins] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [hodChoice, setHodChoice] = useState({});

  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [notice, setNotice] = useState(null);

  const [history, setHistory] = useState([]);

  const searchFarmers = useCallback(async () => {
    try {
      const qs = query ? `?q=${encodeURIComponent(query)}` : "";
      const { farmers } = await apiFetch(`/admin/positions/farmers/search${qs}`);
      setFarmers(farmers);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [query]);

  const loadHods = useCallback(async () => {
    try {
      const { admins, departments, canManageAdmins } = await apiFetch("/admin/positions/hods");
      setAdmins(admins);
      setDepartments(departments);
      setCanManageAdmins(!!canManageAdmins);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { appointments } = await apiFetch("/admin/positions/history");
      setHistory(appointments);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "farmers") searchFarmers();
    if (tab === "hods" || tab === "admins") loadHods();
    if (tab === "history") loadHistory();
  }, [tab, searchFarmers, loadHods, loadHistory]);

  async function handlePromoteFarmer(userId) {
    const rank = rankChoice[userId];
    if (!rank) return;
    try {
      await apiFetch(`/admin/positions/farmers/${userId}/promote`, { method: "POST", body: { rank } });
      await searchFarmers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDemoteFarmer(userId) {
    try {
      await apiFetch(`/admin/positions/farmers/${userId}/demote`, { method: "POST" });
      await searchFarmers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePromoteHod(userId) {
    const department = hodChoice[userId];
    if (!department) return;
    try {
      await apiFetch(`/admin/positions/hods/${userId}/promote`, { method: "POST", body: { department } });
      await loadHods();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDemoteHod(userId) {
    try {
      await apiFetch(`/admin/positions/hods/${userId}/demote`, { method: "POST" });
      await loadHods();
    } catch (err) {
      setError(err.message);
    }
  }

  async function searchCandidates(e) {
    e?.preventDefault();
    setNotice(null);
    try {
      const { users } = await apiFetch(`/admin/positions/admins/candidates?q=${encodeURIComponent(candidateQuery)}`);
      setCandidates(users);
      setError(null);
      if (users.length === 0) setNotice("No matching account found. Type at least 2 letters of a name, email or phone number.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMakeAdmin(u) {
    if (!window.confirm(`Make ${u.name} an admin? They leave their ${u.role_type} account and get the admin dashboard instead. You can remove them later to give the old account back.`)) return;
    try {
      await apiFetch(`/admin/positions/admins/${u.id}/promote`, { method: "POST" });
      setNotice(`${u.name} is now an admin. They must sign in again.`);
      setCandidates((prev) => prev.filter((c) => c.id !== u.id));
      await loadHods();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveAdmin(a) {
    if (!window.confirm(`Remove ${a.name} as an admin?`)) return;
    try {
      const { outcome } = await apiFetch(`/admin/positions/admins/${a.id}/remove`, { method: "POST" });
      setNotice(`${a.name} is no longer an admin: ${outcome}.`);
      await loadHods();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">3EI Governance model</p>
          <h1 className="text-xl font-medium text-white">Positions</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Promote or remove leadership ranks and department heads. Only agreed-upon appointments —
            nobody can promote themselves.
          </p>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <DeptSectionNav sections={SECTIONS} activeKey={tab} onSelect={setTab} deptLabel="Position sections" />

        {tab === "farmers" && (
          <div className="space-y-4">
            <div className="card">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchFarmers()}
                placeholder="Search farmer by name"
              />
              <button className="btn-outline mt-2" type="button" onClick={searchFarmers}>
                Search
              </button>
            </div>
            <div className="space-y-2">
              {farmers.map((f) => (
                <div key={f.id} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-ink-900">{f.name}</p>
                      <p className="text-xs text-ink-600">
                        {f.state}, {f.lga}, {f.ward}, {f.unit}
                      </p>
                      <p className="mt-1 text-sm text-canopy-800">Current: {rankLabel(f.rank)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={rankChoice[f.id] || ""}
                        onChange={(e) => setRankChoice((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      >
                        <option value="">Select rank</option>
                        {FARMER_RANKS.map((r) => (
                          <option key={r} value={r}>{rankLabel(r)}</option>
                        ))}
                      </select>
                      <button className="btn-primary" type="button" onClick={() => handlePromoteFarmer(f.id)}>
                        Set
                      </button>
                      {f.rank !== "Member" && (
                        <button className="btn-outline" type="button" onClick={() => handleDemoteFarmer(f.id)}>
                          Reset to Member
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {farmers.length === 0 && <p className="text-sm text-canopy-100">No farmers found.</p>}
            </div>
          </div>
        )}

        {tab === "hods" && (
          <div className="space-y-2">
            {admins.map((a) => (
              <div key={a.id} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink-900">{a.name}</p>
                    <p className="text-xs text-ink-600">{a.email}</p>
                    <p className="mt-1 text-sm text-canopy-800">
                      {a.department_head_of ? `HOD of ${a.department_head_of}` : "Not a department head"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={hodChoice[a.id] || ""}
                      onChange={(e) => setHodChoice((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    >
                      <option value="">Select department</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <button className="btn-primary" type="button" onClick={() => handlePromoteHod(a.id)}>
                      Make HOD
                    </button>
                    {a.department_head_of && (
                      <button className="btn-outline" type="button" onClick={() => handleDemoteHod(a.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "admins" && (
          <div className="space-y-4">
            {notice && <p className="text-sm text-canopy-100">{notice}</p>}
            {canManageAdmins ? (
              <form onSubmit={searchCandidates} className="card space-y-2">
                <label htmlFor="admin-candidate-search">Find an account to make admin</label>
                <div className="flex gap-2">
                  <input
                    id="admin-candidate-search"
                    className="flex-1"
                    placeholder="Name, email or phone"
                    value={candidateQuery}
                    onChange={(e) => setCandidateQuery(e.target.value)}
                  />
                  <button className="btn-primary" type="submit">Search</button>
                </div>
                {candidates.map((u) => (
                  <div key={u.id} className="flex items-center justify-between border-t border-soil-200 pt-2">
                    <div>
                      <p className="font-medium text-ink-900">{u.name}</p>
                      <p className="text-xs text-ink-600">{[u.email, u.phone].filter(Boolean).join(" · ")} · {u.role_type}</p>
                    </div>
                    <button className="btn-primary" type="button" onClick={() => handleMakeAdmin(u)}>Make admin</button>
                  </div>
                ))}
              </form>
            ) : (
              <p className="text-sm text-canopy-100">Only the main admin can add or remove admins. You can see who the admins are below.</p>
            )}
            <div className="space-y-2">
              {admins.map((a) => (
                <div key={a.id} className="card flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink-900">
                      {a.name} {a.is_main_admin && <span className="ml-2 rounded-full bg-canopy-100 px-2 py-0.5 text-xs text-canopy-800">Main admin</span>}
                    </p>
                    <p className="text-xs text-ink-600">{a.email}</p>
                    {a.department_head_of && <p className="mt-1 text-sm text-canopy-800">HOD of {a.department_head_of}</p>}
                  </div>
                  {canManageAdmins && !a.is_main_admin && (
                    <button className="btn-outline" type="button" onClick={() => handleRemoveAdmin(a)}>Remove admin</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="card text-sm">
                <p className="text-ink-900">
                  {h.user_name} → <span className="font-medium text-canopy-800">{rankLabel(h.rank)}</span>
                </p>
                <p className="text-xs text-ink-600">
                  {h.jurisdiction ? `${h.jurisdiction} · ` : ""}by {h.approved_by} ·{" "}
                  {new Date(h.created_at).toLocaleString()}
                </p>
              </div>
            ))}
            {history.length === 0 && <p className="text-sm text-canopy-100">No appointments yet.</p>}
          </div>
        )}
      </div>
    </AdminDashboardShell>
  );
}
