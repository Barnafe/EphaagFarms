import { pool } from "../db/pool.js";
import { syncCatalogFromLeaders } from "../services/unitMatching.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
function readLocation(b) {
  const lat = num(b.lat), lng = num(b.lng);
  if ((lat === null) !== (lng === null)) return { error: "Send both the latitude and the longitude, or neither." };
  if (lat !== null && (!(lat >= 3.5 && lat <= 14.5) || !(lng >= 2.4 && lng <= 15.2))) return { error: "That location is outside Nigeria." };
  let communities = b.communities;
  if (communities !== undefined) {
    communities = (Array.isArray(communities) ? communities : String(communities).split(",")).map((c) => String(c).trim()).filter(Boolean).slice(0, 50);
  }
  return { lat, lng, communities };
}

export async function listCatalog(req, res) {
  await syncCatalogFromLeaders();
  const { rows } = await pool.query(
    `SELECT c.*, (SELECT count(*)::int FROM users u WHERE u.role_type = 'farmer' AND lower(u.state) = lower(c.state) AND lower(u.lga) = lower(c.lga) AND lower(u.ward) = lower(c.ward) AND lower(u.unit) = lower(c.name)) AS members
       FROM unit_catalog c ORDER BY c.state, c.lga, c.ward, c.name`);
  res.json({ units: rows.map((r) => ({ id: r.id, name: r.name, state: r.state, lga: r.lga, ward: r.ward, lat: r.lat === null ? null : Number(r.lat), lng: r.lng === null ? null : Number(r.lng), communities: r.communities, active: r.active, source: r.source, members: r.members })) });
}

export async function createCatalogUnit(req, res) {
  const b = req.body || {};
  const name = String(b.name || "").trim(), state = String(b.state || "").trim(), lga = String(b.lga || "").trim(), ward = String(b.ward || "").trim();
  if (!name || !state || !lga || !ward) return res.status(400).json({ error: "Name, state, LGA and ward are required." });
  const loc = readLocation(b);
  if (loc.error) return res.status(400).json({ error: loc.error });
  const { rows } = await pool.query(
    `INSERT INTO unit_catalog (name, state, lga, ward, lat, lng, communities, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'admin') ON CONFLICT DO NOTHING RETURNING id`,
    [name, state, lga, ward, loc.lat, loc.lng, loc.communities || []]);
  if (!rows[0]) return res.status(409).json({ error: "That unit already exists in that ward." });
  res.status(201).json({ id: rows[0].id });
}

export async function updateCatalogUnit(req, res) {
  if (!UUID_RE.test(String(req.params.id))) return res.status(404).json({ error: "Unit not found" });
  const b = req.body || {};
  const loc = readLocation(b);
  if (loc.error) return res.status(400).json({ error: loc.error });
  const sets = [], vals = [];
  const put = (c, v) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (b.lat !== undefined || b.lng !== undefined) { put("lat", loc.lat); put("lng", loc.lng); }
  if (loc.communities !== undefined) put("communities", loc.communities);
  if (b.active !== undefined) put("active", !!b.active);
  if (!sets.length) return res.status(400).json({ error: "Nothing to change." });
  vals.push(req.params.id);
  const { rowCount } = await pool.query(`UPDATE unit_catalog SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`, vals);
  if (!rowCount) return res.status(404).json({ error: "Unit not found" });
  res.json({ ok: true });
}

// A Unit Leader pins their own unit and lists the communities / streets it covers.
export async function setMyUnitLocation(req, res) {
  const me = req.farmerProfile;
  if (!me?.unit || !me.state || !me.lga || !me.ward) return res.status(400).json({ error: "You have no unit yet." });
  const loc = readLocation(req.body || {});
  if (loc.error) return res.status(400).json({ error: loc.error });
  const { rows } = await pool.query(
    `INSERT INTO unit_catalog (name, state, lga, ward, lat, lng, communities, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'leader')
     ON CONFLICT (lower(state), lower(lga), lower(ward), lower(name)) DO UPDATE SET lat = COALESCE(EXCLUDED.lat, unit_catalog.lat), lng = COALESCE(EXCLUDED.lng, unit_catalog.lng),
       communities = CASE WHEN $8 THEN EXCLUDED.communities ELSE unit_catalog.communities END, updated_at = now() RETURNING id`,
    [me.unit, me.state, me.lga, me.ward, loc.lat, loc.lng, loc.communities || [], loc.communities !== undefined]);
  res.json({ id: rows[0].id });
}
export async function getMyUnitLocation(req, res) {
  const me = req.farmerProfile;
  if (!me?.unit) return res.json({ unit: null });
  const { rows } = await pool.query(`SELECT * FROM unit_catalog WHERE lower(state) = lower($1) AND lower(lga) = lower($2) AND lower(ward) = lower($3) AND lower(name) = lower($4)`, [me.state, me.lga, me.ward, me.unit]);
  const r = rows[0];
  res.json({ unit: { name: me.unit, state: me.state, lga: me.lga, ward: me.ward, lat: r?.lat == null ? null : Number(r.lat), lng: r?.lng == null ? null : Number(r.lng), communities: r?.communities || [] } });
}
