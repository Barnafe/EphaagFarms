import requests, sys

BASE = "http://localhost:4000/api"
fails = []

def check(name, cond, detail=""):
    if cond:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name} {detail}")
        fails.append(name)

def auth(u):
    return {"Authorization": f"Bearer {u['token']}"}

r = requests.post(f"{BASE}/auth/login", json={"email": "admin@ephaag.test", "password": "Admin1234"})
check("admin login", r.status_code == 200, r.text[:200])
admin = r.json()
admin_h = auth(admin)

# ============================================================
# Item 5: Buyer registration — individual vs organization
# ============================================================
r = requests.post(f"{BASE}/auth/register", json={
    "name": "Jane Buyer", "email": "janebuyer@test.com", "password": "Passw0rd1",
    "role_type": "buyer", "sex": "female", "phone": "08011112222",
    "state": "Lagos", "lga": "Ikeja", "buyerType": "individual"
})
check("individual buyer register (gender required+given)", r.status_code == 201, r.text[:300])
check("individual buyer buyerType correct", r.json()["user"]["buyerType"] == "individual", r.json()["user"])

r = requests.post(f"{BASE}/auth/register", json={
    "name": "Green Foods Ltd", "email": "greenfoods@test.com", "password": "Passw0rd1",
    "role_type": "buyer", "phone": "08033334444", "state": "Lagos", "lga": "Ikeja",
    "buyerType": "organization", "contactPersonName": "Musa Ibrahim", "registeredAddress": "12 Broad Street, Lagos"
})
check("organization buyer register WITHOUT gender succeeds", r.status_code == 201, r.text[:300])
org_user = r.json()["user"]
check("organization buyerType correct", org_user["buyerType"] == "organization", org_user)
check("organization_name = name field", org_user["organizationName"] == "Green Foods Ltd", org_user)
check("contact_person_name saved", org_user["contactPersonName"] == "Musa Ibrahim", org_user)
check("registered_address saved", org_user["registeredAddress"] == "12 Broad Street, Lagos", org_user)

r = requests.post(f"{BASE}/auth/register", json={
    "name": "No Gender Farmer", "email": "nogenderfarmer@test.com", "password": "Passw0rd1",
    "role_type": "farmer", "state": "Benue", "lga": "Gboko", "ward": "A", "unit": "A", "crops": "Maize"
})
check("farmer WITHOUT gender still rejected (gender only optional for org buyers)", r.status_code == 400, r.text[:300])

# ============================================================
# Item 2: "Nearest unit" field on List Product (backend field unchanged, just verify it saves)
# ============================================================
r = requests.post(f"{BASE}/auth/register", json={
    "name": "Product Farmer", "email": "productfarmer@test.com", "password": "Passw0rd1",
    "role_type": "farmer", "sex": "male", "state": "Benue", "lga": "Gboko",
    "ward": "A", "unit": "A", "crops": "Maize"
})
check("farmer register for product listing test", r.status_code == 201, r.text[:300])
farmer = r.json()
farmer_h = auth(farmer)

r = requests.post(f"{BASE}/farmers/me/products", headers=farmer_h, json={
    "crop": "Maize", "quantity": 50, "unit": "bags", "address": "Luka Unit, Gboko"
})
check("list product with nearest-unit value saves", r.status_code == 201, r.text[:300])
check("nearest-unit value persisted correctly", r.json()["product"]["address"] == "Luka Unit, Gboko", r.json())

# ============================================================
# Item 3: Personal savings
# ============================================================
r = requests.post(f"{BASE}/farmers/me/savings", headers=farmer_h, json={"amount": 10000, "durationYears": 1})
check("savings below minimum rejected", r.status_code == 400, r.text[:300])

r = requests.post(f"{BASE}/farmers/me/savings", headers=farmer_h, json={"amount": 50000, "durationYears": 2})
check("savings creation succeeds", r.status_code == 201, r.text[:300])
saving = r.json()["saving"]
check("savings reference format correct", saving["reference"].startswith("SAV-"), saving)
check("projected interest computed (50000 * 8% * 2yrs = 8000)", saving["projectedInterest"] == 8000.0, saving)
saving_id = saving["id"]

r = requests.get(f"{BASE}/farmers/me/savings", headers=farmer_h)
check("farmer can list own savings", r.status_code == 200 and len(r.json()["savings"]) == 1, r.text[:300])

r = requests.get(f"{BASE}/farmers/admin/savings", headers=admin_h)
check("admin can see the saving", r.status_code == 200 and any(s["id"] == saving_id for s in r.json()["savings"]), r.text[:300])

r = requests.post(f"{BASE}/farmers/admin/savings/{saving_id}/payout", headers=admin_h)
check("admin pays out the saving", r.status_code == 200 and r.json()["saving"]["status"] == "paid_out", r.text[:300])

r = requests.post(f"{BASE}/farmers/admin/savings/{saving_id}/payout", headers=admin_h)
check("re-paying out an already-paid saving rejected", r.status_code == 400, r.text[:300])

r = requests.get(f"{BASE}/farmers/me/transactions", headers=farmer_h)
check("savings interest appears in farmer's transactions", r.status_code == 200 and any(t["type"] == "savings_interest" and t["amount"] == 8000.0 for t in r.json()["transactions"]), r.text[:400])

# ============================================================
# Item 3: Feedback
# ============================================================
r = requests.post(f"{BASE}/farmers/me/feedback", headers=farmer_h, json={
    "category": "maltreatment", "message": "My unit leader has been unfair with attendance marking."
})
check("feedback submission succeeds", r.status_code == 201, r.text[:300])
feedback_id = r.json()["feedback"]["id"]

r = requests.get(f"{BASE}/farmers/me/feedback", headers=farmer_h)
check("farmer sees own feedback", r.status_code == 200 and len(r.json()["feedback"]) == 1, r.text[:300])

r = requests.get(f"{BASE}/farmers/admin/feedback", headers=admin_h)
check("admin sees the feedback", r.status_code == 200 and any(f["id"] == feedback_id for f in r.json()["feedback"]), r.text[:300])

r = requests.post(f"{BASE}/farmers/admin/feedback/{feedback_id}/review", headers=admin_h)
check("admin marks feedback reviewed", r.status_code == 200 and r.json()["feedback"]["status"] == "reviewed", r.text[:300])

# ============================================================
# Item 4: Consultancy apply
# ============================================================
r = requests.post(f"{BASE}/rtc/admin/consultancy", headers=admin_h, json={
    "title": "Season planning session", "description": "One-on-one planning for the new season."
})
check("admin publishes consultancy offering", r.status_code == 201, r.text[:300])
offering_id = r.json()["offering"]["id"]

r = requests.post(f"{BASE}/rtc/consultancy/{offering_id}/apply", headers=farmer_h, json={"message": "I'd like guidance on crop rotation."})
check("farmer applies for consultancy", r.status_code == 201, r.text[:300])

r = requests.post(f"{BASE}/rtc/consultancy/{offering_id}/apply", headers=farmer_h, json={"message": "again"})
check("duplicate consultancy application rejected", r.status_code == 400, r.text[:300])

r = requests.get(f"{BASE}/rtc/consultancy", headers=farmer_h)
offering = next(o for o in r.json()["offerings"] if o["id"] == offering_id)
check("farmer sees their own request status on the offering", offering["requestStatus"] == "pending", offering)

r = requests.get(f"{BASE}/rtc/admin/consultancy-requests", headers=admin_h)
check("admin sees the consultancy request", r.status_code == 200 and len(r.json()["requests"]) == 1, r.text[:300])
request_id = r.json()["requests"][0]["id"]

r = requests.post(f"{BASE}/rtc/admin/consultancy-requests/{request_id}/status", headers=admin_h, json={"status": "scheduled"})
check("admin updates consultancy request status", r.status_code == 200 and r.json()["request"]["status"] == "scheduled", r.text[:300])

# ============================================================
# Item 6: Buyer/seller anonymity (structural check via live endpoints)
# ============================================================
r = requests.get(f"{BASE}/farmers/me/transactions", headers=farmer_h)
transactions_text = r.text
check("farmer's transactions never mention buyer identity fields", '"buyer_name"' not in transactions_text and '"buyerName"' not in transactions_text, "leak found")

print(f"\n{'='*40}\nTOTAL FAILS: {len(fails)}")
if fails:
    print("Failed checks:", fails)
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
