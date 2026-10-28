"""
Corps batches, certificates, emails and NYSC export — API tests.

Run against a LIVE backend on a TEST database (never production), with the
email delay shortened and no SMTP so emails are only logged:

    cd backend && npm run migrate && npm run seed:admin -- --email admin@ephaag.test --password Admin1234
    SMTP_HOST= CERT_EMAIL_DELAY_MS=50 npm run dev        # terminal 1
    python3 corps_certificates_test.py                   # terminal 2

Needs `psql` reachable with DATABASE_URL-style env (PGURL below) to peek at the
verification codes and set up a couple of edge cases.
"""
import io
import os
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import requests

BASE = "http://localhost:4000/api"
PGURL = os.environ.get("PGURL", "postgresql://postgres:postgres@localhost:5432/ephaag_farms")
RUN = uuid.uuid4().hex[:6]
fails = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  {detail}"))
    if not cond:
        fails.append(name)


def sql(q):
    out = subprocess.run(["psql", PGURL, "-At", "-F", "|", "-c", q], capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr)
    return [l.split("|") for l in out.stdout.strip().splitlines() if l]


def H(u):
    return {"Authorization": f"Bearer {u['token']}"}


def call(method, path, user=None, **kw):
    return requests.request(method, f"{BASE}{path}", headers=H(user) if user else {}, **kw)


admin = requests.post(f"{BASE}/auth/login", json={"email": "admin@ephaag.test", "password": "Admin1234"}).json()
check("admin login", "token" in admin)
check("admin sets fee", call("PUT", "/rtc/admin/corps/fee", admin, json={"amount": 5000}).status_code == 200)

counter = [0]


def new_corper(label, year=2026, batch="B", stream="II", consent=True):
    counter[0] += 1
    n = counter[0]
    body = {
        "name": f"Corper {label} {RUN}", "email": f"{label}.{RUN}@test.com", "password": "Passw0rd1", "role_type": "corper",
        "phone": f"080{RUN[:3].upper() if False else ''}{int(time.time()*1000)%100000000:08d}"[:11].replace("0", "0"),
        "sex": "female", "callUpNumber": f"NYSC/{RUN}/{n}", "stateCode": f"PL/{n:02d}B/{RUN.upper()}",
        "serviceYear": year, "batch": batch, "stream": stream, "stateOfDeployment": "Plateau", "ppa": "Test PPA",
        "discipline": "Agriculture", "consentTerms": True, "consentData": consent,
    }
    body["phone"] = "0803" + str(n).zfill(3) + RUN_DIGITS
    r = requests.post(f"{BASE}/auth/register", json=body)
    assert r.status_code == 201, r.text[:300]
    u = r.json()
    u["label"] = label
    return u


RUN_DIGITS = str(int(RUN, 16) % 10000).zfill(4)


def pay(c):
    r = call("POST", "/corpers/payments/initiate", c, json={"acceptNonRefundable": True})
    assert r.status_code in (200, 201), r.text[:200]
    pid = r.json()["payment"]["id"]
    assert call("POST", f"/rtc/admin/corps/payments/{pid}/confirm", admin, json={}).status_code == 200


def make_course(title):
    r = call("POST", "/rtc/admin/courses", admin, json={"title": f"{title} {RUN}", "description": "t", "audience": "corps"})
    cid = r.json()["course"]["id"]
    lid = call("POST", f"/rtc/admin/courses/{cid}/lessons", admin, json={"title": "L1", "kind": "video", "url": "https://example.com/v"}).json()["lesson"]["id"]
    call("POST", f"/rtc/admin/courses/{cid}/questions", admin, json={"prompt": "Q?", "explanation": "E",
         "options": [{"text": "RIGHT", "isCorrect": True}, {"text": "WRONG"}]})
    r = call("POST", f"/rtc/admin/courses/{cid}/approve", admin, json={})
    if r.status_code == 409:
        r = call("POST", f"/rtc/admin/courses/{cid}/approve", admin, json={"confirmImpact": True})
    assert r.status_code == 200, r.text[:200]
    return {"id": cid, "lesson": lid}


def finish(c, course):
    r = call("POST", f"/corpers/courses/{course['id']}/lessons/{course['lesson']}/complete", c, json={})
    assert r.status_code == 200, r.text[:200]
    q = call("GET", f"/corpers/courses/{course['id']}/quiz", c).json()
    ans = []
    for qu in q["questions"]:
        opt = next(o for o in qu["options"] if o["text"] == "RIGHT")
        ans.append({"questionId": qu["id"], "optionId": opt["id"]})
    r = call("POST", f"/corpers/courses/{course['id']}/quiz/attempts", c, json={"answers": ans})
    assert r.status_code in (200, 201), r.text[:200]


def cert_row(c):
    rows = sql(f"select number, verification_code, visible, notify_status, revision, holder_name from corper_certificates where user_id='{c['user']['id']}'")
    return rows[0] if rows else None


# ----------------------------------------------------------- consent rule
r = requests.post(f"{BASE}/auth/register", json={
    "name": "No Consent", "email": f"nc.{RUN}@test.com", "password": "Passw0rd1", "role_type": "corper", "phone": "08031112222", "sex": "male",
    "callUpNumber": f"NYSC/x/{RUN}", "stateCode": f"PL/99B/X{RUN.upper()}", "serviceYear": 2026, "batch": "B", "stream": "II",
    "stateOfDeployment": "Plateau", "ppa": "p", "discipline": "d", "consentTerms": True})
check("register without NYSC consent -> 400", r.status_code == 400 and "NYSC" in r.text, r.text[:200])
r = requests.post(f"{BASE}/auth/register", json={
    "name": "No Consent", "email": f"nc2.{RUN}@test.com", "password": "Passw0rd1", "role_type": "corper", "phone": "08031112223", "sex": "male",
    "callUpNumber": f"NYSC/y/{RUN}", "stateCode": f"PL/98B/Y{RUN.upper()}", "serviceYear": 2026, "batch": "B", "stream": "II",
    "stateOfDeployment": "Plateau", "ppa": "p", "discipline": "d", "consentTerms": True, "consentData": False})
check("register with consent=false -> 400", r.status_code == 400, r.text[:200])

# ----------------------------------------------------------- setup batch B/II
course = make_course("Core")
m1, m2, m3 = new_corper("m1"), new_corper("m2"), new_corper("m3")
m4 = new_corper("m4", batch="C", stream="I")  # another batch
for m in (m1, m2, m3, m4):
    m["user"] = m["user"]
    pay(m)
r = call("PUT", "/corpers/me/profile/documents", m1, json={"consentData": False})
check("profile: un-ticking NYSC consent refused", r.status_code == 400, r.text[:200])
r = call("PUT", "/corpers/me/profile/documents", m1, json={"consentMedia": True})
check("profile: leaving consent out keeps it", r.status_code == 200 and r.json()["profile"]["consentData"] is True, r.text[:200])

# status before finishing
s = call("GET", "/corpers/certificate", m3).json()
check("not finished: status not_completed", s["status"] == "not_completed" and s["progress"]["done"] == 0, str(s))
check("not finished: no certificate row", cert_row(m3) is None)
check("not finished: download 404", call("GET", "/corpers/certificate/download", m3).status_code == 404)

finish(m1, course)
finish(m2, course)
finish(m4, course)
a, b = cert_row(m1), cert_row(m2)
check("certificate created automatically when all courses done", a is not None and b is not None)
check("certificate number format + unique", a[0].startswith("EPH-NYSC-") and a[0] != b[0], f"{a[0]} {b[0]}")
check("verification code is long", len(a[1]) >= 24, a[1])
check("certificate is hidden", a[2] == "f")
check("m3 (not finished) still has none", cert_row(m3) is None)
s = call("GET", "/corpers/certificate", m1).json()
check("finished, batch open: awaiting_batch", s["status"] == "awaiting_batch" and "certificate" not in s, str(s))
check("hidden: download 404", call("GET", "/corpers/certificate/download", m1).status_code == 404)
check("hidden: verify page 404", requests.get(f"{BASE}/certificates/verify/{a[1]}").status_code == 404)
check("no emails sent yet", a[3] == "pending")

# ----------------------------------------------------------- batch rules
bl = call("GET", "/rtc/admin/corps/batches", admin)
check("admin lists batches", bl.status_code == 200, bl.text[:200])
batches = bl.json()["batches"]
bB = next(b for b in batches if b["batch"] == "B" and b["stream"] == "II" and b["serviceYear"] == 2026)
bC = next(b for b in batches if b["batch"] == "C" and b["stream"] == "I" and b["serviceYear"] == 2026)
check("batch shows members/finished counts", bB["members"] == 3 and bB["finished"] == 2 and bB["paid"] == 3, str(bB))
check("batch shows hidden certificates", bB["certificates"] == {"total": 2, "released": 0}, str(bB["certificates"]))
check("non-admin cannot list batches", call("GET", "/rtc/admin/corps/batches", m1).status_code == 403)
check("no auth -> 401", requests.get(f"{BASE}/rtc/admin/corps/batches").status_code == 401)
r = call("POST", f"/rtc/admin/corps/batches/{bB['id']}/complete", admin, json={})
check("complete without due date -> 400", r.status_code == 400 and r.json().get("code") == "DUE_DATE_REQUIRED", r.text[:200])
tomorrow = (date.today() + timedelta(days=2)).isoformat()
yesterday = (date.today() - timedelta(days=2)).isoformat()
check("bad due date rejected", call("PUT", f"/rtc/admin/corps/batches/{bB['id']}", admin, json={"dueDate": "soon"}).status_code == 400)
check("set future due date", call("PUT", f"/rtc/admin/corps/batches/{bB['id']}", admin, json={"dueDate": tomorrow}).status_code == 200)
r = call("POST", f"/rtc/admin/corps/batches/{bB['id']}/complete", admin, json={})
check("complete before due date -> 400", r.status_code == 400 and r.json().get("code") == "BEFORE_DUE_DATE", r.text[:200])
check("nothing released by the failed attempt", cert_row(m1)[2] == "f")
check("non-admin cannot close a batch", call("POST", f"/rtc/admin/corps/batches/{bB['id']}/complete", m1, json={}).status_code == 403)
check("set past due date", call("PUT", f"/rtc/admin/corps/batches/{bB['id']}", admin, json={"dueDate": yesterday}).status_code == 200)
r = call("POST", f"/rtc/admin/corps/batches/{bB['id']}/complete", admin, json={})
check("mark batch complete", r.status_code == 200 and r.json()["released"] == 2, r.text[:200])
check("second complete -> 409", call("POST", f"/rtc/admin/corps/batches/{bB['id']}/complete", admin, json={}).status_code == 409)

# ----------------------------------------------------------- visible, pdf, verify
a, b = cert_row(m1), cert_row(m2)
check("certificates now visible", a[2] == "t" and b[2] == "t")
check("other batch untouched", cert_row(m4)[2] == "f")
s = call("GET", "/corpers/certificate", m1).json()
check("member sees ready + details", s["status"] == "ready" and s["certificate"]["number"] == a[0] and s["certificate"]["stateCode"], str(s))
r = call("GET", "/corpers/certificate/download", m1)
check("PDF downloads", r.status_code == 200 and r.headers["Content-Type"].startswith("application/pdf") and r.content[:4] == b"%PDF" and len(r.content) > 3000, str(r.status_code))
r2 = call("GET", "/corpers/certificate/download", m1)
check("PDF is same size on repeat (deterministic layout)", abs(len(r2.content) - len(r.content)) < 200)
check("m3 download still 404", call("GET", "/corpers/certificate/download", m3).status_code == 404)
v = requests.get(f"{BASE}/certificates/verify/{a[1]}")
vj = v.json()
check("verify page: valid, only name/batch/issueDate", v.status_code == 200 and vj["valid"] is True and set(vj) == {"valid", "name", "batch", "issueDate"}, str(vj))
check("verify shows the name and batch", m1["user"]["name"] in vj["name"] and "Batch B" in vj["batch"], str(vj))
check("verify accepts dashes + lower-case", requests.get(f"{BASE}/certificates/verify/{'-'.join(a[1][i:i+4] for i in range(0,24,4)).lower()}").status_code == 200)
check("verify: unknown code 404", requests.get(f"{BASE}/certificates/verify/{'A'*24}").status_code == 404)
check("verify: junk code 404", requests.get(f"{BASE}/certificates/verify/xx").status_code == 404)

# ----------------------------------------------------------- emails
time.sleep(1.5)
a, b = cert_row(m1), cert_row(m2)
check("emails recorded (no SMTP -> not_configured)", a[3] == "not_configured" and b[3] == "not_configured", f"{a[3]} {b[3]}")
check("m3 got no email record", cert_row(m3) is None)
bl = call("GET", "/rtc/admin/corps/batches", admin).json()["batches"]
bB = next(x for x in bl if x["id"] == bB["id"])
check("batch shows unsent emails", bB["emails"]["unsent"] == 2 and bB["emails"]["sent"] == 0, str(bB["emails"]))
sql(f"update corper_certificates set notify_status='failed', notify_error='boom' where user_id='{m1['user']['id']}'")
sql(f"update corper_certificates set notify_status='sent' where user_id='{m2['user']['id']}'")
r = call("POST", f"/rtc/admin/corps/batches/{bB['id']}/resend-emails", admin, json={})
check("resend queues only the unsent one", r.status_code == 200 and r.json()["queued"] == 1, r.text[:200])
time.sleep(1.0)
check("failed one retried (attempt counted)", cert_row(m1)[3] == "not_configured")
check("already-sent one not re-sent", cert_row(m2)[3] == "sent")
check("resend on an open batch -> 409", call("POST", f"/rtc/admin/corps/batches/{bC['id']}/resend-emails", admin, json={}).status_code == 409)

# ----------------------------------------------------------- late finisher
m5 = new_corper("m5")
pay(m5)
finish(m5, course)
c5 = cert_row(m5)
check("finishing after the batch closed: visible at once", c5 is not None and c5[2] == "t", str(c5))
time.sleep(0.5)
check("…and emailed at once", cert_row(m5)[3] in ("not_configured", "sent"), str(cert_row(m5)))
check("…and downloadable", call("GET", "/corpers/certificate/download", m5).status_code == 200)

# ----------------------------------------------------------- un-mark
r = call("POST", f"/rtc/admin/corps/batches/{bB['id']}/uncomplete", admin, json={"reason": "closed by mistake"})
check("un-mark batch", r.status_code == 200 and r.json()["hidden"] == 3, r.text[:200])
check("certificates hidden again", cert_row(m1)[2] == "f" and cert_row(m5)[2] == "f")
check("member sees awaiting_batch again", call("GET", "/corpers/certificate", m1).json()["status"] == "awaiting_batch")
check("download 404 again", call("GET", "/corpers/certificate/download", m1).status_code == 404)
check("verify 404 again", requests.get(f"{BASE}/certificates/verify/{cert_row(m1)[1]}").status_code == 404)
bl = call("GET", "/rtc/admin/corps/batches", admin).json()["batches"]
ev = next(x for x in bl if x["id"] == bB["id"])["events"]
check("un-mark is logged with who/when/why", any(e["action"] == "unmarked" and "closed by mistake" in (e["note"] or "") and e["by"] for e in ev), str(ev))
check("un-mark twice -> 409", call("POST", f"/rtc/admin/corps/batches/{bB['id']}/uncomplete", admin, json={}).status_code == 409)
call("POST", f"/rtc/admin/corps/batches/{bB['id']}/complete", admin, json={})
check("re-mark releases again", cert_row(m1)[2] == "t")
check("same certificate number after re-release", cert_row(m1)[0] == a[0])

# ----------------------------------------------------------- reissue (name fix)
sql(f"update users set name='Corrected Name {RUN}' where id='{m1['user']['id']}'")
check("before reissue the certificate keeps the old name", cert_row(m1)[5] != f"Corrected Name {RUN}")
r = call("POST", f"/rtc/admin/corps/members/{m1['user']['id']}/certificate/reissue", admin, json={})
check("reissue keeps number, bumps revision", r.status_code == 200 and r.json()["number"] == a[0] and r.json()["revision"] == 2, r.text[:200])
check("reissued name is on the certificate", cert_row(m1)[5] == f"Corrected Name {RUN}" and cert_row(m1)[1] == a[1])
check("verify shows corrected name", requests.get(f"{BASE}/certificates/verify/{a[1]}").json()["name"] == f"Corrected Name {RUN}")
check("reissue: member without certificate 404", call("POST", f"/rtc/admin/corps/members/{m3['user']['id']}/certificate/reissue", admin, json={}).status_code == 404)
check("reissue: non-admin 403", call("POST", f"/rtc/admin/corps/members/{m1['user']['id']}/certificate/reissue", m1, json={}).status_code == 403)

# ----------------------------------------------------------- simultaneous issue
batchA = [new_corper(f"p{i}", batch="A", stream="I") for i in range(12)]
with ThreadPoolExecutor(12) as ex:
    list(ex.map(pay, batchA))
with ThreadPoolExecutor(12) as ex:
    list(ex.map(lambda c: finish(c, course), batchA))
nums = [cert_row(c)[0] for c in batchA]
codes = [cert_row(c)[1] for c in batchA]
check("12 simultaneous completions: 12 certificates", all(nums))
check("…all numbers unique", len(set(nums)) == 12, str(nums))
check("…all codes unique", len(set(codes)) == 12)
# same member finishing twice at the same time -> still one certificate
rows = sql(f"select count(*) from corper_certificates where user_id='{batchA[0]['user']['id']}'")
check("one certificate per member", rows[0][0] == "1")

# ----------------------------------------------------------- members table
sql(f"update corper_profiles set consent_data=false where user_id='{m3['user']['id']}'")
r = call("GET", "/rtc/admin/corps/members?limit=200", admin)
mem = r.json()
check("members table loads", r.status_code == 200 and mem["total"] >= 17, str(mem["total"]))
row1 = next(x for x in mem["members"] if x["userId"] == m1["user"]["id"])
check("row: paid, 1 of 1, completed, released cert", row1["paid"] and row1["coursesCompleted"] == 1 and row1["completed"] and row1["certificateStatus"] == "released" and row1["certificateNumber"] == a[0], str(row1))
f = lambda q: call("GET", "/rtc/admin/corps/members?limit=200&" + q, admin).json()
check("filter batch=C", {x["batch"] for x in f("batch=C")["members"]} == {"C"})
check("filter batch=B & stream=II & year", f("batch=B&stream=II&year=2026")["total"] == 4)
check("filter completed=no includes m3", any(x["userId"] == m3["user"]["id"] for x in f("batch=B&completed=no")["members"]))
check("filter completed=yes excludes m3", all(x["userId"] != m3["user"]["id"] for x in f("batch=B&completed=yes")["members"]))
check("filter state", f("state=plateau")["total"] == mem["total"] and f("state=Lagos")["total"] == 0)
check("filter consent=no finds m3 only", [x["userId"] for x in f("consent=no")["members"]] == [m3["user"]["id"]])
check("search by name", f(f"q=m2 {RUN}".replace(" ", "%20"))["total"] == 1)
check("search by certificate number", f(f"q={a[0]}")["total"] == 1)
check("filter paid=no is empty (all paid)", f("batch=B&paid=no")["total"] == 0)
check("pagination", len(call("GET", "/rtc/admin/corps/members?limit=5&offset=0", admin).json()["members"]) == 5)
check("members: non-admin 403", call("GET", "/rtc/admin/corps/members", m1).status_code == 403)

# ----------------------------------------------------------- export
r = call("GET", "/rtc/admin/corps/members/export?batch=B&stream=II", admin)
check("export is a spreadsheet", r.status_code == 200 and "spreadsheetml" in r.headers["Content-Type"] and r.content[:2] == b"PK", str(r.status_code))
import openpyxl
wb = openpyxl.load_workbook(io.BytesIO(r.content))
ws = wb.active
hdr = [c.value for c in ws[1]]
want = ["Name", "Gender", "Email", "Phone", "Call-up number", "State code", "Batch", "Stream", "State of deployment", "PPA", "Discipline", "Paid", "Courses completed", "Completion date", "Certificate number"]
check("export has every requested column", all(w in hdr for w in want), str(hdr))
check("export has a consent column", "Consent to share with NYSC" in hdr)
rows = [dict(zip(hdr, [c.value for c in row])) for row in ws.iter_rows(min_row=2)]
names = [x["Name"] for x in rows]
check("export: non-consenting m3 left out by default", f"Corper m3 {RUN}" not in names and f"Corper m2 {RUN}" in names, str(names))
check("export: consent column says Yes for all", all(x["Consent to share with NYSC"] == "Yes" for x in rows))
x2 = next(x for x in rows if x["Name"] == f"Corper m2 {RUN}")
check("export: values", x2["Paid"] == "Yes" and x2["Courses completed"] == "1 of 1" and x2["Gender"] == "Female" and x2["State of deployment"] == "Plateau" and x2["Certificate number"] == b[0] and x2["Completion date"], str(x2))
check("export: phone keeps its leading zero", str(x2["Phone"]).startswith("0"), str(x2["Phone"]))
r = call("GET", "/rtc/admin/corps/members/export?batch=B&stream=II&includeNoConsent=true", admin)
rows = [dict(zip(hdr, [c.value for c in row])) for row in openpyxl.load_workbook(io.BytesIO(r.content)).active.iter_rows(min_row=2)]
x3 = next((x for x in rows if x["Name"] == f"Corper m3 {RUN}"), None)
check("export with includeNoConsent lists m3 with consent=No, blank certificate", x3 and x3["Consent to share with NYSC"] == "No" and not x3["Certificate number"] and x3["Courses completed"] == "0 of 1" and x3["Paid"] == "Yes", str(x3))
check("export: non-admin 403", call("GET", "/rtc/admin/corps/members/export", m1).status_code == 403)
sql(f"update corper_certificates set visible=false where user_id='{m2['user']['id']}'")
rows = [dict(zip(hdr, [c.value for c in row])) for row in openpyxl.load_workbook(io.BytesIO(call("GET", "/rtc/admin/corps/members/export?batch=B&stream=II", admin).content)).active.iter_rows(min_row=2)]
check("export: hidden certificate number is not exported", not next(x for x in rows if x["Name"] == f"Corper m2 {RUN}")["Certificate number"])
sql(f"update corper_certificates set visible=true where user_id='{m2['user']['id']}'")

# ----------------------------------------------------------- refunds / permissions
farmer = requests.post(f"{BASE}/auth/register", json={"name": "Farmer", "email": f"f.{RUN}@test.com", "password": "Passw0rd1", "role_type": "farmer", "sex": "male", "phone": "08039990000", "state": "Plateau", "lga": "Jos North"}).json()
check("farmer cannot read corps certificate", call("GET", "/corpers/certificate", farmer).status_code == 403)
check("no auth: certificate -> 401", requests.get(f"{BASE}/corpers/certificate").status_code == 401)
check("admin cannot use member certificate route", call("GET", "/corpers/certificate", admin).status_code == 403)
hits = [requests.get(f"{BASE}/certificates/verify/{'B'*24}").status_code for _ in range(35)]
check("verify endpoint is rate limited", 429 in hits, str(set(hits)))

print()
print("FAILED:" if fails else "ALL PASSED", fails if fails else "")
sys.exit(1 if fails else 0)
