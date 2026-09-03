import { useState } from "react";

export default function AgreementUpload({ onUpload }) {
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setError("Choose the signed agreement PDF first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Upload your signed agreement</p>
      <p className="mt-1 text-xs text-ink-600">
        Download the form from the email we sent you, sign it, then upload the signed copy here
        (PDF only).
      </p>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-ink-600"
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Uploading…" : "Submit signed agreement"}
        </button>
      </form>
    </div>
  );
}
