import crypto from "node:crypto";

// Verifies an Amazon SNS message signature (SES bounce/complaint events arrive
// through SNS). Cert is fetched only from a genuine sns.<region>.amazonaws.com
// host. In non-production a test cert can be injected via SNS_TEST_CERT_PEM.
const HOST_OK = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

function stringToSign(m) {
  const keys = m.Type === "Notification"
    ? ["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys.map((k) => `${k}\n${m[k]}\n`).join("");
}

export async function verifySnsMessage(m) {
  try {
    if (!m || !m.Signature || !m.Type) return false;
    let pem = null;
    if (process.env.NODE_ENV !== "production" && process.env.SNS_TEST_CERT_PEM) {
      pem = process.env.SNS_TEST_CERT_PEM;
    } else {
      const u = new URL(m.SigningCertURL);
      if (u.protocol !== "https:" || !HOST_OK.test(u.hostname)) return false;
      const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return false;
      pem = await res.text();
    }
    const algo = m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
    const v = crypto.createVerify(algo);
    v.update(stringToSign(m), "utf8");
    return v.verify(pem, m.Signature, "base64");
  } catch {
    return false;
  }
}
