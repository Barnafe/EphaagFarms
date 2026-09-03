import express from "express";
import cors from "cors";
import cron from "node-cron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import authRoutes from "./routes/auth.js";
import loanRoutes from "./routes/loans.js";
import farmerRoutes from "./routes/farmers.js";
import buyerRoutes from "./routes/buyers.js";
import orderRoutes from "./routes/orders.js";
import procurementRoutes from "./routes/procurement.js";
import financeRoutes from "./routes/finance.js";
import processorRoutes from "./routes/processor.js";
import storeRoutes from "./routes/store.js";
import transportRoutes from "./routes/transport.js";
import investmentRoutes from "./routes/investments.js";
import rtcRoutes from "./routes/rtc.js";
import analyticsRoutes from "./routes/analytics.js";
import requestsRoutes from "./routes/requests.js";
import adminPositionsRoutes from "./routes/admin-positions.js";
import { runDueDateReminders } from "./controllers/investmentController.js";

const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy — this makes
// req.ip/req.secure reflect the real client instead of the proxy hop.
// Harmless locally too.
app.set("trust proxy", 1);

// Safety net: a single unguarded async error in any route handler should
// never take the whole server down (this has happened before — one bad
// query crashed every other in-flight and future request too). Express 4
// doesn't catch async rejections automatically, and every controller
// SHOULD have its own try/catch, but this is the last line of defense if
// one is ever missing. The affected request will still hang/timeout
// rather than succeed, but every other request keeps working.
process.on("unhandledRejection", (err) => {
  console.error("[unhandled rejection — a route is missing its own try/catch]", err);
});

// Same reasoning as above, for the synchronous-throw case. Node's default
// behavior for uncaughtException is to crash the process; for this app's
// current stage (self-hosted on a single free-tier instance while still
// being iterated on) we log-and-continue instead, so a bug in one request
// doesn't take the whole platform offline for everyone else. Revisit this
// once the app moves to paid, multi-instance hosting with real process
// supervision/auto-restart.
process.on("uncaughtException", (err) => {
  console.error("[uncaught exception]", err);
});

// CORS only matters when the frontend is served from a different origin
// than this API (e.g. local Vite dev server, or a separately-hosted
// static frontend later on). Accepts a comma-separated list so more than
// one origin (e.g. a Render preview URL + a custom domain) can be
// allowed at once. Same-origin requests (the production setup below,
// where this server also serves the built frontend) send no Origin
// header at all, so this check doesn't apply to them either way.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

// Profile photos only — agreement PDFs stay behind the authenticated
// download route in investments.js, deliberately not exposed here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use("/uploads/photos", express.static(path.join(__dirname, "..", "uploads", "photos")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/farmers", farmerRoutes);
app.use("/api/buyers", buyerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/procurement", procurementRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/processor", processorRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/transport", transportRoutes);
app.use("/api/investments", investmentRoutes);
app.use("/api/rtc", rtcRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/requests", requestsRoutes);
app.use("/api/admin/positions", adminPositionsRoutes);

// More routes land here module by module.

// ---------------------------------------------------------------------
// Serve the built frontend from this same service in production, so the
// whole app is one Render web service (one free-tier dyno, no separate
// static site, no cross-origin requests to worry about). Only kicks in
// when the built files actually exist — local dev keeps using the Vite
// dev server on :5173 untouched. Must come AFTER every /api and /uploads
// route above: the SPA catch-all below matches anything not already
// handled, so registering it earlier would swallow API requests.
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api|\/uploads|\/health).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  // Respect a well-formed client error's own status (e.g. malformed JSON
  // body from body-parser carries statusCode 400) instead of always
  // reporting 500 — a bad request from the client isn't a server failure.
  const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  res.status(status).json({ error: status < 500 ? "Malformed request" : "Something went wrong" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Ephaag Farms API listening on port ${port}`));

// Daily check for investment payments due tomorrow — sends a reminder
// email the evening before. Runs at 08:00 server time; can also be
// triggered manually via POST /api/investments/admin/run-reminder-check
// (useful for testing without waiting a real day).
cron.schedule("0 8 * * *", () => {
  runDueDateReminders().catch((err) => console.error("Reminder job failed:", err));
});
