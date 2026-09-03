import { pool } from "../db/pool.js";

// Loads the requester's farmer_profiles row (rank) PLUS their location
// fields from users (state/lga/ward/unit), and attaches the merged result
// to req.farmerProfile. Location lives on `users`, not `farmer_profiles`,
// so this join is required — req.user only ever carries the JWT payload
// (id, role_type, name), never location.
export async function attachFarmerProfile(req, res, next) {
  const { rows } = await pool.query(
    `SELECT fp.*, u.state, u.lga, u.ward, u.unit
     FROM farmer_profiles fp
     JOIN users u ON u.id = fp.user_id
     WHERE fp.user_id = $1`,
    [req.user.id]
  );
  req.farmerProfile = rows[0] || null;
  next();
}

export function requireFarmerRank(...allowedRanks) {
  return (req, res, next) => {
    if (!req.farmerProfile || !allowedRanks.includes(req.farmerProfile.rank)) {
      return res.status(403).json({ error: "Not allowed at your current rank" });
    }
    next();
  };
}

// --- Admin temporary universal access (2026-08-30 spec) --------------------
// "I want all the functions starting from unit leader to departmental
// heads... to also be done by admin... temporary, worth doing for now...
// once things settle, we will completely remove the authorization access
// from the admin profile." Department-head screens were already fully
// admin-accessible before this (they're gated by role_type='admin', not by
// a specific department_head_of match) — the actual gap was here: Unit
// Leader/Federal functions are gated by a FARMER's rank
// (farmer_profiles.rank), and an admin account has no farmer_profile at
// all. This is the single combined middleware for that gap — it replaces
// `attachFarmerProfile` + `requireFarmerRank(...)` wherever a route needs
// "this farmer rank, OR any admin". Admin is treated as having
// company-wide authority rather than one specific jurisdiction — there's
// no sensible "which unit is the admin the leader of" answer, so admin
// bypasses the rank/jurisdiction check entirely rather than being asked to
// pick one. Controllers that scope by req.farmerProfile still need their
// own `if (req.user.role_type === 'admin')` branch for the company-wide
// case — see jurisdictionFilter/jurisdictionOverview/recordAttendance/
// pendingForMyUnit/recommendLoan.
export function requireFarmerRankOrAdmin(...allowedRanks) {
  return (req, res, next) => {
    if (req.user.role_type === "admin") return next();
    attachFarmerProfile(req, res, (err) => {
      if (err) return next(err);
      requireFarmerRank(...allowedRanks)(req, res, next);
    });
  };
}
