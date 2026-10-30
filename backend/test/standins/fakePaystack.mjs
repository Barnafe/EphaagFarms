// Stand-in for Paystack: initialize, verify, and control addresses that let a test
// "pay" a reference, fail it, leave it pending (bank transfer), pay the wrong
// amount, take the API down, and fire a signed webhook at the app.
import http from "node:http";
import crypto from "node:crypto";

export function startFakePaystack({ secret = "sk_test_standin", port = 0 } = {}) {
  const tx = new Map(); // reference -> { reference, amount, currency, email, status, channel, id, paid_at, callback_url }
  let down = false, refundFail = false, chargeFail = false, ninDown = false, transferMode = "success", nextId = 1000;
  const transfers = new Map();
  const BANKS = [{ name: "Test Bank", code: "058", active: true }, { name: "Other Bank", code: "011", active: true }];
  const auth = (t) => (t.channel === "card" && t.status === "success" ? { authorization_code: "AUTH_" + t.reference.replace(/[^A-Za-z0-9]/g, ""), reusable: true, last4: "4081", card_type: "visa ", channel: "card" } : undefined);

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const json = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    const body = await new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c).toString())); });
    const q = (k) => u.searchParams.get(k);

    // ---- control ----
    if (u.pathname === "/__down") { down = q("on") === "1"; return json(200, { down }); }
    if (u.pathname === "/__refundfail") { refundFail = q("on") === "1"; return json(200, { refundFail }); }
    if (u.pathname === "/__transfermode") { transferMode = q("mode") || "success"; return json(200, { transferMode }); }
    if (u.pathname === "/__transfer") { const t = transfers.get(q("reference")); if (!t) return json(404, {}); if (q("status")) t.status = q("status"); return json(200, t); }
    if (req.method === "GET" && u.pathname === "/bank") return json(200, { status: true, data: BANKS });
    if (req.method === "GET" && u.pathname === "/bank/resolve") {
      const no = q("account_number") || "";
      if (!/^\d{10}$/.test(no) || no.startsWith("0000")) return json(422, { status: false, message: "Could not resolve account name" });
      return json(200, { status: true, data: { account_number: no, account_name: `TEST HOLDER ${no.slice(-4)}` } });
    }
    if (req.method === "POST" && u.pathname === "/transferrecipient") {
      const b = JSON.parse(body || "{}"); return json(200, { status: true, data: { recipient_code: "RCP_" + b.account_number, name: b.name } });
    }
    if (req.method === "POST" && u.pathname === "/transfer") {
      const b = JSON.parse(body || "{}");
      if (transferMode === "down") return json(503, { status: false, message: "down" });
      if (transfers.has(b.reference)) return json(400, { status: false, message: "Duplicate transfer reference" });
      const status = transferMode === "fail" ? "failed" : transferMode === "pending" ? "pending" : "success";
      const t = { reference: b.reference, amount: b.amount, recipient: b.recipient, status, transfer_code: "TRF_" + b.reference, currency: "NGN", reason: b.reason, failures: status === "failed" ? "Insufficient balance" : null };
      transfers.set(b.reference, t);
      return json(200, { status: true, data: t });
    }
    if (req.method === "GET" && u.pathname.startsWith("/transfer/verify/")) {
      const t = transfers.get(decodeURIComponent(u.pathname.split("/").pop())); if (!t) return json(404, { status: false });
      return json(200, { status: true, data: t });
    }
    if (u.pathname === "/__ninfail") { ninDown = q("on") === "1"; return json(200, { ninDown }); }
    // Dojah-style NIN lookup (test NINs): 0xxxxxxxxxx = not found, 9xxxxxxxxxx = provider error, anything else = a person made from the digits.
    if (u.pathname === "/api/v1/kyc/nin/advance") {
      if (req.headers.authorization !== "test-secret" || req.headers.appid !== "test-app") return json(401, { error: "unauthorised" });
      const nin = q("nin") || "";
      if (ninDown || nin.startsWith("9")) return json(503, { error: "provider down" });
      if (!/^\d{11}$/.test(nin) || nin.startsWith("0")) return json(400, { error: "entity not found" });
      const n = Number(nin.slice(-4));
      return json(200, { entity: {
        nin: nin.slice(0, 1) + "*****" + nin.slice(-5), first_name: nin === "70123456789" ? "JOHN" : `Tester${n}`, middle_name: nin === "70123456789" ? "ANON" : "Middle", last_name: nin === "70123456789" ? "DOE" : "Farmer",
        gender: n % 2 ? "Female" : "Male", date_of_birth: `19${70 + (n % 25)}-0${1 + (n % 9)}-1${n % 9}`, phone_number: "08011112222",
        residence_address_line_1: `${n} MARKET ROAD`, residence_address_line_2: "", residence_town: "GOMBE CENTRAL", residence_lga: "Gombe", residence_state: "Gombe", photo: "x", tax_id: "secret" } });
    }
    if (u.pathname === "/__chargefail") { chargeFail = q("on") === "1"; return json(200, { chargeFail }); }
    if (u.pathname === "/__reset") { tx.clear(); down = false; refundFail = false; chargeFail = false; ninDown = false; return json(200, { ok: true }); }
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
      const tr = transfers.get(q("reference"));
      if (tr && String(q("event") || "").startsWith("transfer.")) {
        const tp = JSON.stringify({ event: q("event"), data: { reference: tr.reference, status: tr.status, transfer_code: tr.transfer_code, amount: tr.amount, reason: tr.failures || undefined } });
        const tsig = crypto.createHmac("sha512", secret).update(tp).digest("hex");
        try { const r = await fetch(q("target"), { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": tsig }, body: tp }); return json(200, { appStatus: r.status }); }
        catch (e) { return json(200, { appStatus: 0, error: e.message }); }
      }
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
