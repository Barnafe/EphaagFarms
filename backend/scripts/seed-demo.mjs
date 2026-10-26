// Demo data through the public API (so it exercises the same rules as real sign-ups):
//   BASE_URL=http://localhost:4000 node scripts/seed-demo.mjs
// Creates a few farmers, a buyer, an investor and a corps member. Safe to run
// repeatedly (it skips accounts that already exist). Units with map pins,
// suppliers and courses are added by the phases that introduce them.
const BASE = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const people = [
  { name: "Demo Farmer One", email: "farmer1@demo.ephaag.test", role_type: "farmer", sex: "male", state: "Benue", lga: "Gboko", ward: "Ward A", unit: "Unit 1", crops: "Maize,Cassava" },
  { name: "Demo Farmer Two", email: "farmer2@demo.ephaag.test", role_type: "farmer", sex: "female", state: "Benue", lga: "Gboko", ward: "Ward A", unit: "Unit 1", crops: "Yam,Rice" },
  { name: "Demo Farmer Phone Only", phone: "08035550123", role_type: "farmer", sex: "female", state: "Bauchi", lga: "Bauchi", ward: "Ward B", unit: "Unit 2", crops: "Millet" },
  { name: "Demo Buyer", email: "buyer@demo.ephaag.test", role_type: "buyer", sex: "male", buyerType: "individual", address: "12 Demo Close, Abuja" },
  { name: "Demo Investor", email: "investor@demo.ephaag.test", role_type: "investor", sex: "male" },
];
for (const p of people) {
  const res = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "DemoPass123!", ...p }) });
  console.log(`${p.name}: ${res.status === 201 ? "created" : res.status === 409 ? "already exists" : `failed (${res.status})`}`);
}
console.log("Demo password for every demo account: DemoPass123!");
