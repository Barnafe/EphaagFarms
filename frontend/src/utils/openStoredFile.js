import { apiFetch } from "../api/client.js";

// Private files are opened through a short-lived signed link the server only gives to people allowed to see the file.
export async function openStoredFile(fileId) {
  const { url } = await apiFetch(`/files/${fileId}/link`);
  window.open(url, "_blank", "noopener");
}
