import { pool } from "../db/pool.js";
import { discardFileRef } from "../utils/fileRefs.js";
import { MATERIALS_DIR } from "../middleware/upload.js";

// ---------------------------------------------------------------------
// Seminar content for farmers: a seminar topic (a general course) holds videos
// and slide decks. The system, not the farmer, marks things complete: a video
// when it has been watched to the end, a deck when its last slide is reached,
// and the whole topic once every item is done.
// ---------------------------------------------------------------------

const httpError = (m, s = 400) => Object.assign(new Error(m), { status: s });

function validVideoUrl(value) {
  try {
    const u = new URL(String(value).trim());
    return (u.protocol === "https:" || u.protocol === "http:") && String(value).length <= 500;
  } catch {
    return false;
  }
}

// Marks a general course complete for a farmer and refreshes their running
// course completion percentage (completed topics out of all approved topics).
export async function markCourseComplete(userId, courseId) {
  await pool.query(
    `INSERT INTO course_progress (course_id, user_id, completed)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (course_id, user_id) DO UPDATE SET completed = TRUE`,
    [courseId, userId]
  );
  await pool.query(
    `UPDATE farmer_profiles SET course_pct = (
       CASE WHEN (SELECT COUNT(*) FROM courses WHERE approved = TRUE AND audience = 'general') = 0 THEN 0
       ELSE ROUND(100.0 * (
         SELECT COUNT(*) FROM course_progress cp
         JOIN courses c ON c.id = cp.course_id
         WHERE cp.user_id = $1 AND cp.completed AND c.approved = TRUE AND c.audience = 'general'
       ) / (SELECT COUNT(*) FROM courses WHERE approved = TRUE AND audience = 'general'), 2)
       END
     ) WHERE user_id = $1`,
    [userId]
  );
}

// ---- Admin -----------------------------------------------------------

export async function adminListItems(req, res) {
  const { rows: course } = await pool.query(`SELECT id, audience FROM courses WHERE id = $1`, [req.params.id]).catch(() => ({ rows: [] }));
  if (!course[0]) return res.status(404).json({ error: "Course not found" });
  const map = await loadSeminarItems(null, [course[0].id]);
  res.json({ items: map.get(course[0].id) || [] });
}

export async function adminAddItem(req, res) {
  const files = req.files || [];
  const discard = () => files.forEach((f) => discardFileRef(f.filename, MATERIALS_DIR));
  const title = String(req.body.title || "").trim();
  const kind = req.body.kind;
  const videoUrl = String(req.body.videoUrl || "").trim();

  const { rows: course } = await pool.query(`SELECT id, audience FROM courses WHERE id = $1`, [req.params.id]).catch(() => ({ rows: [] }));
  if (!course[0]) { discard(); return res.status(404).json({ error: "Course not found" }); }
  if (course[0].audience !== "general") { discard(); return res.status(400).json({ error: "Seminar content is only for general (farmer) courses" }); }
  if (!title) { discard(); return res.status(400).json({ error: "Give this item a title" }); }
  if (!["video", "slides"].includes(kind)) { discard(); return res.status(400).json({ error: "Choose video or slides" }); }
  if (kind === "video" && !validVideoUrl(videoUrl)) { discard(); return res.status(400).json({ error: "Paste a valid video link (YouTube, Vimeo or a direct video file)" }); }
  if (kind === "slides" && files.length === 0) return res.status(400).json({ error: "Add at least one slide image" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: pos } = await client.query(`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM seminar_items WHERE course_id = $1`, [course[0].id]);
    const { rows } = await client.query(
      `INSERT INTO seminar_items (course_id, position, title, kind, video_url) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [course[0].id, pos[0].next, title, kind, kind === "video" ? videoUrl : null]
    );
    if (kind === "slides") {
      let n = 0;
      for (const f of files) {
        n += 1;
        await client.query(`INSERT INTO seminar_slides (item_id, position, file_ref, image_url) VALUES ($1, $2, $3, $4)`, [rows[0].id, n, f.filename, f.publicUrl]);
      }
    }
    await client.query("COMMIT");
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    discard();
    throw err;
  } finally {
    client.release();
  }
}

export async function adminDeleteItem(req, res) {
  const { rows: slides } = await pool.query(`SELECT file_ref FROM seminar_slides WHERE item_id = $1`, [req.params.itemId]);
  const { rowCount } = await pool.query(`DELETE FROM seminar_items WHERE id = $1`, [req.params.itemId]);
  if (!rowCount) return res.status(404).json({ error: "Item not found" });
  slides.forEach((s) => discardFileRef(s.file_ref, MATERIALS_DIR));
  res.json({ deleted: true });
}

// ---- Shared loader -----------------------------------------------------

// Items (and slide image links) for a set of courses, grouped by course id.
// With a userId each item also says whether that person has completed it.
export async function loadSeminarItems(userId, courseIds) {
  const out = new Map();
  if (!courseIds.length) return out;
  const { rows: items } = await pool.query(
    `SELECT i.*, (p.user_id IS NOT NULL) AS completed
     FROM seminar_items i
     LEFT JOIN seminar_item_progress p ON p.item_id = i.id AND p.user_id = $1
     WHERE i.course_id = ANY($2::uuid[])
     ORDER BY i.course_id, i.position`,
    [userId, courseIds]
  );
  const slideItemIds = items.filter((i) => i.kind === "slides").map((i) => i.id);
  const slidesBy = new Map();
  if (slideItemIds.length) {
    const { rows: slides } = await pool.query(
      `SELECT id, item_id, image_url FROM seminar_slides WHERE item_id = ANY($1::uuid[]) ORDER BY item_id, position`,
      [slideItemIds]
    );
    for (const s of slides) {
      if (!slidesBy.has(s.item_id)) slidesBy.set(s.item_id, []);
      slidesBy.get(s.item_id).push(s.image_url);
    }
  }
  for (const i of items) {
    if (!out.has(i.course_id)) out.set(i.course_id, []);
    out.get(i.course_id).push({
      id: i.id,
      title: i.title,
      kind: i.kind,
      videoUrl: i.kind === "video" ? i.video_url : null,
      slides: i.kind === "slides" ? slidesBy.get(i.id) || [] : undefined,
      completed: !!i.completed,
    });
  }
  return out;
}

// ---- Farmer ----------------------------------------------------------

export async function completeItem(req, res) {
  const { rows } = await pool
    .query(
      `SELECT i.id, i.course_id FROM seminar_items i
       JOIN courses c ON c.id = i.course_id
       WHERE i.id = $1 AND c.approved = TRUE AND c.audience = 'general'`,
      [req.params.itemId]
    )
    .catch(() => ({ rows: [] }));
  const item = rows[0];
  if (!item) throw httpError("Item not found", 404);

  await pool.query(`INSERT INTO seminar_item_progress (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.user.id, item.id]);

  const { rows: left } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM seminar_items i
     WHERE i.course_id = $1
       AND NOT EXISTS (SELECT 1 FROM seminar_item_progress p WHERE p.item_id = i.id AND p.user_id = $2)`,
    [item.course_id, req.user.id]
  );
  const courseCompleted = left[0].n === 0;
  if (courseCompleted) await markCourseComplete(req.user.id, item.course_id);
  res.json({ completed: true, courseCompleted });
}
