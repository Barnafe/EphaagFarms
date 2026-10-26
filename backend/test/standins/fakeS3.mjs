// Stand-in for Cloudflare R2 / S3 (path-style). Stores objects in memory,
// honours presigned-URL expiry against a clock that tests can move forward.
import http from "node:http";

export function startFakeS3(port = 0) {
  const objects = new Map(); // "bucket/key" -> { body, type }
  let clockOffsetMs = 0;
  const now = () => Date.now() + clockOffsetMs;

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/__")) return control(u, req, res);
    const path = decodeURIComponent(u.pathname.slice(1));
    const send = (code, body = "", headers = {}) => { res.writeHead(code, headers); res.end(body); };

    if (req.method === "PUT") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        objects.set(path, { body: Buffer.concat(chunks), type: req.headers["content-type"] || "application/octet-stream" });
        send(200, "", { ETag: '"fake"' });
      });
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      // Presigned URL: X-Amz-Date + X-Amz-Expires decide whether it is still valid.
      const amzDate = u.searchParams.get("X-Amz-Date");
      if (amzDate) {
        const m = amzDate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        const signedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        const expires = Number(u.searchParams.get("X-Amz-Expires") || 0) * 1000;
        if (now() > signedAt + expires) return send(403, "<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>");
      }
      const o = objects.get(path);
      if (!o) return send(404, "<Error><Code>NoSuchKey</Code></Error>");
      res.writeHead(200, { "Content-Type": o.type, "Content-Length": o.body.length });
      return res.end(req.method === "HEAD" ? undefined : o.body);
    }
    if (req.method === "DELETE") { objects.delete(path); return send(204); }
    send(405);
  });

  function control(u, req, res) {
    const json = (o) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (u.pathname === "/__keys") return json({ keys: [...objects.keys()] });
    if (u.pathname === "/__advance") { clockOffsetMs += Number(u.searchParams.get("seconds") || 0) * 1000; return json({ offsetMs: clockOffsetMs }); }
    if (u.pathname === "/__reset") { objects.clear(); clockOffsetMs = 0; return json({ ok: true }); }
    res.writeHead(404); res.end();
  }

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, port: server.address().port, close: () => server.close(), objects })));
}
