// In production this server is served from the same origin as the API
// (see backend/src/server.js), so a relative /api path just works with
// no configuration. VITE_API_URL can still override this — e.g. for a
// separately-hosted frontend pointed at a different backend origin.
export const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");
// Origin only (no /api suffix) — for building static asset URLs like
// /uploads/photos/... that live outside the /api namespace.
export const API_ORIGIN = BASE_URL.replace(/\/api$/, "");
const TOKEN_KEY = "ephaag_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Can't reach the backend. Is it running? (npm run dev from the project root starts both.)"
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    Object.assign(err, data); // e.g. { unverified: true, userId } from /auth/login
    throw err;
  }

  return data;
}

// For multipart file uploads — no Content-Type header, the browser sets
// the multipart boundary itself when the body is a FormData instance.
export async function apiUpload(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });
  } catch {
    throw new Error(
      "Can't reach the backend. Is it running? (npm run dev from the project root starts both.)"
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// For downloading an authenticated binary file (e.g. an uploaded PDF) —
// fetches as a blob and triggers a browser download, since a plain <a
// href> can't carry the Authorization header.
export async function apiDownload(path, filename) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
