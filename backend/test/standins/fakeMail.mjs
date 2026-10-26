// Stand-ins for Amazon SES (v2 SendEmail) and a Nigerian SMS provider (Termii-style).
import http from "node:http";

function readBody(req) {
  return new Promise((resolve) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => resolve(Buffer.concat(c).toString("utf8"))); });
}

// Decode the raw MIME that nodemailer hands to SES so tests can read To/Subject/body.
function parseRaw(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const h = (name) => (head.match(new RegExp(`^${name}:\\s*(.*)$`, "mi")) || [])[1] || "";
  let body = rest.join("\n\n");
  if (/quoted-printable/i.test(raw)) body = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16)));
  return { to: h("To"), subject: h("Subject"), raw, body };
}

export function startFakeMail(port = 0) {
  const state = { ses: [], sms: [], sesFail: 0, smsFail: 0 };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const json = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (u.pathname === "/__state") return json(200, { ses: state.ses.map(({ raw, ...r }) => r), sms: state.sms });
    if (u.pathname === "/__reset") { state.ses = []; state.sms = []; state.sesFail = 0; state.smsFail = 0; return json(200, { ok: true }); }
    if (u.pathname === "/__fail") { state.sesFail = Number(u.searchParams.get("ses") || 0); state.smsFail = Number(u.searchParams.get("sms") || 0); return json(200, state); }

    if (req.method === "POST" && u.pathname === "/v2/email/outbound-emails") {
      if (state.sesFail > 0) { state.sesFail--; return json(500, { message: "Simulated SES outage" }); }
      const body = JSON.parse(await readBody(req));
      const raw = Buffer.from(body.Content?.Raw?.Data || "", "base64").toString("utf8");
      const parsed = parseRaw(raw);
      state.ses.push(parsed);
      return json(200, { MessageId: `fake-ses-${state.ses.length}` });
    }
    if (req.method === "POST" && u.pathname === "/sms/send") {
      if (state.smsFail > 0) { state.smsFail--; return json(503, { message: "Simulated SMS outage" }); }
      const body = JSON.parse(await readBody(req));
      state.sms.push(body);
      return json(200, { message_id: `fake-sms-${state.sms.length}`, message: "Successfully Sent" });
    }
    json(404, { error: "not found" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, port: server.address().port, close: () => server.close(), state })));
}
