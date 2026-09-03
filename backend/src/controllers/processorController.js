import { pool } from "../db/pool.js";

export async function myJobs(req, res) {
  const { rows: jobs } = await pool.query(
    `SELECT j.*, o.reference, o.delivery_location
     FROM processor_jobs j JOIN orders o ON o.id = j.order_id
     WHERE j.processor_id = $1
     ORDER BY j.assigned_at DESC`,
    [req.user.id]
  );
  const { rows: items } = await pool.query(
    "SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])",
    [jobs.map((j) => j.order_id)]
  );
  res.json({
    jobs: jobs.map((j) => ({ ...j, items: items.filter((i) => i.order_id === j.order_id) })),
  });
}

const NEXT_STATUS = { assigned: "processing", processing: "complete" };

export async function advanceJob(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query("SELECT * FROM processor_jobs WHERE id = $1 AND processor_id = $2", [
    id,
    req.user.id,
  ]);
  const job = rows[0];
  if (!job) return res.status(404).json({ error: "Job not found" });

  const next = NEXT_STATUS[job.status];
  if (!next) return res.status(400).json({ error: "Job already complete" });

  const { rows: updated } = await pool.query(
    "UPDATE processor_jobs SET status = $1 WHERE id = $2 RETURNING *",
    [next, id]
  );
  res.json({ job: updated[0] });
}
