import { pool } from "../db/pool.js";
import path from "node:path";
import { generateReference, REF_PREFIX } from "../utils/reference.js";
import { sendMail } from "../utils/email.js";
import { REQUEST_ATTACHMENTS_DIR } from "../middleware/upload.js";

// Generic cross-department approval workflow (2026-08-12 spec). Any admin
// user can raise a request against any department, build a chain of
// specific approvers, and an "Admin final approval" step is always
// appended automatically as the last step. Steps must be approved in
// order. See [[ephaag-farms]] memory for the full design rationale.

async function notifyApprover(step, request) {
  if (!step.approver_id) {
    // Final step — notify every admin, since it's "any admin" territory.
    const { rows } = await pool.query(`SELECT email FROM users WHERE role_type = 'admin' AND email IS NOT NULL`);
    for (const { email } of rows) {
      sendMail({
        to: email,
        subject: `Request ${request.reference} awaiting final approval`,
        html: `<p>"${request.title}" (${request.department}) is awaiting final approval.</p>`,
      }).catch(() => {});
    }
    return;
  }
  const { rows } = await pool.query(`SELECT email, name FROM users WHERE id = $1`, [step.approver_id]);
  const approver = rows[0];
  if (!approver?.email) return;
  sendMail({
    to: approver.email,
    subject: `Request ${request.reference} awaiting your approval`,
    html: `<p>Hi ${approver.name}, "${request.title}" (${request.department}) is waiting for your approval as ${step.label}.</p>`,
  }).catch(() => {});
}

async function notifyRequester(request, decision) {
  const { rows } = await pool.query(`SELECT email, name FROM users WHERE id = $1`, [request.requester_id]);
  const requester = rows[0];
  if (!requester?.email) return;
  sendMail({
    to: requester.email,
    subject: `Request ${request.reference} ${decision}`,
    html: `<p>Hi ${requester.name}, your request "${request.title}" has been ${decision}.</p>`,
  }).catch(() => {});
}

export async function createRequest(req, res) {
  const { department, title, description } = req.body;
  // Multipart bodies (when a file is attached) stringify everything,
  // including the approvers array — parse it back if needed.
  let approvers = req.body.approvers;
  if (typeof approvers === "string") {
    try {
      approvers = JSON.parse(approvers);
    } catch {
      approvers = [];
    }
  }
  if (!department || !title) {
    return res.status(400).json({ error: "department and title are required" });
  }
  const approverList = Array.isArray(approvers) ? approvers : [];
  // Stored as just the filename — served back out through an authenticated
  // download endpoint below, not a public static path (unlike photos,
  // these can contain sensitive department/financial details).
  const attachmentFilename = req.file ? req.file.filename : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reference = generateReference(REF_PREFIX.request);
    const { rows } = await client.query(
      `INSERT INTO department_requests (reference, requester_id, department, title, description, attachment_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [reference, req.user.id, department, title, description || null, attachmentFilename]
    );
    const request = rows[0];

    let order = 1;
    for (const step of approverList) {
      if (!step.approverId || !step.label) continue;
      await client.query(
        `INSERT INTO request_approval_steps (request_id, step_order, approver_id, label)
         VALUES ($1, $2, $3, $4)`,
        [request.id, order, step.approverId, step.label]
      );
      order++;
    }
    // Always-final step: any admin can act on it.
    await client.query(
      `INSERT INTO request_approval_steps (request_id, step_order, approver_id, label)
       VALUES ($1, $2, NULL, 'Admin final approval')`,
      [request.id, order]
    );
    await client.query("COMMIT");

    const { rows: firstStepRows } = await pool.query(
      `SELECT * FROM request_approval_steps WHERE request_id = $1 AND step_order = 1`,
      [request.id]
    );
    if (firstStepRows[0]) notifyApprover(firstStepRows[0], request).catch(() => {});

    res.status(201).json({ request });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not create request" });
  } finally {
    client.release();
  }
}

async function attachSteps(requests) {
  if (requests.length === 0) return requests;
  const ids = requests.map((r) => r.id);
  const { rows: steps } = await pool.query(
    `SELECT s.*, u.name AS approver_name, d.name AS decided_by_name
     FROM request_approval_steps s
     LEFT JOIN users u ON u.id = s.approver_id
     LEFT JOIN users d ON d.id = s.decided_by
     WHERE s.request_id = ANY($1::uuid[]) ORDER BY s.request_id, s.step_order ASC`,
    [ids]
  );
  return requests.map((r) => ({ ...r, steps: steps.filter((s) => s.request_id === r.id) }));
}

export async function myRequests(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM department_requests WHERE requester_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ requests: await attachSteps(rows) });
}

// The current actionable step for a pending request is its lowest-order
// still-pending step. This endpoint returns requests where THAT step
// belongs to me (or is the open-to-any-admin final step).
export async function awaitingMyApproval(req, res) {
  const { rows } = await pool.query(
    `SELECT dr.* FROM department_requests dr
     WHERE dr.status = 'pending' AND EXISTS (
       SELECT 1 FROM request_approval_steps s
       WHERE s.request_id = dr.id AND s.status = 'pending'
       AND s.step_order = (
         SELECT MIN(step_order) FROM request_approval_steps WHERE request_id = dr.id AND status = 'pending'
       )
       AND (s.approver_id = $1 OR s.approver_id IS NULL)
     )
     ORDER BY dr.created_at ASC`,
    [req.user.id]
  );
  res.json({ requests: await attachSteps(rows) });
}

export async function getRequest(req, res) {
  const { rows } = await pool.query(
    `SELECT dr.*, u.name AS requester_name FROM department_requests dr
     JOIN users u ON u.id = dr.requester_id WHERE dr.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Request not found" });
  const [withSteps] = await attachSteps([rows[0]]);
  res.json({ request: withSteps });
}

export async function decideStep(req, res) {
  const { id, stepId } = req.params;
  const { decision, note } = req.body;
  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reqRes = await client.query(`SELECT * FROM department_requests WHERE id = $1 FOR UPDATE`, [id]);
    const request = reqRes.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Request not found" });
    }
    if (request.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    const stepsRes = await client.query(
      `SELECT * FROM request_approval_steps WHERE request_id = $1 ORDER BY step_order ASC`,
      [id]
    );
    const steps = stepsRes.rows;
    const currentStep = steps.find((s) => s.status === "pending");
    if (!currentStep || currentStep.id !== stepId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This isn't the current step awaiting a decision" });
    }
    const eligible = currentStep.approver_id === req.user.id || currentStep.approver_id === null;
    if (!eligible) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You aren't the assigned approver for this step" });
    }

    await client.query(
      `UPDATE request_approval_steps SET status = $1, decided_by = $2, decided_at = now(), note = $3 WHERE id = $4`,
      [decision, req.user.id, note || null, stepId]
    );

    let requestStatus = "pending";
    if (decision === "rejected") {
      requestStatus = "rejected";
      await client.query(
        `UPDATE request_approval_steps SET status = 'skipped' WHERE request_id = $1 AND status = 'pending'`,
        [id]
      );
    } else {
      const isLastStep = currentStep.step_order === steps[steps.length - 1].step_order;
      if (isLastStep) requestStatus = "approved";
    }

    if (requestStatus !== "pending") {
      await client.query(`UPDATE department_requests SET status = $1 WHERE id = $2`, [requestStatus, id]);
    }
    await client.query("COMMIT");

    if (requestStatus === "pending") {
      const nextStep = steps.find((s) => s.step_order === currentStep.step_order + 1);
      if (nextStep) notifyApprover(nextStep, request).catch(() => {});
    } else {
      notifyRequester(request, requestStatus).catch(() => {});
    }

    const { rows: refreshed } = await pool.query(`SELECT * FROM department_requests WHERE id = $1`, [id]);
    const [withSteps] = await attachSteps(refreshed);
    res.json({ request: withSteps });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not record decision" });
  } finally {
    client.release();
  }
}

export async function cancelRequest(req, res) {
  const { rows } = await pool.query(
    `UPDATE department_requests SET status = 'cancelled'
     WHERE id = $1 AND requester_id = $2 AND status = 'pending' RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(400).json({ error: "Request not found or not cancellable" });
  res.json({ request: rows[0] });
}

export async function listAdminUsers(req, res) {
  const { rows } = await pool.query(
    `SELECT id, name, email FROM users WHERE role_type = 'admin' ORDER BY name ASC`
  );
  res.json({ users: rows });
}

export async function downloadAttachment(req, res) {
  const { rows } = await pool.query(`SELECT attachment_url FROM department_requests WHERE id = $1`, [req.params.id]);
  if (!rows[0]?.attachment_url) return res.status(404).json({ error: "No attachment on this request" });
  const filePath = path.join(REQUEST_ATTACHMENTS_DIR, rows[0].attachment_url);
  res.sendFile(filePath);
}
