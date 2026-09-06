import { pool } from "../db/pool.js";

// Universal referral summary — every registered member gets this, not
// just investors (see 001_init.sql section 18 for why this is a separate
// system from the investor-only referrals/partner-bonus tables).

export async function myReferrals(req, res) {
  const { rows: meRows } = await pool.query(
    `SELECT referral_code FROM users WHERE id = $1`,
    [req.user.id]
  );
  const code = meRows[0]?.referral_code || null;

  const { rows: referred } = await pool.query(
    `SELECT u.id, u.name, u.role_type, mr.created_at AS joined_at
     FROM member_referrals mr
     JOIN users u ON u.id = mr.referred_id
     WHERE mr.referrer_id = $1
     ORDER BY mr.created_at DESC`,
    [req.user.id]
  );

  res.json({
    code,
    referredCount: referred.length,
    referred: referred.map((r) => ({
      id: r.id,
      name: r.name,
      roleType: r.role_type,
      joinedAt: r.joined_at,
    })),
  });
}
