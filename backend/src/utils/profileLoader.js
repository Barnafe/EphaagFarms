import { pool } from "../db/pool.js";

// Loads the role-specific profile row for a user and merges it onto the
// base user object, so every endpoint that returns a user (register, login,
// /me) sends the same shape. Frontend can then trust `user.rank`,
// `user.crops`, `user.attendancePct`, etc. without a separate fetch.
export async function attachProfile(user) {
  if (user.role_type === "farmer") {
    const { rows } = await pool.query(
      `SELECT rank, crops, attendance_pct, course_pct,
              marital_status, date_of_birth, id_type, id_number, home_address, nationality,
              farm_type, farm_size, years_experience, keeps_inventory_records, annual_farm_income,
              additional_income_type, additional_income
       FROM farmer_profiles WHERE user_id = $1`,
      [user.id]
    );
    const p = rows[0];
    return {
      ...user,
      rank: p?.rank ?? "Member",
      crops: p?.crops ?? [],
      attendancePct: p ? Number(p.attendance_pct) : 0,
      coursePct: p ? Number(p.course_pct) : 0,
      maritalStatus: p?.marital_status ?? null,
      dateOfBirth: p?.date_of_birth ?? null,
      idType: p?.id_type ?? null,
      idNumber: p?.id_number ?? null,
      homeAddress: p?.home_address ?? null,
      nationality: p?.nationality ?? null,
      farmType: p?.farm_type ?? null,
      farmSize: p?.farm_size ?? null,
      yearsExperience: p?.years_experience ?? null,
      keepsInventoryRecords: p?.keeps_inventory_records ?? null,
      annualFarmIncome: p?.annual_farm_income ?? null,
      additionalIncomeType: p?.additional_income_type ?? null,
      additionalIncome: p?.additional_income ?? null,
    };
  }

  if (user.role_type === "buyer") {
    const { rows } = await pool.query(
      `SELECT buyer_type, company_doc_url, organization_name, registered_address, contact_person_name,
              address, standing_commitment_total, standing_commitment_balance, standing_commitment_years
       FROM buyer_profiles WHERE user_id = $1`,
      [user.id]
    );
    const p = rows[0];
    return {
      ...user,
      buyerType: p?.buyer_type ?? "individual",
      companyDocUrl: p?.company_doc_url ?? null,
      organizationName: p?.organization_name ?? null,
      registeredAddress: p?.registered_address ?? null,
      contactPersonName: p?.contact_person_name ?? null,
      address: p?.address ?? null,
      standingCommitmentTotal: p ? Number(p.standing_commitment_total) : 0,
      standingCommitmentBalance: p ? Number(p.standing_commitment_balance) : 0,
      standingCommitmentYears: p?.standing_commitment_years ?? null,
    };
  }

  if (user.role_type === "investor") {
    const { rows } = await pool.query(
      `SELECT occupation, referral_code, referred_by_code, partner_status
       FROM investor_profiles WHERE user_id = $1`,
      [user.id]
    );
    const p = rows[0];
    return {
      ...user,
      occupation: p?.occupation ?? null,
      referralCode: p?.referral_code ?? null,
      referredByCode: p?.referred_by_code ?? null,
      partnerStatus: p?.partner_status ?? "none",
    };
  }

  // admin and other flat roles carry no extra profile row.
  return user;
}
