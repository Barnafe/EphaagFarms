import ExcelJS from "exceljs";
import { pool } from "../db/pool.js";
import { loadProgressRows } from "./corperLearningController.js";
import { summariseProgress, UUID_RE } from "../utils/corperLearning.js";
import { renderCertificatePdf } from "../utils/certificate.js";
import { runBatchNotifications, isNotifyRunning } from "./corperCertificateController.js";

// Admin (TRC -> Corps): batches, certificate release, members table and the
// NYSC spreadsheet. Progress numbers come from the same loader the members'
// dashboards use (loadProgressRows + summariseProgress).

const httpError = (message, status = 400, code) => Object.assign(new Error(message), { status, clientCode: code });
const assertUuid = (id, what) => {
  if (!UUID_RE.test(String(id))) throw httpError(`${what} not found`, 404);
};
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v));
const BATCHES = ["A", "B", "C"];
const STREAMS = ["I", "II"];

async function todayInLagos(runner = pool) {
  const { rows } = await runner.query(`SELECT (now() AT TIME ZONE 'Africa/Lagos')::date::text AS d`);
  return rows[0].d;
}

async function logEvent(runner, batchId, action, actorId, note = null) {
  await runner.query(`INSERT INTO corp_batch_events (batch_id, action, note, actor_id) VALUES ($1,$2,$3,$4)`, [
    batchId, action, note, actorId,
  ]);
}

// Every batch that has registered members gets a row, so it always has an id.
async function ensureBatchRows(runner = pool) {
  await runner.query(
    `INSERT INTO corp_batches (service_year, batch, stream)
     SELECT DISTINCT service_year, batch, stream FROM corper_profiles
      WHERE service_year IS NOT NULL AND batch IS NOT NULL AND stream IS NOT NULL
     ON CONFLICT (service_year, batch, stream) DO NOTHING`
  );
}

async function loadBatch(id, runner = pool) {
  assertUuid(id, "Batch");
  const { rows } = await runner.query(`SELECT * FROM corp_batches WHERE id = $1`, [id]);
  if (!rows[0]) throw httpError("Batch not found", 404);
  return rows[0];
}

const batchLabel = (b) => `${b.service_year} Batch ${b.batch} Stream ${b.stream}`;

// ---------------------------------------------------------------------
// Members (shared by the table and the export)
// ---------------------------------------------------------------------
const PAID_SQL = `EXISTS (SELECT 1 FROM corper_payments p WHERE p.user_id = u.id AND p.status = 'paid')`;

async function queryMembers(q, { defaultConsentYes = false } = {}) {
  const params = [];
  const clauses = [`u.role_type = 'corper'`];
  const add = (sql, v) => {
    params.push(v);
    clauses.push(sql.replace("?", `$${params.length}`));
  };
  const year = parseInt(q.year, 10);
  if (Number.isInteger(year)) add(`cp.service_year = ?`, year);
  if (BATCHES.includes(q.batch)) add(`cp.batch = ?`, q.batch);
  if (STREAMS.includes(q.stream)) add(`cp.stream = ?`, q.stream);
  if (q.state && String(q.state).trim()) add(`LOWER(cp.state_of_deployment) = LOWER(?)`, String(q.state).trim());
  if (q.paid === "yes") clauses.push(PAID_SQL);
  if (q.paid === "no") clauses.push(`NOT ${PAID_SQL}`);
  let consent = q.consent;
  if (!["yes", "no"].includes(consent) && defaultConsentYes) consent = "yes";
  if (consent === "yes") clauses.push(`cp.consent_data = TRUE`);
  if (consent === "no") clauses.push(`cp.consent_data = FALSE`);
  if (q.q && String(q.q).trim()) {
    params.push(`%${String(q.q).trim()}%`);
    const i = params.length;
    clauses.push(
      `(u.name ILIKE $${i} OR u.email ILIKE $${i} OR u.phone ILIKE $${i} OR cp.state_code ILIKE $${i} OR cp.call_up_number ILIKE $${i} OR cert.number ILIKE $${i})`
    );
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.sex, u.email, u.phone,
            cp.call_up_number, cp.state_code, cp.service_year, cp.batch, cp.stream,
            cp.state_of_deployment, cp.ppa, cp.discipline, cp.consent_data,
            ${PAID_SQL} AS paid,
            cert.number AS cert_number, cert.visible AS cert_visible, cert.notify_status
       FROM users u
       JOIN corper_profiles cp ON cp.user_id = u.id
       LEFT JOIN corper_certificates cert ON cert.user_id = u.id
      WHERE ${clauses.join(" AND ")}
      ORDER BY cp.service_year DESC NULLS LAST, cp.batch, cp.stream, u.name, u.id`,
    params
  );
  // Progress (same rules as the member's own dashboard).
  const progressRows = rows.length ? await loadProgressRows(rows.map((r) => r.id)) : [];
  const byUser = new Map();
  for (const pr of progressRows) {
    if (!byUser.has(pr.user_id)) byUser.set(pr.user_id, []);
    byUser.get(pr.user_id).push(pr);
  }
  let members = rows.map((r) => {
    const prows = byUser.get(r.id) || [];
    const s = summariseProgress(prows, r.paid);
    const allDone = s.total > 0 && s.completed === s.total;
    const completionDate = allDone
      ? prows.map((x) => x.completed_at).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null
      : null;
    return { ...r, coursesCompleted: s.completed, coursesTotal: s.total, completed: allDone, completionDate };
  });
  if (q.completed === "yes") members = members.filter((m) => m.completed);
  if (q.completed === "no") members = members.filter((m) => !m.completed);
  return members;
}

const mapMember = (m) => ({
  userId: m.id,
  name: m.name,
  gender: m.sex,
  email: m.email,
  phone: m.phone,
  callUpNumber: m.call_up_number,
  stateCode: m.state_code,
  serviceYear: m.service_year,
  batch: m.batch,
  stream: m.stream,
  stateOfDeployment: m.state_of_deployment,
  ppa: m.ppa,
  discipline: m.discipline,
  consent: !!m.consent_data,
  paid: !!m.paid,
  coursesCompleted: m.coursesCompleted,
  coursesTotal: m.coursesTotal,
  completed: m.completed,
  completionDate: m.completionDate,
  certificateNumber: m.cert_number || null,
  certificateStatus: !m.cert_number ? null : m.cert_visible ? "released" : "hidden",
  emailStatus: m.cert_visible ? m.notify_status : null,
});

// GET /api/rtc/admin/corps/members?year&batch&stream&state&paid&completed&consent&q&limit&offset
export async function adminListMembers(req, res) {
  const all = await queryMembers(req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { rows: states } = await pool.query(
    `SELECT DISTINCT state_of_deployment AS s FROM corper_profiles WHERE state_of_deployment IS NOT NULL ORDER BY 1`
  );
  res.json({
    total: all.length,
    limit,
    offset,
    states: states.map((r) => r.s),
    members: all.slice(offset, offset + limit).map(mapMember),
  });
}

const lagosDate = (d) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }) : "");
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");

// GET /api/rtc/admin/corps/members/export?...same filters... (&includeNoConsent=true)
// Decision 2: NYSC only receives members who consented to sharing — unless
// the admin explicitly asks otherwise. The consent column is always there.
// Certificate numbers are only listed for RELEASED certificates.
export async function adminExportMembers(req, res) {
  const includeNoConsent = req.query.includeNoConsent === "true";
  const members = (await queryMembers(req.query, { defaultConsentYes: !includeNoConsent })).map(mapMember);

  const wb = new ExcelJS.Workbook();
  wb.creator = "EPHAAG Farms";
  const ws = wb.addWorksheet("Corps members");
  const columns = [
    ["Name", "name", 28], ["Gender", "gender", 9], ["Email", "email", 30], ["Phone", "phone", 16],
    ["Call-up number", "callUpNumber", 20], ["State code", "stateCode", 14], ["Service year", "serviceYear", 12],
    ["Batch", "batch", 8], ["Stream", "stream", 8], ["State of deployment", "stateOfDeployment", 20],
    ["PPA", "ppa", 30], ["Discipline", "discipline", 24], ["Paid", "paid", 8],
    ["Courses completed", "courses", 18], ["Completion date", "completionDate", 16],
    ["Certificate number", "certificateNumber", 24], ["Consent to share with NYSC", "consent", 16],
  ];
  ws.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C6B2F" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const text = (v) => (v === null || v === undefined ? "" : String(v)); // keeps leading zeros in phone / call-up numbers
  for (const m of members) {
    const row = ws.addRow({
      name: text(m.name),
      gender: cap(m.gender),
      email: text(m.email),
      phone: text(m.phone),
      callUpNumber: text(m.callUpNumber),
      stateCode: text(m.stateCode),
      serviceYear: m.serviceYear ?? "",
      batch: text(m.batch),
      stream: text(m.stream),
      stateOfDeployment: text(m.stateOfDeployment),
      ppa: text(m.ppa),
      discipline: text(m.discipline),
      paid: m.paid ? "Yes" : "No",
      courses: `${m.coursesCompleted} of ${m.coursesTotal}`,
      completionDate: lagosDate(m.completionDate),
      certificateNumber: m.certificateStatus === "released" ? m.certificateNumber : "",
      consent: m.consent ? "Yes" : "No",
    });
    for (const k of ["phone", "callUpNumber", "stateCode"]) row.getCell(k).numFmt = "@";
  }
  ws.autoFilter = { from: "A1", to: { row: 1, column: columns.length } };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Date().toISOString().slice(0, 10);
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="nysc-corps-members-${stamp}.xlsx"`,
    "Content-Length": buf.length,
    "Cache-Control": "private, no-store",
  });
  res.send(buf);
}

// ---------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------
// GET /api/rtc/admin/corps/batches
export async function adminListBatches(req, res) {
  await ensureBatchRows();
  const today = await todayInLagos();
  const { rows: batches } = await pool.query(
    `SELECT b.*, u.name AS completed_by_name FROM corp_batches b
       LEFT JOIN users u ON u.id = b.completed_by
      WHERE EXISTS (SELECT 1 FROM corper_profiles cp WHERE cp.service_year = b.service_year AND cp.batch = b.batch AND cp.stream = b.stream)
      ORDER BY b.service_year DESC, b.batch, b.stream`
  );
  const members = await queryMembers({});
  const { rows: certs } = await pool.query(
    `SELECT cp.service_year, cp.batch, cp.stream, c.visible, c.notify_status
       FROM corper_certificates c JOIN corper_profiles cp ON cp.user_id = c.user_id`
  );
  const { rows: events } = await pool.query(
    `SELECT e.batch_id, e.action, e.note, e.created_at, u.name AS actor
       FROM corp_batch_events e LEFT JOIN users u ON u.id = e.actor_id ORDER BY e.created_at DESC`
  );
  const key = (o) => `${o.service_year}|${o.batch}|${o.stream}`;
  res.json({
    today,
    batches: batches.map((b) => {
      const ms = members.filter((m) => key(m) === key(b));
      const cs = certs.filter((c) => key(c) === key(b));
      const due = b.due_date ? new Date(b.due_date).toLocaleDateString("en-CA") : null;
      const dueReached = !!due && today >= due;
      return {
        id: b.id,
        serviceYear: b.service_year,
        batch: b.batch,
        stream: b.stream,
        label: batchLabel(b),
        dueDate: due,
        completed: b.completed,
        completedAt: b.completed_at,
        completedBy: b.completed_by_name || null,
        members: ms.length,
        paid: ms.filter((m) => m.paid).length,
        finished: ms.filter((m) => m.completed).length,
        certificates: { total: cs.length, released: cs.filter((c) => c.visible).length },
        emails: {
          sent: cs.filter((c) => c.visible && c.notify_status === "sent").length,
          pending: cs.filter((c) => c.visible && c.notify_status === "pending").length,
          unsent: cs.filter((c) => c.visible && ["failed", "not_configured", "no_email"].includes(c.notify_status)).length,
          running: isNotifyRunning(b.id),
        },
        canComplete: !b.completed && dueReached,
        completeBlockedReason: b.completed ? "Already marked complete" : !due ? "Set a due date first" : !dueReached ? `Not allowed before the due date (${due})` : null,
        events: events.filter((e) => e.batch_id === b.id).slice(0, 6).map((e) => ({ action: e.action, note: e.note, at: e.created_at, by: e.actor })),
      };
    }),
  });
}

// PUT /api/rtc/admin/corps/batches/:id   body { dueDate: "YYYY-MM-DD" | null }
export async function adminSetDueDate(req, res) {
  const batch = await loadBatch(req.params.id);
  const { dueDate } = req.body || {};
  if (dueDate !== null && !isDate(dueDate)) throw httpError("Enter the due date as YYYY-MM-DD");
  await pool.query(`UPDATE corp_batches SET due_date = $2 WHERE id = $1`, [batch.id, dueDate]);
  await logEvent(pool, batch.id, "due_date_set", req.user.id, dueDate || "cleared");
  res.json({ ok: true });
}

// POST /api/rtc/admin/corps/batches/:id/complete
// Only on or after the due date. Releases the batch's hidden certificates
// and starts the one-by-one emails in the background.
export async function adminCompleteBatch(req, res) {
  const client = await pool.connect();
  let batch;
  let released;
  try {
    await client.query("BEGIN");
    assertUuid(req.params.id, "Batch");
    const { rows } = await client.query(`SELECT * FROM corp_batches WHERE id = $1 FOR UPDATE`, [req.params.id]);
    batch = rows[0];
    if (!batch) throw httpError("Batch not found", 404);
    if (batch.completed) throw httpError("This batch is already marked complete", 409);
    if (!batch.due_date) throw httpError("Set the batch's due date first", 400, "DUE_DATE_REQUIRED");
    const today = await todayInLagos(client);
    const due = new Date(batch.due_date).toLocaleDateString("en-CA");
    if (today < due) throw httpError(`A batch can only be marked complete on or after its due date (${due})`, 400, "BEFORE_DUE_DATE");
    await client.query(`UPDATE corp_batches SET completed = TRUE, completed_by = $2, completed_at = now() WHERE id = $1`, [batch.id, req.user.id]);
    const r = await client.query(
      `UPDATE corper_certificates c SET visible = TRUE, visible_at = now()
         FROM corper_profiles cp
        WHERE cp.user_id = c.user_id AND cp.service_year = $1 AND cp.batch = $2 AND cp.stream = $3 AND c.visible = FALSE`,
      [batch.service_year, batch.batch, batch.stream]
    );
    released = r.rowCount;
    await logEvent(client, batch.id, "marked_complete", req.user.id, `${released} certificate(s) released`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const run = await runBatchNotifications(batch, ["pending"]);
  res.json({ ok: true, released, emailsQueued: run.queued ?? 0 });
}

// POST /api/rtc/admin/corps/batches/:id/uncomplete  body { reason? } — hides the certificates again.
export async function adminUncompleteBatch(req, res) {
  const client = await pool.connect();
  let hidden;
  try {
    await client.query("BEGIN");
    assertUuid(req.params.id, "Batch");
    const { rows } = await client.query(`SELECT * FROM corp_batches WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const batch = rows[0];
    if (!batch) throw httpError("Batch not found", 404);
    if (!batch.completed) throw httpError("This batch is not marked complete", 409);
    await client.query(`UPDATE corp_batches SET completed = FALSE, completed_by = NULL, completed_at = NULL WHERE id = $1`, [batch.id]);
    const r = await client.query(
      `UPDATE corper_certificates c SET visible = FALSE, visible_at = NULL
         FROM corper_profiles cp
        WHERE cp.user_id = c.user_id AND cp.service_year = $1 AND cp.batch = $2 AND cp.stream = $3 AND c.visible = TRUE`,
      [batch.service_year, batch.batch, batch.stream]
    );
    hidden = r.rowCount;
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    await logEvent(client, batch.id, "unmarked", req.user.id, `${hidden} certificate(s) hidden${reason ? ` — ${reason}` : ""}`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  res.json({ ok: true, hidden });
}

// POST /api/rtc/admin/corps/batches/:id/resend-emails — everyone whose email failed, never went out, or is still pending.
export async function adminResendEmails(req, res) {
  const batch = await loadBatch(req.params.id);
  if (!batch.completed) throw httpError("Mark the batch complete first — certificates are still hidden", 409);
  const run = await runBatchNotifications(batch, ["pending", "failed", "not_configured"]);
  if (!run.started) throw httpError("Emails for this batch are already being sent", 409);
  await logEvent(pool, batch.id, "emails_resent", req.user.id, `${run.queued} queued`);
  res.json({ ok: true, queued: run.queued });
}

// POST /api/rtc/admin/corps/members/:userId/certificate/reissue
// A name correction: same number and code, fresh printed details.
export async function adminReissueCertificate(req, res) {
  assertUuid(req.params.userId, "Member");
  const { rows } = await pool.query(
    `SELECT c.id, c.number, u.name, cp.state_code, cp.service_year, cp.batch, cp.stream
       FROM corper_certificates c JOIN users u ON u.id = c.user_id JOIN corper_profiles cp ON cp.user_id = c.user_id
      WHERE c.user_id = $1`,
    [req.params.userId]
  );
  const c = rows[0];
  if (!c) throw httpError("This member has no certificate", 404);
  const { rows: out } = await pool.query(
    `UPDATE corper_certificates SET holder_name = $2, state_code = $3, service_year = $4, batch = $5, stream = $6,
            revision = revision + 1, reissued_at = now() WHERE id = $1 RETURNING revision`,
    [c.id, c.name, c.state_code, c.service_year, c.batch, c.stream]
  );
  await ensureBatchRows();
  const { rows: b } = await pool.query(`SELECT id FROM corp_batches WHERE service_year = $1 AND batch = $2 AND stream = $3`, [c.service_year, c.batch, c.stream]);
  if (b[0]) await logEvent(pool, b[0].id, "certificate_reissued", req.user.id, `${c.number} (revision ${out[0].revision})`);
  res.json({ ok: true, number: c.number, revision: out[0].revision });
}

// GET /api/rtc/admin/corps/members/:userId/certificate — admin copy of the PDF (even while hidden).
export async function adminDownloadCertificate(req, res) {
  assertUuid(req.params.userId, "Member");
  const { rows } = await pool.query(`SELECT * FROM corper_certificates WHERE user_id = $1`, [req.params.userId]);
  if (!rows[0]) throw httpError("This member has no certificate", 404);
  const pdf = await renderCertificatePdf({ ...rows[0], visible_at: rows[0].visible_at || rows[0].issued_at });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${rows[0].number}.pdf"`, "Content-Length": pdf.length });
  res.send(pdf);
}
