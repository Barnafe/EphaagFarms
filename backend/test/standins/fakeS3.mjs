// Stand-in for Cloudflare R2 / S3 (path-style). Stores objects in memory,
// honours presigned-URL expiry against a clock that tests can move forward.
import http from "node:http";

function unchunk(buf) {
  const parts = []; let i = 0;
  while (i < buf.length) {
    const eol = buf.indexOf("\r\n", i); if (eol < 0) break;
    const size = parseInt(buf.subarray(i, eol).toString().split(";")[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    parts.push(buf.subarray(eol + 2, eol + 2 + size)); i = eol + 2 + size + 2;
  }
  return Buffer.concat(parts);
}

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
        let body = Buffer.concat(chunks);
        // The AWS SDK sends streamed bodies in "aws-chunked" framing; real S3 and R2 unwrap it, so the stand-in must too.
        if (/aws-chunked/.test(req.headers["content-encoding"] || "") || /^STREAMING-/.test(req.headers["x-amz-content-sha256"] || "")) body = unchunk(body);
        objects.set(path, { body, type: req.headers["content-type"] || "application/octet-stream", at: now() });
        send(200, "", { ETag: '"fake"' });
      });
      return;
    }
    // ListObjectsV2 on a bucket: GET /bucket?list-type=2&prefix=...
    if (req.method === "GET" && u.searchParams.get("list-type") === "2") {
      const bucket = path.replace(/\/$/, ""); const prefix = u.searchParams.get("prefix") || "";
      const items = [...objects.entries()].filter(([k]) => k.startsWith(`${bucket}/${prefix}`));
      const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket}</Name><Prefix>${prefix}</Prefix><KeyCount>${items.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>` +
        items.map(([k, o]) => `<Contents><Key>${k.slice(bucket.length + 1)}</Key><LastModified>${new Date(o.at).toISOString()}</LastModified><Size>${o.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`).join("") + "</ListBucketResult>";
      return send(200, xml, { "Content-Type": "application/xml" });
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
    if (u.pathname === "/__age") { const o = objects.get(u.searchParams.get("key")); if (o) o.at -= Number(u.searchParams.get("days") || 0) * 86400000; return json({ ok: !!o }); }
    if (u.pathname === "/__get") { const o = objects.get(u.searchParams.get("key")); res.writeHead(o ? 200 : 404); return res.end(o ? o.body : undefined); }
    if (u.pathname === "/__reset") { objects.clear(); clockOffsetMs = 0; return json({ ok: true }); }
    res.writeHead(404); res.end();
  }

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, port: server.address().port, close: () => server.close(), objects })));
}
