import { useCallback, useEffect, useState } from "react";
import {
  LayoutGrid,
  Users,
  Sprout,
  Landmark,
  PiggyBank,
  GraduationCap,
  Trophy,
  ClipboardCheck,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import DeptSectionNav from "../../components/DeptSectionNav.jsx";
import { NIGERIA_STATE_NAMES } from "../../data/nigeriaStatesLgas.js";
import AttendanceMarker from "../m2-farmer-room/AttendanceMarker.jsx";
import JurisdictionOverview from "../m2-farmer-room/JurisdictionOverview.jsx";

function BreakdownTable({ title, rows, keyLabel = "Group", valueLabel = "Count" }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">{title}</p>
      {(!rows || rows.length === 0) ? (
        <p className="mt-2 text-sm text-ink-600">No data yet.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-600">
              <th className="pb-1">{keyLabel}</th>
              <th className="pb-1 text-right">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-soil-100">
                <td className="py-1 text-ink-900">{r.key ?? r.label}</td>
                <td className="py-1 text-right text-canopy-800">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutGrid, description: "Company-wide numbers at a glance." },
  {
    key: "farmers",
    label: "Farmer survey",
    icon: Users,
    description: "Demographics — filterable by state — for the national survey mandate.",
  },
  {
    key: "produce",
    label: "Produce declarations",
    icon: Sprout,
    description: "Declared output by crop, filterable by state, for capacity queries.",
  },
  {
    key: "loans",
    label: "Loans",
    icon: Landmark,
    description: "Loan pipeline stats — aggregate, read-only.",
  },
  { key: "savings", label: "Savings", icon: PiggyBank, description: "Farmer savings totals, aggregate." },
  { key: "training", label: "Training", icon: GraduationCap, description: "Seminar and course participation." },
  { key: "ranking", label: "Farmer ranking", icon: Trophy, description: "Top-performing farmers by rank." },
  {
    key: "attendance",
    label: "Mark attendance",
    icon: ClipboardCheck,
    description: "Record seminar attendance company-wide (Unit-Leader function, admin-enabled).",
  },
];

export default function AnalyticsDepartment() {
  const [section, setSection] = useState(null);
  const [error, setError] = useState(null);

  const [overview, setOverview] = useState(null);
  const [farmerState, setFarmerState] = useState("");
  const [farmers, setFarmers] = useState(null);
  const [produceState, setProduceState] = useState("");
  const [produceCrop, setProduceCrop] = useState("");
  const [produce, setProduce] = useState(null);
  const [loans, setLoans] = useState(null);
  const [savings, setSavings] = useState(null);
  const [training, setTraining] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [attendanceFarmers, setAttendanceFarmers] = useState([]);

  const [capacityCrop, setCapacityCrop] = useState("");
  const [capacityMin, setCapacityMin] = useState("");
  const [capacityState, setCapacityState] = useState("");
  const [capacityResult, setCapacityResult] = useState(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await apiFetch("/analytics/overview"));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadFarmers = useCallback(async () => {
    try {
      const qs = farmerState ? `?state=${encodeURIComponent(farmerState)}` : "";
      setFarmers(await apiFetch(`/analytics/farmers${qs}`));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [farmerState]);

  const loadProduce = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (produceState) params.set("state", produceState);
      if (produceCrop) params.set("crop", produceCrop);
      const qs = params.toString() ? `?${params.toString()}` : "";
      setProduce(await apiFetch(`/analytics/produce${qs}`));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [produceState, produceCrop]);

  const loadLoans = useCallback(async () => {
    try {
      setLoans(await apiFetch("/analytics/loans"));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadSavings = useCallback(async () => {
    try {
      setSavings(await apiFetch("/analytics/savings"));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadTraining = useCallback(async () => {
    try {
      setTraining(await apiFetch("/analytics/training"));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadRanking = useCallback(async () => {
    try {
      const { farmers } = await apiFetch("/farmers/admin/ranking");
      setRanking(farmers);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadAttendanceFarmers = useCallback(async () => {    try {
      const { farmers } = await apiFetch("/farmers/jurisdiction");
      setAttendanceFarmers(
        farmers.map((f) => ({ id: f.id, name: f.name, unit: f.unit, attendancePct: f.attendance_pct }))
      );
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (section === "overview") loadOverview();
    if (section === "farmers") loadFarmers();
    if (section === "produce") loadProduce();
    if (section === "loans") loadLoans();
    if (section === "savings") loadSavings();
    if (section === "training") loadTraining();
    if (section === "ranking") loadRanking();
    if (section === "attendance") loadAttendanceFarmers();
  }, [section, loadOverview, loadFarmers, loadProduce, loadLoans, loadSavings, loadTraining, loadRanking, loadAttendanceFarmers]);

  async function handleCapacityQuery(e) {
    e.preventDefault();
    if (!capacityCrop || !capacityMin) return;
    try {
      const params = new URLSearchParams({ crop: capacityCrop, minQuantity: capacityMin });
      if (capacityState) params.set("state", capacityState);
      setCapacityResult(await apiFetch(`/analytics/produce/capacity?${params.toString()}`));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Reports</p>
          <h1 className="text-xl font-medium text-white">Analytics</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Survey demographics, produce declarations, loans, savings, and training — all in one
            place, computed automatically.
          </p>
        </div>

        <DeptSectionNav sections={SECTIONS} activeKey={section} onSelect={setSection} deptLabel="Analytics sections" />

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {section === "overview" && overview && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BreakdownTable
              title="Users by role"
              rows={overview.usersByRole.map((r) => ({ key: r.role, value: r.count }))}
            />
            <BreakdownTable
              title="Loans by status"
              rows={overview.loansByStatus.map((r) => ({ key: r.status, value: r.count }))}
            />
            <div className="card">
              <p className="text-sm text-ink-600">Total savings on platform</p>
              <p className="mt-1 text-2xl font-medium text-canopy-800">
                ₦{overview.totalSavings.toLocaleString()}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-ink-600">Produce declarations</p>
              <p className="mt-1 text-2xl font-medium text-canopy-800">{overview.distinctCropsDeclared} crops</p>
              <p className="text-xs text-ink-600">from {overview.farmersWithDeclarations} farmers</p>
            </div>
            <div className="card">
              <p className="text-sm text-ink-600">Buy Shares</p>
              <p className="mt-1 text-2xl font-medium text-canopy-800">{overview.farmerShares.count}</p>
              <p className="text-xs text-ink-600">₦{overview.farmerShares.totalInvested.toLocaleString()} invested</p>
            </div>
          </div>
        )}

        {section === "farmers" && (
          <div className="space-y-4">
            <div className="card flex items-end gap-3">
              <div className="flex-1">
                <label className="text-sm text-ink-600">Filter by state</label>
                <select
                  className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2"
                  value={farmerState}
                  onChange={(e) => setFarmerState(e.target.value)}
                >
                  <option value="">All states</option>
                  {NIGERIA_STATE_NAMES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            {farmers && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="card sm:col-span-2">
                  <p className="text-sm text-ink-600">Total farmers matching filter</p>
                  <p className="mt-1 text-2xl font-medium text-canopy-800">{farmers.totalFarmers}</p>
                </div>
                <BreakdownTable title="By gender" rows={farmers.byGender.map((r) => ({ key: r.key, value: r.count }))} />
                <BreakdownTable title="By marital status" rows={farmers.byMaritalStatus.map((r) => ({ key: r.key, value: r.count }))} />
                <BreakdownTable title="By farm type" rows={farmers.byFarmType.map((r) => ({ key: r.key, value: r.count }))} />
                <BreakdownTable title="By farm size" rows={farmers.byFarmSize.map((r) => ({ key: r.key, value: r.count }))} />
                <BreakdownTable title="By annual income band" rows={farmers.byAnnualIncome.map((r) => ({ key: r.key, value: r.count }))} />
                <BreakdownTable title="By years of experience" rows={farmers.byYearsExperience.map((r) => ({ key: r.key, value: r.count }))} />
                <BreakdownTable title="By state" rows={farmers.byState.map((r) => ({ key: r.key, value: r.count }))} />
              </div>
            )}
          </div>
        )}

        {section === "produce" && (
          <div className="space-y-4">
            <div className="card grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-ink-600">Filter by state</label>
                <select
                  className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2"
                  value={produceState}
                  onChange={(e) => setProduceState(e.target.value)}
                >
                  <option value="">All states</option>
                  {NIGERIA_STATE_NAMES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-ink-600">Filter by crop</label>
                <input
                  className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2"
                  value={produceCrop}
                  onChange={(e) => setProduceCrop(e.target.value)}
                  placeholder="e.g. Rice"
                />
              </div>
            </div>

            {produce && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <BreakdownTable
                  title="Total declared production by crop"
                  keyLabel="Crop"
                  valueLabel="Total"
                  rows={produce.byCrop.map((r) => ({ key: r.crop, value: `${r.total.toLocaleString()} ${r.unit} (${r.farmerCount} farmers)` }))}
                />
                <BreakdownTable
                  title="Total declared production by state"
                  keyLabel="State"
                  valueLabel="Total (mixed units)"
                  rows={produce.byState.map((r) => ({ key: r.state, value: `${r.total.toLocaleString()} (${r.farmerCount} farmers)` }))}
                />
              </div>
            )}

            <div className="card">
              <p className="text-sm text-ink-600">Capacity query</p>
              <p className="mt-1 text-xs text-ink-600">
                e.g. "how many farmers can produce at least 100 bags of rice" — enter the crop and
                minimum quantity below.
              </p>
              <form onSubmit={handleCapacityQuery} className="mt-3 grid gap-3 sm:grid-cols-4">
                <input
                  className="rounded-card border border-soil-200 px-3 py-2"
                  value={capacityCrop}
                  onChange={(e) => setCapacityCrop(e.target.value)}
                  placeholder="Crop, e.g. Rice"
                  required
                />
                <input
                  type="number"
                  className="rounded-card border border-soil-200 px-3 py-2"
                  value={capacityMin}
                  onChange={(e) => setCapacityMin(e.target.value)}
                  placeholder="Minimum quantity"
                  required
                />
                <select
                  className="rounded-card border border-soil-200 px-3 py-2"
                  value={capacityState}
                  onChange={(e) => setCapacityState(e.target.value)}
                >
                  <option value="">Any state</option>
                  {NIGERIA_STATE_NAMES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button className="btn-primary" type="submit">Run query</button>
              </form>
              {capacityResult && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-ink-900">
                    {capacityResult.matchingFarmerCount} farmer{capacityResult.matchingFarmerCount === 1 ? "" : "s"} match
                  </p>
                  <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                    {capacityResult.farmers.map((f) => (
                      <div key={f.userId} className="rounded-card border border-soil-200 px-3 py-1.5 text-xs">
                        {f.name} — {f.state}, {f.lga} — {f.declaredQuantity.toLocaleString()} {f.unitOfMeasure}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {section === "loans" && loans && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BreakdownTable
              title="By status"
              keyLabel="Status"
              valueLabel="Count / Total"
              rows={loans.byStatus.map((r) => ({ key: r.status, value: `${r.count} (₦${r.totalAmount.toLocaleString()})` }))}
            />
            <BreakdownTable
              title="By loan type"
              keyLabel="Type"
              valueLabel="Count / Total"
              rows={loans.byType.map((r) => ({ key: r.loanType, value: `${r.count} (₦${r.totalAmount.toLocaleString()})` }))}
            />
            <div className="card sm:col-span-2">
              <p className="text-sm text-ink-600">Repayments</p>
              <p className="mt-1 text-sm text-ink-900">
                {loans.repayments.verifiedCount} verified (₦{loans.repayments.verifiedTotal.toLocaleString()}) ·{" "}
                {loans.repayments.unverifiedCount} awaiting verification
              </p>
            </div>
          </div>
        )}

        {section === "savings" && savings && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card">
              <p className="text-sm text-ink-600">Main savings total</p>
              <p className="mt-1 text-2xl font-medium text-canopy-800">₦{savings.mainTotal.toLocaleString()}</p>
            </div>
            <div className="card">
              <p className="text-sm text-ink-600">Insurance total</p>
              <p className="mt-1 text-2xl font-medium text-harvest-600">₦{savings.insuranceTotal.toLocaleString()}</p>
            </div>
            <div className="card sm:col-span-2">
              <p className="text-sm text-ink-600">{savings.saversCount} farmers with at least one deposit</p>
            </div>
            <BreakdownTable
              title="Deposits by month (last 12)"
              keyLabel="Month"
              valueLabel="Total / Count"
              rows={savings.byMonth.map((r) => ({
                key: new Date(r.month).toLocaleDateString(undefined, { year: "numeric", month: "short" }),
                value: `₦${r.total.toLocaleString()} (${r.depositCount})`,
              }))}
            />
          </div>
        )}

        {section === "training" && training && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BreakdownTable
              title="By leadership rank"
              rows={training.byLeadershipRank.map((r) => ({ key: r.rank, value: r.count }))}
            />
            <BreakdownTable
              title="By training rank"
              rows={training.byTrainingRank.map((r) => ({ key: r.rank, value: r.count }))}
            />
          </div>
        )}

        {section === "ranking" && ranking && (
          <div className="card">
            <p className="text-sm text-ink-600">Farmers ranked by training engagement</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-600">
                    <th className="pb-1">Farmer</th>
                    <th className="pb-1">Location</th>
                    <th className="pb-1">Leadership rank</th>
                    <th className="pb-1 text-right">Quarters engaged</th>
                    <th className="pb-1 text-right">Training rank</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((f) => (
                    <tr key={f.userId} className="border-t border-soil-100">
                      <td className="py-1 text-ink-900">{f.name}</td>
                      <td className="py-1 text-ink-600">{[f.unit, f.ward, f.lga, f.state].filter(Boolean).join(", ")}</td>
                      <td className="py-1 text-ink-600">{f.leadershipRank || "—"}</td>
                      <td className="py-1 text-right text-canopy-800">{f.quartersEngaged}</td>
                      <td className="py-1 text-right text-canopy-800">{f.trainingRankLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ranking.length === 0 && <p className="mt-2 text-sm text-ink-600">No farmers yet.</p>}
          </div>
        )}

        {section === "attendance" && (
          <div className="space-y-4">
            <p className="text-xs text-ink-600">
              Normally a Unit Leader (and above)'s own rank-gated action, scoped to their jurisdiction —
              admin can mark attendance for any farmer, company-wide, for now until those roles are staffed.
            </p>
            <AttendanceMarker farmers={attendanceFarmers} onRecorded={loadAttendanceFarmers} />
            <JurisdictionOverview farmers={attendanceFarmers} rank="Admin (company-wide)" />
          </div>
        )}
      </div>
    </AdminDashboardShell>
  );
}
