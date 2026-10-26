import rateLimit from "express-rate-limit";
import { logSecurityEvent } from "../utils/securityLog.js";

// Per-IP limits, each with its own budget. The counters live in memory, which
// is right for one server; a second server copy would need a shared store.
// RATE_LIMIT_MULTIPLIER lets a load test raise every budget at once.
const mult = () => Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER || 1));

export function limiter(name, { windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: () => max * mult(),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler(req, res, next, options) {
      const reset = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : Date.now() + windowMs;
      const minutes = Math.max(1, Math.ceil((reset - Date.now()) / 60000));
      logSecurityEvent("rate_limited", { req, detail: { limiter: name, path: req.originalUrl.split("?")[0] } });
      res.status(429).json({
        error: `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        code: "RATE_LIMITED", retryAfterMinutes: minutes,
      });
    },
  });
}

const MIN = 60 * 1000, HOUR = 60 * MIN;
export const loginLimiter = limiter("login", { windowMs: 15 * MIN, max: 20 });
export const registerLimiter = limiter("register", { windowMs: HOUR, max: 10 });
export const forgotPasswordLimiter = limiter("forgot-password", { windowMs: HOUR, max: 5 });
export const resetPasswordLimiter = limiter("reset-password", { windowMs: HOUR, max: 10 });
export const ninLookupLimiter = limiter("nin-lookup", { windowMs: HOUR, max: 10 });          // Phase 8
export const publicBookingLimiter = limiter("public-booking", { windowMs: HOUR, max: 5 });    // Phase 7
export const certificateVerifyLimiter = limiter("certificate-verify", { windowMs: HOUR, max: 60 });
