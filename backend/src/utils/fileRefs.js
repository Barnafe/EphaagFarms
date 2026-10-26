import fs from "node:fs";
import path from "node:path";
import { isStoredFileId, getFileRow, sendStoredFile, deleteFile } from "../services/storage.js";

// Database columns hold either a stored-file id (new uploads) or the bare file
// name of an old disk upload. These helpers serve both, and answer a clear
// "file missing" instead of a broken link when the file is gone (for example
// after a free-plan redeploy wiped the old disk).
export async function sendFileRef(res, ref, { legacyDir, download = false, filename = null } = {}) {
  if (!ref) return res.status(404).json({ error: "File missing" });
  if (isStoredFileId(ref)) return sendStoredFile(res, await getFileRow(ref), { download, filename });
  const full = path.join(legacyDir, path.basename(String(ref)));
  if (!fs.existsSync(full)) return res.status(404).json({ error: "File missing" });
  return download ? res.download(full, filename || path.basename(full)) : res.sendFile(full);
}

export function discardFileRef(ref, legacyDir) {
  if (!ref) return;
  if (isStoredFileId(ref)) { deleteFile(ref).catch(() => {}); return; }
  fs.promises.unlink(path.join(legacyDir, path.basename(String(ref)))).catch(() => {});
}

// "…/uploads/agreements/<ref>" or a bare ref -> <ref>
export const refFromUrl = (value) => (value ? String(value).split("/").pop() : null);
