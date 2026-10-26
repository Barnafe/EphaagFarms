import { pool } from "../db/pool.js";

// Phase 3 payment gate. Put this AFTER requireAuth + requireRole("corper") on
// every corps-member endpoint that opens training content (courses, lessons,
// quizzes, progress...). An unpaid member gets HTTP 402 with a stable
// `code` the frontend keys off; a paid member goes straight through.
//
// A refunded payment stops counting (status is no longer 'paid'), so an admin
// "refund / revoke access" closes the gate again immediately.
export async function requireCorperPaid(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM corper_payments WHERE user_id = $1 AND status = 'paid' LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(402).json({
        error: "Pay the access fee to unlock your training",
        code: "PAYMENT_REQUIRED",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
