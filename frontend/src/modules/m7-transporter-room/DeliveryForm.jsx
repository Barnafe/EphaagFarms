import { useEffect, useState } from "react";
import { apiUpload } from "../../api/client.js";

// Proof of delivery: the code the recipient was sent, the recipient's name, a photo, and the phone's GPS position.
export default function DeliveryForm({ shipment, onDone }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState(null);
  const [gps, setGps] = useState(null);
  const [gpsState, setGpsState] = useState("looking");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) { setGpsState("unavailable"); return undefined; }
    const id = navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setGpsState("ok"); },
      () => setGpsState("unavailable"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
    return () => { void id; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const f = new FormData();
      f.append("code", code.trim());
      f.append("recipientName", name.trim());
      if (photo) f.append("photo", photo);
      if (gps) { f.append("lat", gps.lat); f.append("lng", gps.lng); f.append("accuracy", Math.round(gps.accuracy)); }
      else f.append("gpsMissingReason", reason.trim());
      await apiUpload(`/transport/shipments/${shipment.id}/deliver`, f);
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="field mt-3 space-y-3 rounded-card border border-soil-200 p-3" onSubmit={submit}>
      <div>
        <label htmlFor={`code-${shipment.id}`}>Delivery code from the recipient</label>
        <input id={`code-${shipment.id}`} inputMode="numeric" maxLength={6} placeholder="6 digits" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
      </div>
      <div>
        <label htmlFor={`name-${shipment.id}`}>Name of the person who received the goods</label>
        <input id={`name-${shipment.id}`} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label htmlFor={`photo-${shipment.id}`}>Photo of the goods with the recipient</label>
        <input id={`photo-${shipment.id}`} type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} required />
      </div>
      <div className="text-xs text-ink-600">
        {gpsState === "looking" && "Finding your position…"}
        {gpsState === "ok" && `Position captured (about ${Math.round(gps.accuracy)} m).`}
        {gpsState === "unavailable" && (
          <div>
            <p className="text-red-700">Your phone could not give a position. Allow location access and reload, or write why it is not possible.</p>
            <input className="mt-2" aria-label="Why there is no GPS position" placeholder="Why there is no GPS position" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button className="btn-primary" type="submit" disabled={busy || gpsState === "looking"}>{busy ? "Saving…" : "Confirm delivery"}</button>
    </form>
  );
}
