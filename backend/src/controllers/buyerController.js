import { pool } from "../db/pool.js";

// --- Buyer's own profile ---------------------------------------------------
// Buyers previously had no edit flow at all (display + photo only, per the
// AccountProfileCard comment). 2026-09-01 spec: buyers get real edit tools,
// same shape as farmerController.updateMyProfile — only touch a column if
// the caller actually sent a value for it (COALESCE against the existing
// value), so a partial edit never blanks out fields it didn't mean to touch.

export async function updateMyProfile(req, res) {
  const {
    name,
    email,
    phone,
    state,
    lga,
    address,
    organizationName,
    registeredAddress,
    contactPersonName,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (name || email || phone || state || lga) {
      await client.query(
        `UPDATE users SET
           name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           state = COALESCE($4, state),
           lga = COALESCE($5, lga)
         WHERE id = $6`,
        [name || null, email || null, phone || null, state || null, lga || null, req.user.id]
      );
    }

    if (address || organizationName || registeredAddress || contactPersonName) {
      await client.query(
        `UPDATE buyer_profiles SET
           address = COALESCE($1, address),
           organization_name = COALESCE($2, organization_name),
           registered_address = COALESCE($3, registered_address),
           contact_person_name = COALESCE($4, contact_person_name)
         WHERE user_id = $5`,
        [
          address || null,
          organizationName || null,
          registeredAddress || null,
          contactPersonName || null,
          req.user.id,
        ]
      );
    }

    await client.query("COMMIT");

    const { rows } = await client.query(
      `SELECT u.id, u.name, u.email, u.phone, u.state, u.lga,
              bp.buyer_type, bp.address, bp.organization_name, bp.registered_address,
              bp.contact_person_name
       FROM users u JOIN buyer_profiles bp ON bp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ profile: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not update profile" });
  } finally {
    client.release();
  }
}

// --- Admin: buyer directory -------------------------------------------------
// Every registered buyer, full registration info, same visibility model as
// the admin branch of farmers.jurisdictionOverview (company-wide, not
// scoped) — 2026-09-01 "buyers need to be accessible to admin same way as
// farmers" spec.

export async function adminListBuyers(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.state, u.lga, u.photo_url, u.created_at,
            bp.buyer_type, bp.address, bp.organization_name, bp.registered_address,
            bp.contact_person_name, bp.standing_commitment_total,
            bp.standing_commitment_balance, bp.standing_commitment_years
     FROM users u
     JOIN buyer_profiles bp ON bp.user_id = u.id
     WHERE u.role_type = 'buyer'
     ORDER BY u.created_at DESC`
  );
  res.json({
    buyers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      state: r.state,
      lga: r.lga,
      photoUrl: r.photo_url,
      createdAt: r.created_at,
      buyerType: r.buyer_type,
      address: r.address,
      organizationName: r.organization_name,
      registeredAddress: r.registered_address,
      contactPersonName: r.contact_person_name,
      standingCommitmentTotal: Number(r.standing_commitment_total),
      standingCommitmentBalance: Number(r.standing_commitment_balance),
      standingCommitmentYears: r.standing_commitment_years,
    })),
  });
}
