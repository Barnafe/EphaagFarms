// role_type is 'admin' for every account that can reach a department
// dashboard — "Login As" (see ActingAsContext.jsx) never swaps accounts,
// it just lets any admin operate inside a department's screens using
// their own login. So a department's own Profile tab must not hardcode
// "<Department> HOD" for whoever happens to be looking at it: only the
// specific admin actually appointed to that department (users.
// department_head_of, set via Positions -> "Make HOD") really holds that
// title. Every other admin — including the platform admin who just used
// "Login As" to step in — is still plain Admin while inside that screen.
export function departmentRoleLabel(user, department) {
  return user?.department_head_of === department ? `${department} HOD` : "Admin";
}
