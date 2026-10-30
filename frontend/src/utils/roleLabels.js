// How each account type (the stored role_type value) is NAMED to people.
// NAMING ONLY — stored values and routes are unchanged:
//   buyer  -> "Buyers/Processor"   (the one profile for buying AND processing; there is no separate processor profile)
//   corper -> "NYSC AGROALLIED SAED"
// A leftover "processor" value (accounts from before the processor profile was retired) reads as Buyers/Processor too.
export const ROLE_LABELS = {
  farmer: "Farmer",
  buyer: "Buyers/Processor",
  processor: "Buyers/Processor",
  corper: "NYSC AGROALLIED SAED",
  transporter: "Transporter",
  distributor: "Distributor",
  investor: "Investor",
  admin: "Admin",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}
