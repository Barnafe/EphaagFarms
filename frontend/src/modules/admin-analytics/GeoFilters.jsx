import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client.js";

export const GEO_LEVELS = ["state", "lga", "ward", "unit"];
const LABEL = { state: "State", lga: "LGA", ward: "Ward", unit: "Unit" };

/** The location filter lives in the page address (?state=&lga=&ward=&unit=), so a view can be shared or printed as it is. */
export function useGeoFilter() {
  const [params, setParams] = useSearchParams();
  const geo = useMemo(() => Object.fromEntries(GEO_LEVELS.map((l) => [l, params.get(l) || ""])), [params]);
  const setLevel = useCallback((level, value) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      const at = GEO_LEVELS.indexOf(level);
      if (value) p.set(level, value); else p.delete(level);
      GEO_LEVELS.slice(at + 1).forEach((l) => p.delete(l)); // choosing a state clears the LGA, ward and unit under it
      return p;
    }, { replace: true });
  }, [setParams]);
  const clear = useCallback(() => setParams((prev) => { const p = new URLSearchParams(prev); GEO_LEVELS.forEach((l) => p.delete(l)); return p; }, { replace: true }), [setParams]);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    GEO_LEVELS.forEach((l) => geo[l] && p.set(l, geo[l]));
    return p.toString();
  }, [geo]);
  return { geo, setLevel, clear, qs };
}

export function describeGeo(geo) {
  const parts = GEO_LEVELS.filter((l) => geo[l]).map((l) => `${LABEL[l]}: ${geo[l]}`);
  return parts.length ? parts.join(" > ") : "All of Nigeria";
}

export default function GeoFilters({ geo, setLevel, clear }) {
  const [options, setOptions] = useState({ states: [], lgas: [], wards: [], units: [] });
  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams();
    GEO_LEVELS.slice(0, 3).forEach((l) => geo[l] && p.set(l, geo[l]));
    apiFetch(`/analytics/geo-options?${p.toString()}`).then((o) => { if (!cancelled) setOptions(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, [geo.state, geo.lga, geo.ward]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = { state: options.states, lga: options.lgas, ward: options.wards, unit: options.units };
  const any = GEO_LEVELS.some((l) => geo[l]);
  return (
    <div className="card space-y-2" data-testid="geo-filters">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-900">Where</p>
        {any && <button type="button" className="text-xs text-canopy-700 underline" onClick={clear}>Show all of Nigeria</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {GEO_LEVELS.map((level, i) => {
          const parentChosen = i === 0 || geo[GEO_LEVELS[i - 1]];
          return (
            <div key={level}>
              <label htmlFor={`geo-${level}`} className="text-xs text-ink-600">{LABEL[level]}</label>
              <select
                id={`geo-${level}`}
                className="mt-1 w-full rounded-card border border-soil-200 px-2 py-2 text-sm disabled:bg-soil-50 disabled:text-ink-400"
                value={geo[level]}
                disabled={!parentChosen}
                onChange={(e) => setLevel(level, e.target.value)}
              >
                <option value="">{parentChosen ? `All ${LABEL[level]}s` : `Choose a ${LABEL[GEO_LEVELS[i - 1]]} first`}</option>
                {list[level].map((v) => <option key={v} value={v}>{v}</option>)}
                {geo[level] && !list[level].includes(geo[level]) && <option value={geo[level]}>{geo[level]}</option>}
              </select>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-600">Showing: {describeGeo(geo)}. Every chart on this page follows this filter.</p>
    </div>
  );
}
