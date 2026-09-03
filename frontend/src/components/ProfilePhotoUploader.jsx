import { useRef, useState } from "react";
import { apiUpload, API_ORIGIN } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Passport/profile photo upload + display — used on every role's Profile
// panel. Uploads immediately on file selection (no separate "save" step).
export default function ProfilePhotoUploader() {
  const { session, refreshSession } = useAuth();
  const user = session?.user;
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      await apiUpload("/auth/me/photo", formData);
      await refreshSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const photoUrl = user?.photoUrl || user?.photo_url;

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        <img
          src={`${API_ORIGIN}${photoUrl}`}
          alt="Your passport"
          className="h-20 w-20 rounded-full border border-white/20 object-cover"
        />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-clay-700 text-xl font-semibold text-white">
          {initials(user?.name)}
        </span>
      )}
      <div>
        <button
          type="button"
          className="btn-outline text-sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading..." : photoUrl ? "Change passport photo" : "Upload passport photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}
