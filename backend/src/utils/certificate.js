import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ASSET_DIR = path.join(__dirname, "..", "..", "assets", "certificate");

const GREEN = "#2c6b2f";
const RED = "#c81020";
const INK = "#1d1a16";

// Long, unguessable, easy to read out: 24 characters from a 31-letter
// alphabet without 0/O/1/I/L (about 119 bits).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newVerificationCode() {
  const bytes = crypto.randomBytes(24);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
export const groupCode = (c) => String(c).match(/.{1,4}/g)?.join("-") || c;
// Accept the code with dashes/spaces/lower-case, as people type it.
export const normaliseCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function formatCertNumber(seq, year = new Date().getFullYear()) {
  return `EPH-NYSC-${year}-${String(seq).padStart(6, "0")}`;
}

export function publicBase() {
  return (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");
}
export const verifyUrl = (code) => `${publicBase()}/verify-certificate/${code}`;

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ASSET_DIR, "certificate-config.json"), "utf8"));
  } catch {
    return {};
  }
}

function assetPath(name) {
  if (!name) return null;
  const full = path.join(ASSET_DIR, path.basename(name));
  return fs.existsSync(full) ? full : null;
}

export const formatLongDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

// One general certificate for everybody: name, state code, batch + year,
// issue date, certificate number, QR code. No grades, no course names.
// Generated on the server so the same file comes out on every device.
export async function renderCertificatePdf(cert) {
  const cfg = loadConfig();
  const qr = await QRCode.toBuffer(verifyUrl(cert.verification_code), { margin: 1, width: 360, errorCorrectionLevel: "M" });

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    info: { Title: `Certificate ${cert.number}`, Author: cfg.organisation || "EPHAAG Farms" },
  });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const H = doc.page.height;
  const centre = (text, y, opts = {}) => doc.text(text, 0, y, { width: W, align: "center", ...opts });

  // Frame
  doc.rect(18, 18, W - 36, H - 36).lineWidth(3).stroke(GREEN);
  doc.rect(26, 26, W - 52, H - 52).lineWidth(0.8).stroke(RED);

  // Logos: EPHAAG centred; NYSC top-left only if the file has been supplied.
  const logo = assetPath("ephaag-logo.png");
  if (logo) doc.image(logo, W / 2 - 32, 42, { fit: [64, 64], align: "center" });
  const nysc = assetPath("nysc-logo.png");
  if (nysc) doc.image(nysc, 60, 46, { fit: [64, 64] });

  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(13);
  centre((cfg.organisation || "EPHAAG Farms").toUpperCase(), 112, { characterSpacing: 3 });

  doc.fillColor(INK).font("Times-Bold").fontSize(38);
  centre(cfg.heading || "Certificate of Completion", 132);
  doc.fillColor(RED).font("Helvetica").fontSize(11);
  centre((cfg.subheading || "").toUpperCase(), 180, { characterSpacing: 2 });

  doc.fillColor(INK).font("Times-Italic").fontSize(15);
  centre(cfg.intro || "This is to certify that", 212);

  // Name: shrink to fit one line.
  let size = 36;
  doc.font("Times-Bold");
  while (size > 16 && doc.fontSize(size).widthOfString(cert.holder_name) > W - 160) size -= 2;
  doc.fillColor(GREEN).fontSize(size);
  centre(cert.holder_name, 234);
  doc.moveTo(W / 2 - 200, 234 + size + 6).lineTo(W / 2 + 200, 234 + size + 6).lineWidth(0.6).stroke("#999999");

  doc.fillColor(INK).font("Times-Roman").fontSize(14);
  centre(cfg.body || "", 234 + size + 20, { lineGap: 3 });

  // Details row
  const detailsY = 330;
  const cols = [
    ["STATE CODE", cert.state_code || "—"],
    ["BATCH", [cert.service_year, cert.batch ? `Batch ${cert.batch}` : null].filter(Boolean).join(" · ") || "—"],
    ["ISSUE DATE", formatLongDate(cert.visible_at || cert.issued_at)],
  ];
  const colW = (W - 200) / cols.length;
  cols.forEach(([label, value], i) => {
    const x = 100 + i * colW;
    doc.fillColor("#666666").font("Helvetica").fontSize(8.5).text(label, x, detailsY, { width: colW, align: "center", characterSpacing: 1.5 });
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(value, x, detailsY + 14, { width: colW, align: "center" });
  });

  // Signatories (bottom-left / bottom-middle)
  const sigs = (cfg.signatories || []).slice(0, 2);
  const sigY = H - 118;
  sigs.forEach((s, i) => {
    const x = 70 + i * 230;
    const img = assetPath(s.signature);
    if (img) doc.image(img, x + 20, sigY - 36, { fit: [140, 34] });
    doc.moveTo(x, sigY).lineTo(x + 180, sigY).lineWidth(0.7).stroke(INK);
    let y = sigY + 4;
    if (s.name) {
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(s.name, x, y, { width: 180, align: "center" });
      y += 13;
    }
    doc.fillColor("#555555").font("Helvetica").fontSize(8.5).text(s.title || "", x, y, { width: 180, align: "center" });
  });

  // QR + number + verification details (bottom-right, kept inside the frame)
  const boxW = 220;
  const qx = W - 40 - boxW; // left edge of the text box
  doc.image(qr, qx + boxW / 2 - 45, H - 178, { fit: [90, 90] });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(cert.number, qx, H - 84, { width: boxW, align: "center" });
  doc.fillColor("#666666").font("Helvetica").fontSize(7.5);
  doc.text(`Verify at ${publicBase().replace(/^https?:\/\//, "")}/verify-certificate`, qx, H - 71, { width: boxW, align: "center" });
  doc.text(`Code: ${groupCode(cert.verification_code)}`, qx, H - 60, { width: boxW, align: "center" });

  doc.fillColor("#888888").font("Helvetica-Oblique").fontSize(8);
  doc.text(cfg.footerNote || "", 60, H - 50, { width: W - 340, align: "left" });

  doc.end();
  return done;
}
