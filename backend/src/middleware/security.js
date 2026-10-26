import helmet from "helmet";
import cors from "cors";
import { logSecurityEvent, clientIp } from "../utils/securityLog.js";

const isProd = () => process.env.NODE_ENV === "production";

export function allowedOrigins() {
  const raw = process.env.FRONTEND_ORIGIN || (isProd() ? "" : "http://localhost:5173");
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

// Production: only your own site may call the API from a browser. Requests
// with no Origin (same-origin pages, webhooks, health pings) are unaffected.
export function corsMiddleware() {
  return cors((req, callback) => {
    const origin = req.headers.origin;
    // A browser sends Origin on module scripts and fetches even when the page is served by this
    // very server, so a request from our own address is always fine (no configuration needed).
    const sameOrigin = origin && req.headers.host && (origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`);
    if (!origin || sameOrigin || allowedOrigins().includes(origin)) return callback(null, { origin: true });
    callback(Object.assign(new Error("This site is not allowed to use the API"), { status: 403 }));
  });
}

function host(u) { try { return new URL(u).origin; } catch { return null; } }

export function cspDirectives() {
  const r2 = host(process.env.R2_PUBLIC_BASE_URL || "");
  const dev = !isProd();
  const d = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://www.youtube.com", "https://s.ytimg.com", "https://player.vimeo.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://i.ytimg.com", ...(r2 ? [r2] : [])],
    mediaSrc: ["'self'", "blob:", ...(r2 ? [r2] : [])],
    connectSrc: ["'self'", "https://api.paystack.co", ...(r2 ? [r2] : []), ...(dev ? ["http://localhost:*"] : [])],
    frameSrc: ["https://www.youtube.com", "https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://checkout.paystack.com"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'", "https://checkout.paystack.com"],
    reportUri: ["/api/security/csp-report"],
  };
  if (isProd()) d.upgradeInsecureRequests = [];
  return d;
}

// Standard headers on every response. The content-security policy starts in
// report-only mode (CSP_MODE=enforce turns it on) so a missed host is logged
// instead of breaking a screen.
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: { useDefaults: false, reportOnly: (process.env.CSP_MODE || "report-only") !== "enforce", directives: cspDirectives() },
    hsts: isProd() ? { maxAge: 31536000, includeSubDomains: true } : false,
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" }, // product photos load from other origins in dev
    crossOriginOpenerPolicy: false,
  });
}

// ---- "log in as" ------------------------------------------------------------
// The admin "Login as a department" screen sends X-Acting-As: <Department>.
// While acting, money-moving, bank, consent and password actions are refused,
// and every action is written to the security log.
const blocked = [
  /^\/api\/payments\/admin\/(refunds\/[^/]+\/(refund|mark-refunded)|settings|ledger\/[^/]+\/recorded)/,
  /^\/api\/orders\/[^/]+\/mark-refunded$/,
  /^\/api\/finance\/payments\/[^/]+\/pay$/,
  /^\/api\/orders\/[^/]+\/confirm-payment$/,
  /^\/api\/loans\/[^/]+\/disburse$/,
  /^\/api\/loans\/repayments\/[^/]+\/verify$/,
  /^\/api\/investments\/roi-payouts\/[^/]+\/approve$/,
  /^\/api\/finance-department\/(payables\/[^/]+\/settle|receivables\/[^/]+\/receive|payments|accounts\/[^/]+\/withdraw)/,
  /^\/api\/purchasing\/requests\/[^/]+\/(authorize-payment|final-payment)$/,
  /^\/api\/rtc\/admin\/corps\/(payments\/|fee)/,
  /^\/api\/orders\/[^/]+\/mark-refunded$/,
  /^\/api\/farmers\/admin\/savings\/withdrawals\/[^/]+\/decide$/,
  /\/(payout|payouts|bank-details|payout-account|consent|change-password|reset-password)(\/|$)/,
];
export function registerActingAsBlock(regex) { blocked.push(regex); }

export function actingAsGuard(req, res, next) {
  const dept = req.headers["x-acting-as"];
  if (!dept || req.user?.role_type !== "admin") return next();
  req.actingAs = String(dept).slice(0, 40);
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const p = req.originalUrl.split("?")[0];
  const isBlocked = blocked.some((re) => re.test(p));
  logSecurityEvent(isBlocked ? "acting_as_blocked" : "acting_as_action", {
    userId: req.user.id, req, detail: { department: req.actingAs, method: req.method, path: p },
  });
  if (isBlocked) {
    return res.status(403).json({ error: "This action can't be done while acting as a department. Do it as the person responsible.", code: "ACTING_AS_BLOCKED" });
  }
  next();
}

export function cspReport(req, res) {
  const r = req.body?.["csp-report"] || req.body || {};
  logSecurityEvent("csp_violation", { req, ip: clientIp(req), detail: {
    directive: r["violated-directive"], blocked: r["blocked-uri"], document: r["document-uri"],
  } });
  res.status(204).end();
}
