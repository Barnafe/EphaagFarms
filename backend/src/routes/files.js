import { Router } from "../utils/asyncRouter.js";
import { requireAuth } from "../middleware/auth.js";
import { getFileRow, canAccessFile, signedUrl, sendStoredFile, verifyLocalSignature, UUID_RE } from "../services/storage.js";

const router = Router();

// Ask for a link to a file. The app checks who you are first; the link it
// returns stops working after 5 minutes.
router.get("/:id/link", requireAuth, async (req, res) => {
  const row = await getFileRow(req.params.id);
  if (!row) return res.status(404).json({ error: "File missing" });
  if (!(await canAccessFile(req.user, row))) return res.status(403).json({ error: "You do not have access to this file" });
  const { url, expiresAt } = await signedUrl(row);
  res.json({ url, expiresAt });
});

// Local-disk driver only (development): the signed link lands here.
router.get("/:id/content", async (req, res) => {
  if (!UUID_RE.test(req.params.id) || !verifyLocalSignature(req.params.id, req.query.exp, String(req.query.sig || ""))) {
    return res.status(403).json({ error: "This link is invalid or has expired" });
  }
  const row = await getFileRow(req.params.id);
  await sendStoredFile(res, row);
});

export default router;
