import ProfilePhotoUploader from "./ProfilePhotoUploader.jsx";

// Read-only account summary + passport photo uploader, shared across
// Buyer/Processor/Investor rooms (Farmer's Room has its own editable
// version — FarmerProfileCard — since farmers can edit crops/location
// inline; the other roles don't have an edit flow yet, just display +
// photo upload).
export default function AccountProfileCard({ user, extraFields = [] }) {
  const genderLabel = user.sex === "male" ? "Male" : user.sex === "female" ? "Female" : "—";

  const fields = [
    { label: "Name", value: user.name },
    { label: "Email", value: user.email },
    { label: "Phone", value: user.phone },
    { label: "Gender", value: genderLabel },
    { label: "State", value: user.state },
    { label: "LGA", value: user.lga },
    ...extraFields,
  ];

  return (
    <div className="card space-y-4">
      <ProfilePhotoUploader />
      <div className="grid grid-cols-2 gap-3 text-sm">
        {fields.map((f) => (
          <div key={f.label}>
            <p className="text-ink-600">{f.label}</p>
            <p className="text-ink-900">{f.value || "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
