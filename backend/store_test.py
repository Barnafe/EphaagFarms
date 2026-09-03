import requests, sys, random, string, os

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


def rand():
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=6))


# ============================================================
# Setup: admin, a Procurement HOD, a Finance HOD, a farmer, a buyer,
# a processor, a distributor.
# ============================================================
r = requests.post(f"{BASE}/auth/login", json={"email": "admin@ephaag.test", "password": "Admin1234"})
check("main admin login", r.status_code == 200, r.text[:300])
main_admin = r.json()
main_h = auth(main_admin)


def register(role, extra=None, code=None):
    tag = rand()
    body = {
        "name": f"{role.title()} {tag}", "email": f"{role}{tag}@test.com", "password": "Passw0rd1",
        "role_type": role, "sex": "male", "phone": f"080{random.randint(10000000,99999999)}",
        "state": "Benue", "lga": "Gboko",
    }
    if role == "farmer":
        body.update({"ward": "A", "unit": "A", "crops": "Maize"})
    if role == "buyer":
        body.update({"buyerType": "individual", "address": "12 Test Close, Lagos"})
    if role == "admin" and code:
        body["setupCode"] = code
    if extra:
        body.update(extra)
    return requests.post(f"{BASE}/auth/register", json=body)


setup_code = None
with open(os.path.join(os.path.dirname(__file__), ".env")) as f:
    for line in f:
        if line.startswith("ADMIN_SETUP_CODE="):
            setup_code = line.strip().split("=", 1)[1]

r = register("admin", code=setup_code)
check("procurement hod admin register", r.status_code == 201, r.text[:300])
procurement_hod = r.json()
procurement_h = auth(procurement_hod)

r = register("admin", code=setup_code)
check("finance hod admin register", r.status_code == 201, r.text[:300])
finance_hod = r.json()
finance_h = auth(finance_hod)

r = register("farmer")
check("farmer register", r.status_code == 201, r.text[:300])
farmer = r.json()
farmer_h = auth(farmer)

r = register("buyer")
check("buyer register", r.status_code == 201, r.text[:300])
buyer = r.json()
buyer_h = auth(buyer)

r = register("processor")
check("processor register", r.status_code == 201, r.text[:300])
processor = r.json()
processor_h = auth(processor)

r = register("distributor")
check("distributor register", r.status_code == 201, r.text[:300])
distributor = r.json()
distributor_h = auth(distributor)

r = requests.post(f"{BASE}/admin/positions/hods/{procurement_hod['user']['id']}/promote", headers=main_h, json={"department": "Procurement"})
check("promote procurement HOD", r.status_code == 200, r.text[:300])

r = requests.post(f"{BASE}/admin/positions/hods/{finance_hod['user']['id']}/promote", headers=main_h, json={"department": "Finance"})
check("promote finance HOD", r.status_code == 200, r.text[:300])

# ============================================================
# Non-admin roles cannot touch Store admin endpoints
# ============================================================
r = requests.get(f"{BASE}/store/inventory", headers=farmer_h)
check("farmer blocked from /store/inventory", r.status_code == 403, r.text[:200])

r = requests.get(f"{BASE}/store/inventory", headers=distributor_h)
check("distributor blocked from /store/inventory", r.status_code == 403, r.text[:200])


def push_order_to_processing(crop, order_qty, farmer_qty, delivery="Lagos, Lagos State"):
    """Farmer declares/lists -> buyer orders -> payment confirmed -> procurement
    sources + assigns processor -> processor advances job to complete.
    Returns (order_id, order_item_id)."""
    requests.post(f"{BASE}/farmers/me/declarations", headers=farmer_h, json={
        "crop": crop, "quantity": farmer_qty + 100, "unit": "bags", "declarationYear": 2026,
    })
    r = requests.post(f"{BASE}/farmers/me/products", headers=farmer_h, json={
        "crop": crop, "quantity": farmer_qty, "unit": "bags", "address": "Luka Unit, Gboko",
    })
    check(f"farmer lists {farmer_qty} bags {crop}", r.status_code == 201, r.text[:300])
    product = r.json()["product"]

    r = requests.post(f"{BASE}/orders", headers=buyer_h, json={
        "items": [{"crop": crop, "quantity": order_qty, "unit": "bag"}],
        "deliveryLocation": delivery,
    })
    check(f"buyer places order for {order_qty} bags {crop}", r.status_code == 201, r.text[:300])
    order = r.json()["order"]
    order_id = order["id"]

    r = requests.post(f"{BASE}/orders/{order_id}/confirm-payment", headers=main_h)
    check("admin confirms payment", r.status_code == 200, r.text[:300])

    r = requests.post(f"{BASE}/procurement/orders/{order_id}/source", headers=main_h, json={
        "sourcing": [{"farmerId": farmer["user"]["id"], "productId": product["id"], "quantity": order_qty}],
        "notifiedRep": "Test rep",
    })
    check("procurement sources order from farmer listing", r.status_code == 200, r.text[:300])

    r = requests.post(f"{BASE}/procurement/orders/{order_id}/assign-processor", headers=main_h, json={
        "processorId": processor["user"]["id"],
    })
    check("procurement assigns processor", r.status_code == 200, r.text[:300])

    r = requests.get(f"{BASE}/processor/jobs/me", headers=processor_h)
    job = next(j for j in r.json()["jobs"] if j["order_id"] == order_id)
    r = requests.post(f"{BASE}/processor/jobs/{job['id']}/advance", headers=processor_h)
    check("processor job -> processing", r.status_code == 200 and r.json()["job"]["status"] == "processing", r.text[:300])
    r = requests.post(f"{BASE}/processor/jobs/{job['id']}/advance", headers=processor_h)
    check("processor job -> complete", r.status_code == 200 and r.json()["job"]["status"] == "complete", r.text[:300])

    return order_id


# ============================================================
# Order A: 60 bags Maize, pushed to processor-complete.
# Before receiving, it should appear in the allocation queue with an
# insufficient stock check and no audit yet.
# ============================================================
order_a = push_order_to_processing("Maize", order_qty=60, farmer_qty=60)

r = requests.get(f"{BASE}/store/queue", headers=main_h)
check("store queue reachable", r.status_code == 200, r.text[:300])
qorder = next((o for o in r.json()["orders"] if o["id"] == order_a), None)
check("order A appears in allocation queue", qorder is not None)
if qorder:
    check("stockCheck reports insufficient (nothing received yet)", qorder["stockCheck"]["sufficient"] is False, qorder["stockCheck"])
    check("audit is null before any audit decision", qorder["audit"] is None, qorder["audit"])

r = requests.post(f"{BASE}/store/orders/{order_a}/allocate", headers=main_h, json={"distributorId": distributor["user"]["id"]})
check("allocate blocked before any audit", r.status_code == 400, r.text[:300])

# ============================================================
# Receive order A's goods — but only 40 of the 60 ordered arrive
# (shrinkage). Store records the ACTUAL quantity received.
# ============================================================
r = requests.get(f"{BASE}/store/receiving-queue", headers=main_h)
check("receiving queue reachable", r.status_code == 200, r.text[:300])
recv_order = next(o for o in r.json()["orders"] if o["id"] == order_a)
item_a = recv_order["items"][0]
check("order A's item is 60 bags Maize as ordered", float(item_a["quantity"]) == 60.0 and item_a["crop"] == "Maize", item_a)

r = requests.post(f"{BASE}/store/orders/{order_a}/receive", headers=main_h, json={
    "items": [{"orderItemId": item_a["id"], "quantityReceived": 40}]
})
check("receive 40 of 60 bags maize (shrinkage)", r.status_code == 201, r.text[:300])

r = requests.post(f"{BASE}/store/orders/{order_a}/receive", headers=main_h, json={
    "items": [{"orderItemId": item_a["id"], "quantityReceived": 10}]
})
check("re-receiving the same order item is rejected", r.status_code == 400, r.text[:300])

r = requests.get(f"{BASE}/store/inventory", headers=main_h)
check("inventory list reachable", r.status_code == 200, r.text[:300])
maize_stock = next(s for s in r.json()["inventory"] if s["crop"] == "Maize")
check("pool now has 40 bags maize", float(maize_stock["quantity_on_hand"]) == 40.0, maize_stock)

# Order A needs 60 bags, pool only has 40 — audit should reflect insufficiency
r = requests.post(f"{BASE}/store/orders/{order_a}/audit", headers=main_h, json={"verified": False, "note": "Not enough stock yet"})
check("audit recorded as failed while stock insufficient", r.status_code == 200 and r.json()["audit"]["verified"] is False, r.text[:300])
check("audit response includes stock check breakdown", r.json()["stockCheck"]["sufficient"] is False, r.json())

r = requests.post(f"{BASE}/store/orders/{order_a}/allocate", headers=main_h, json={"distributorId": distributor["user"]["id"]})
check("allocate still blocked after a FAILED audit", r.status_code == 400, r.text[:300])

# ============================================================
# Order B: 20 bags Maize, fully received -> pool = 40 + 20 = 60,
# enough to re-audit and allocate Order A.
# ============================================================
order_b = push_order_to_processing("Maize", order_qty=20, farmer_qty=20)
r = requests.get(f"{BASE}/store/receiving-queue", headers=main_h)
recv_order_b = next(o for o in r.json()["orders"] if o["id"] == order_b)
item_b = recv_order_b["items"][0]
r = requests.post(f"{BASE}/store/orders/{order_b}/receive", headers=main_h, json={
    "items": [{"orderItemId": item_b["id"], "quantityReceived": 20}]
})
check("receive 20 bags maize for order B (pool -> 60)", r.status_code == 201, r.text[:300])

r = requests.get(f"{BASE}/store/inventory", headers=main_h)
maize_stock = next(s for s in r.json()["inventory"] if s["crop"] == "Maize")
check("pool now has 60 bags maize", float(maize_stock["quantity_on_hand"]) == 60.0, maize_stock)

r = requests.post(f"{BASE}/store/orders/{order_a}/audit", headers=main_h, json={"verified": True, "note": "Stock and quality confirmed"})
check("re-audit passes now stock is sufficient", r.status_code == 200 and r.json()["audit"]["verified"] is True, r.text[:300])

r = requests.post(f"{BASE}/store/orders/{order_a}/allocate", headers=main_h, json={})
check("allocate rejects missing distributorId", r.status_code == 400, r.text[:300])

# ============================================================
# Allocate order A for real: order -> allocated, pool deducted by 60,
# movement logged.
# ============================================================
r = requests.post(f"{BASE}/store/orders/{order_a}/allocate", headers=main_h, json={"distributorId": distributor["user"]["id"]})
check("allocate succeeds after passing audit", r.status_code == 200 and r.json()["order"]["status"] == "allocated", r.text[:300])

r = requests.get(f"{BASE}/store/inventory", headers=main_h)
maize_stock = next(s for s in r.json()["inventory"] if s["crop"] == "Maize")
check("pool deducted to 0 after allocating order A (60 - 60)", float(maize_stock["quantity_on_hand"]) == 0.0, maize_stock)

r = requests.get(f"{BASE}/store/movements", headers=main_h)
check("movement history reachable", r.status_code == 200, r.text[:300])
kinds = [(m["direction"], float(m["quantity"])) for m in r.json()["movements"] if m["crop"] == "Maize"]
check("movement ledger has both an 'in' and 'out' entry for maize", ("in", 40.0) in kinds and ("in", 20.0) in kinds and ("out", 60.0) in kinds, kinds)

r = requests.get(f"{BASE}/store/allocations/me", headers=distributor_h)
check("distributor sees allocation task", r.status_code == 200 and len(r.json()["allocations"]) == 1, r.text[:300])
alloc_id = r.json()["allocations"][0]["id"]
r = requests.post(f"{BASE}/store/allocations/{alloc_id}/confirm", headers=distributor_h)
check("distributor confirms allocation", r.status_code == 200 and r.json()["allocation"]["status"] == "confirmed", r.text[:300])

# ============================================================
# Insufficient-stock safety net: audit says verified=True (Store's own
# call) but pool secretly isn't enough by allocation time -- allocate
# must still refuse rather than deduct into the negative.
# ============================================================
order_c = push_order_to_processing("Maize", order_qty=25, farmer_qty=25, delivery="Abuja, FCT")
r = requests.post(f"{BASE}/store/orders/{order_c}/audit", headers=main_h, json={"verified": True, "note": "override"})
check("force-verified audit accepted (Store's call)", r.status_code == 200, r.text[:300])
r = requests.post(f"{BASE}/store/orders/{order_c}/allocate", headers=main_h, json={"distributorId": distributor["user"]["id"]})
check("allocate still refuses when actual stock is insufficient (safety net)", r.status_code == 400, r.text[:300])
r = requests.get(f"{BASE}/store/inventory", headers=main_h)
maize_untouched = next(s for s in r.json()["inventory"] if s["crop"] == "Maize")
check("failed allocate does not partially deduct stock (still 0)", float(maize_untouched["quantity_on_hand"]) == 0.0, maize_untouched)

# Receive order C's own goods (10 of the 25 ordered) and top up separately
# to prove the pool, not any one order's own receipt, is what gates allocate
r = requests.get(f"{BASE}/store/receiving-queue", headers=main_h)
recv_order_c = next(o for o in r.json()["orders"] if o["id"] == order_c)
item_c = recv_order_c["items"][0]
requests.post(f"{BASE}/store/orders/{order_c}/receive", headers=main_h, json={
    "items": [{"orderItemId": item_c["id"], "quantityReceived": 25}]
})
r = requests.post(f"{BASE}/store/orders/{order_c}/allocate", headers=main_h, json={"distributorId": distributor["user"]["id"]})
check("allocate succeeds after topping up stock to cover order C", r.status_code == 200, r.text[:300])

# ============================================================
# Low stock flag + reorder level editing
# ============================================================
r = requests.get(f"{BASE}/store/inventory", headers=main_h)
maize_row = next(s for s in r.json()["inventory"] if s["crop"] == "Maize")
check("maize now low (0 remaining < default reorder level 10)", maize_row["low"] is True and float(maize_row["quantity_on_hand"]) == 0.0, maize_row)

r = requests.patch(f"{BASE}/store/inventory/{maize_row['id']}/reorder-level", headers=main_h, json={"reorderLevel": 0})
check("reorder level can be edited", r.status_code == 200 and float(r.json()["stock"]["reorder_level"]) == 0.0, r.text[:300])
check("no longer flagged low once reorder level is at/below current stock", r.json()["stock"]["low"] is False, r.json())

r = requests.patch(f"{BASE}/store/inventory/{maize_row['id']}/reorder-level", headers=main_h, json={"reorderLevel": 10})
check("reorder level restored to 10", r.status_code == 200, r.text[:300])

# New crop entering the pool for the first time defaults to reorder_level=10
order_d = push_order_to_processing("Cassava", order_qty=2, farmer_qty=2)
r = requests.get(f"{BASE}/store/receiving-queue", headers=main_h)
recv_order_d = next(o for o in r.json()["orders"] if o["id"] == order_d)
item_d = recv_order_d["items"][0]
r = requests.post(f"{BASE}/store/orders/{order_d}/receive", headers=main_h, json={
    "items": [{"orderItemId": item_d["id"], "quantityReceived": 2}]
})
check("new inventory item (Cassava) created via receiving", r.status_code == 201, r.text[:300])
r = requests.get(f"{BASE}/store/inventory", headers=main_h)
cassava = next(s for s in r.json()["inventory"] if s["crop"] == "Cassava")
check("new item flagged low by default (2 < default 10)", cassava["low"] is True, cassava)

# Invalid receive inputs
r = requests.post(f"{BASE}/store/orders/{order_d}/receive", headers=main_h, json={"items": [{"orderItemId": item_d["id"], "quantityReceived": -5}]})
check("negative quantity receive rejected", r.status_code == 400, r.text[:300])
r = requests.post(f"{BASE}/store/orders/{order_d}/receive", headers=main_h, json={"items": []})
check("empty items array rejected", r.status_code == 400, r.text[:300])

# ============================================================
# Restock request workflow for low stock: Store -> Procurement HOD ->
# Finance HOD -> Admin final approval, via the dedicated endpoint that
# wraps the generic Requests approval system.
# ============================================================
r = requests.post(f"{BASE}/store/restock-requests", headers=main_h, json={
    "crop": "Maize", "quantity": 100, "unit": "bags", "note": "Stock on hand is low, requesting a fresh purchase.",
})
check("store raises restock purchase request", r.status_code == 201, r.text[:300])
restock_req = r.json()["request"]

r = requests.get(f"{BASE}/requests/{restock_req['id']}", headers=main_h)
detail = r.json()["request"]
check("request has 3 steps in order", [s["label"] for s in detail["steps"]] == ["Procurement", "Finance", "Admin final approval"], detail["steps"])
check("request status pending", detail["status"] == "pending")

r = requests.get(f"{BASE}/requests/awaiting-me", headers=procurement_h)
check("procurement HOD sees it awaiting their approval", any(x["id"] == restock_req["id"] for x in r.json()["requests"]), r.text[:300])

r = requests.get(f"{BASE}/requests/awaiting-me", headers=finance_h)
check("finance HOD does NOT yet see it (step 1 not done)", not any(x["id"] == restock_req["id"] for x in r.json()["requests"]), r.text[:300])

step1 = detail["steps"][0]
r = requests.post(f"{BASE}/requests/{restock_req['id']}/steps/{step1['id']}/decide", headers=procurement_h, json={"decision": "approved", "note": "Looks right"})
check("procurement HOD approves step 1", r.status_code == 200, r.text[:300])

r = requests.get(f"{BASE}/requests/awaiting-me", headers=finance_h)
check("finance HOD now sees it awaiting their approval", any(x["id"] == restock_req["id"] for x in r.json()["requests"]), r.text[:300])

detail = requests.get(f"{BASE}/requests/{restock_req['id']}", headers=main_h).json()["request"]
step2 = detail["steps"][1]
r = requests.post(f"{BASE}/requests/{restock_req['id']}/steps/{step2['id']}/decide", headers=finance_h, json={"decision": "approved"})
check("finance HOD approves step 2", r.status_code == 200, r.text[:300])

detail = requests.get(f"{BASE}/requests/{restock_req['id']}", headers=main_h).json()["request"]
step3 = detail["steps"][2]
check("final step open to any admin (approver_id null)", step3["approver_id"] is None, step3)
r = requests.post(f"{BASE}/requests/{restock_req['id']}/steps/{step3['id']}/decide", headers=main_h, json={"decision": "approved", "note": "Approved for procurement to process"})
check("admin gives final approval", r.status_code == 200 and r.json()["request"]["status"] == "approved", r.text[:300])

# Wrong-order decision attempt should fail (procurement HOD trying to
# re-decide an already-approved step 1)
r = requests.post(f"{BASE}/requests/{restock_req['id']}/steps/{step1['id']}/decide", headers=procurement_h, json={"decision": "approved"})
check("cannot decide an already-approved request", r.status_code == 400, r.text[:300])

# Restock request missing required fields is rejected
r = requests.post(f"{BASE}/store/restock-requests", headers=main_h, json={"crop": "Maize"})
check("restock request missing quantity/unit rejected", r.status_code == 400, r.text[:300])

print()
print(f"{'ALL PASSED' if not fails else f'{len(fails)} FAILED'}")
if fails:
    print("Failures:", fails)
    sys.exit(1)
