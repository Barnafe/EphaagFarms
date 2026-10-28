// Stand-in for Paystack: initialize, verify, and control addresses that let a test
// "pay" a reference, fail it, leave it pending (bank transfer), pay the wrong
// amount, take the API down, and fire a signed webhook at the app.
import http from "node:http";
import crypto from "node:crypto";

export function startFakePaystack({ secret = "sk_test_standin", port = 0 } = {}) {
  const tx = new Map(); // reference -> { reference, amount, currency, email, status, channel, id, paid_at, callback_url }
  let down = false, refundFail = false, chargeFail = false, nextId = 1000;
  const auth = (t) => (t.channel === "card" && t.status === "success" ? { authorization_code: "AUTH_" + t.reference.replace(/[^A-Za-z0-9]/g, ""), reusable: true, last4: "4081", card_type: "visa ", channel: "card" } : undefined);

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const json = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    const body = await new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c).toString())); });
    const q = (k) => u.searchParams.get(k);

    // ---- control ----
    if (u.pathname === "/__down") { down = q("on") === "1"; return json(200, { down }); }
    if (u.pathname === "/__refundfail") { refundFail = q("on") === "1"; return json(200, { refundFail }); }
    if (u.pathname === "/__chargefail") { chargeFail = q("on") === "1"; return json(200, { chargeFail }); }
    if (u.pathname === "/__reset") { tx.clear(); down = false; refundFail = false; chargeFail = false; return json(200, { ok: true }); }
    if (u.pathname === "/__tx") return json(200, tx.get(q("reference")) || null);
    if (u.pathname === "/__all") return json(200, [...tx.values()]);
    if (u.pathname === "/__set") { // status=success|failed|abandoned|pending, optional amountKobo, currency, channel
      const t = tx.get(q("reference")); if (!t) return json(404, { error: "unknown reference" });
      t.status = q("status") || t.status;
      if (q("amountKobo")) t.amount = Number(q("amountKobo"));
      if (q("currency")) t.currency = q("currency");
      if (q("channel")) t.channel = q("channel");
      if (t.status === "success") { t.paid_at = new Date().toISOString(); t.id = t.id || ++nextId; }
      return json(200, t);
    }
    if (u.pathname === "/__webhook") { // fire a signed charge.success at the app
      const t = tx.get(q("reference")); if (!t) return json(404, { error: "unknown reference" });
      const payload = JSON.stringify({ event: q("event") || "charge.success", data: { id: t.id || ++nextId, reference: t.reference, status: t.status, amount: t.amount, currency: t.currency, channel: t.channel, paid_at: t.paid_at, authorization: auth(t) } });
      const sig = q("bad") === "1" ? "0".repeat(128) : crypto.createHmac("sha512", secret).update(payload).digest("hex");
      try {
        const r = await fetch(q("target"), { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": sig }, body: payload });
        return json(200, { appStatus: r.status });
      } catch (e) { return json(200, { appStatus: 0, error: e.message }); }
    }

    // ---- the Paystack API ----
    if (down) return json(503, { status: false, message: "Paystack is down (simulated)" });
    if (req.headers.authorization !== `Bearer ${secret}`) return json(401, { status: false, message: "Invalid key" });
    if (req.method === "POST" && u.pathname === "/transaction/initialize") {
      const b = JSON.parse(body || "{}");
      if (tx.has(b.reference)) return json(400, { status: false, message: "Duplicate Transaction Reference" });
      tx.set(b.reference, { reference: b.reference, amount: b.amount, currency: b.currency || "NGN", email: b.email, status: "abandoned", channel: "card", callback_url: b.callback_url, metadata: b.metadata });
      return json(200, { status: true, message: "Authorization URL created", data: { authorization_url: `http://paystack.standin/pay/${b.reference}`, access_code: "ac_" + b.reference, reference: b.reference } });
    }
    if (req.method === "POST" && u.pathname === "/transaction/charge_authorization") {
      const b = JSON.parse(body || "{}");
      const known = [...tx.values()].some((x) => auth(x)?.authorization_code === b.authorization_code);
      if (!known) return json(400, { status: false, message: "Invalid authorization code" });
      if (tx.has(b.reference)) return json(400, { status: false, message: "Duplicate Transaction Reference" });
      const t = { reference: b.reference, amount: b.amount, currency: b.currency || "NGN", email: b.email, status: chargeFail ? "failed" : "success", channel: "card", id: ++nextId, paid_at: chargeFail ? null : new Date().toISOString(), metadata: b.metadata };
      tx.set(b.reference, t);
      return json(200, { status: true, message: "Charge attempted", data: { id: t.id, reference: t.reference, status: t.status, amount: t.amount, currency: t.currency, channel: "card", paid_at: t.paid_at, gateway_response: chargeFail ? "Insufficient funds" : "Approved", authorization: auth(t) } });
    }
    if (req.method === "POST" && u.pathname === "/refund") {
      const b = JSON.parse(body || "{}");
      const t = tx.get(b.transaction);
      if (refundFail) return json(400, { status: false, message: "Refund could not be processed (simulated)" });
      if (!t || t.status !== "success") return json(400, { status: false, message: "Transaction not found or not successful" });
      t.refunded = true;
      return json(200, { status: true, message: "Refund has been queued for processing", data: { id: ++nextId, transaction: { reference: t.reference }, status: "pending" } });
    }
    const m = u.pathname.match(/^\/transaction\/verify\/(.+)$/);
    if (req.method === "GET" && m) {
      const t = tx.get(decodeURIComponent(m[1]));
      if (!t) return json(404, { status: false, message: "Transaction reference not found" });
      return json(200, { status: true, message: "Verification successful", data: { id: t.id || null, reference: t.reference, status: t.status, amount: t.amount, currency: t.currency, channel: t.channel, paid_at: t.paid_at || null, authorization: auth(t) } });
    }
    json(404, { status: false, message: "not found" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, port: server.address().port, secret, close: () => server.close() })));
}
