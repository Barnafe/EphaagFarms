import { pool } from "../db/pool.js";
import { sendMail } from "../utils/email.js";

// --- Public contact form -----------------------------------------------
// No auth required — anyone visiting the public site can submit this.

export async function submitContactMessage(req, res) {
  const { name, email, message } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const { rows } = await pool.query(
    `INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), email?.trim() || null, message.trim()]
  );
  const saved = rows[0];

  // Fire-and-forget — never block the visitor's submission on email delivery.
  notifyAdmins(saved).catch(() => {});

  res.status(201).json({ message: saved });
}

async function notifyAdmins(msg) {
  const { rows } = await pool.query(`SELECT email FROM users WHERE role_type = 'admin' AND email IS NOT NULL`);
  for (const { email } of rows) {
    sendMail({
      to: email,
      subject: "New contact form message — EPHAAG Farms website",
      html: `<p>New message from <strong>${msg.name}</strong>${msg.email ? ` (${msg.email})` : ""}:</p><p>${msg.message}</p>`,
    }).catch(() => {});
  }
}

// --- Admin: view + review -------------------------------------------------

export async function adminListContactMessages(req, res) {
  const { rows } = await pool.query(`SELECT * FROM contact_messages ORDER BY created_at DESC`);
  res.json({ messages: rows });
}

export async function adminMarkContactMessageReviewed(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE contact_messages SET status = 'reviewed' WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Message not found" });
  res.json({ message: rows[0] });
}
