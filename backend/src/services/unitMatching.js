// Finds the unit a farmer belongs to from where they live. Never typed by hand.
//   1. GPS pin: the closest official unit that has a pin, if it is within the allowed distance.
//   2. No pin (or nothing close): the community / street names each unit lists, ward first, then LGA.
//   3. Still nothing: the only official unit in the farmer's ward, if there is exactly one.
// Anything else is "no unit found": the farmer keeps their current unit and the admins are told.
import { pool } from "../db/pool.js";
import { getSetting } from "../utils/settings.js";

export const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\b(street|st|road|rd|avenue|ave|close|crescent|layout|estate|quarters|area|village|community)\b/g, " ").replace(/\s+/g, " ").trim();

export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function unitMatchMaxKm(runner = pool) {
  const v = Number(await getSetting("unit_match_max_km", 15, runner));
  return Number.isFinite(v) && v > 0 ? v : 15;
}

/** Every unit that has a Unit Leader is an official unit, even before anyone has pinned it. */
export async function syncCatalogFromLeaders(runner = pool) {
  await runner.query(
    `INSERT INTO unit_catalog (name, state, lga, ward, source)
     SELECT DISTINCT u.unit, u.state, u.lga, u.ward, 'leader'
       FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
      WHERE fp.rank = 'Unit Leader' AND u.unit IS NOT NULL AND u.state IS NOT NULL AND u.lga IS NOT NULL AND u.ward IS NOT NULL
     ON CONFLICT DO NOTHING`);
}

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** @returns {{ unit: object|null, method: string, distanceKm: number|null }} */
export async function matchUnit(runner, { state, lga, ward, community, street, lat, lng }) {
  await syncCatalogFromLeaders(runner);
  const { rows: all } = await runner.query(
    `SELECT id, name, state, lga, ward, lat, lng, communities FROM unit_catalog WHERE active = TRUE AND lower(state) = lower($1)`, [state || ""]);
  if (!all.length) return { unit: null, method: "none", distanceKm: null };

  // 1) GPS
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const maxKm = await unitMatchMaxKm(runner);
    let best = null;
    for (const u of all) {
      if (u.lat === null || u.lng === null) continue;
      const d = haversineKm(lat, lng, Number(u.lat), Number(u.lng));
      if (!best || d < best.d) best = { u, d };
    }
    if (best && best.d <= maxKm) return { unit: best.u, method: "gps", distanceKm: Math.round(best.d * 100) / 100 };
  }

  // 2) community / street names (same ward first, then same LGA)
  const needles = [community, street].map(norm).filter((n) => n.length >= 3);
  if (needles.length) {
    const hits = (u) => needles.some((n) => [u.name, ...(u.communities || [])].map(norm).some((c) => c && (c === n || c.includes(n) || n.includes(c))));
    const inWard = all.filter((u) => same(u.lga, lga) && same(u.ward, ward) && hits(u));
    if (inWard.length) return { unit: inWard[0], method: "community", distanceKm: null };
    const inLga = all.filter((u) => same(u.lga, lga) && hits(u));
    if (inLga.length) return { unit: inLga[0], method: "community", distanceKm: null };
  }

  // 3) the only unit in the ward
  const wardUnits = all.filter((u) => same(u.lga, lga) && same(u.ward, ward));
  if (wardUnits.length === 1) return { unit: wardUnits[0], method: "ward_only", distanceKm: null };
  return { unit: null, method: "none", distanceKm: null };
}
