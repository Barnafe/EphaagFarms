// Phase 10: each approval stage of Purchasing belongs to one role. The role is the department head the main admin
// appointed on the Positions screen: Procurement, Finance or CEO. The main admin can act in any role (so a company
// with only its first admin can still run the pipeline); every step records which role took it.
import { pool } from "../db/pool.js";

export const STAGE_ROLE = { procurement: "Procurement", finance: "Finance", ceo: "CEO" };

/** Which role a request is waiting for, by status. */
export const WAITING_FOR = {
  pending_approval: "Procurement", approved: "Procurement", sourcing: "Procurement",
  budget_approval_pending: "Finance", po_pending_approval: "CEO", po_approved: "Finance",
  awaiting_delivery: "Procurement", delivered: "Procurement", goods_disputed: "Procurement", goods_received: "Procurement",
  invoice_verification: "Finance", final_payment_pending: "Finance",
};

export async function roleOf(userId) {
  const { rows } = await pool.query("SELECT department_head_of, is_main_admin FROM users WHERE id = $1 AND role_type = 'admin'", [userId]);
  const u = rows[0];
  if (!u) return { role: null, isMain: false };
  return { role: u.department_head_of || null, isMain: !!u.is_main_admin };
}

export function requireStage(stage) {
  const needed = STAGE_ROLE[stage];
  return async (req, res, next) => {
    const { role, isMain } = await roleOf(req.user.id);
    if (isMain) { req.purchasingRole = "Main admin"; return next(); }
    if (role === needed) { req.purchasingRole = needed; return next(); }
    return res.status(403).json({
      error: `This step belongs to the ${needed} head. Ask the ${needed} head (or the main admin) to do it.`,
      code: "WRONG_STAGE_ROLE", requiredRole: needed,
    });
  };
}
