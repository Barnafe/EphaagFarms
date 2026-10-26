"""
Phase 4 (corps learning, quizzes, progress) — API tests.

Run against a LIVE backend on a TEST database (never production):

    cd backend && npm run migrate && npm run dev        # terminal 1
    python3 corps_learning_test.py                       # terminal 2

Needs the seeded test admin (admin@ephaag.test / Admin1234), same as the other
*_test.py files here. Cleanest on a fresh database; on one that already has live
corps courses the percentage maths is still checked, against the live total the
API itself reports.

The pure rules (grading, percentage, locks) are also covered, without a
database, by:  node --test test/corperLearning.test.mjs
"""
import json
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests

BASE = "http://localhost:4000/api"
fails = []
RUN = uuid.uuid4().hex[:8]


def check(name, cond, detail=""):
    if cond:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name} {detail}")
        fails.append(name)


def H(u):
    return {"Authorization": f"Bearer {u['token']}"}


def call(method, path, user=None, **kw):
    headers = H(user) if user else {}
    return requests.request(method, f"{BASE}{path}", headers=headers, **kw)


# ---------------------------------------------------------------- setup
r = requests.post(f"{BASE}/auth/login", json={"email": "admin@ephaag.test", "password": "Admin1234"})
check("admin login", r.status_code == 200, r.text[:200])
admin = r.json()

r = call("PUT", "/rtc/admin/corps/fee", admin, json={"amount": 5000})
check("admin sets the access fee", r.status_code == 200, r.text[:200])

_state_counter = [0]


def phone(n):
    # unique 11-digit Nigerian-style number per run + counter
    return "080" + str(int(time.time() * 1000))[-6:] + f"{n:02d}"


def new_corper(label):
    _state_counter[0] += 1
    n = _state_counter[0]
    body = {
        "name": f"Corper {label}", "email": f"c{label}.{RUN}@test.com", "password": "Passw0rd1",
        "role_type": "corper", "sex": "male", "phone": phone(n),
        "callUpNumber": f"NYSC/{RUN}/{n}", "stateCode": f"PL/26B/{RUN[:4].upper()}{n:02d}",
        "serviceYear": 2026, "batch": "B", "stream": "II", "stateOfDeployment": "Plateau",
        "ppa": "Test PPA", "discipline": "Agriculture", "consentTerms": True, "consentData": True,
    }
    r = requests.post(f"{BASE}/auth/register", json=body)
    assert r.status_code == 201, r.text[:300]
    return r.json()


def pay(corper):
    r = call("POST", "/corpers/payments/initiate", corper, json={})
    assert r.status_code in (200, 201), r.text[:200]
    pid = r.json()["payment"]["id"]
    r = call("POST", f"/rtc/admin/corps/payments/{pid}/confirm", admin, json={})
    assert r.status_code == 200, r.text[:200]
    return pid


def make_course(title, lessons=2, questions=3, live_future=False, approve=True):
    """Creates a corps course with `lessons` video lessons (plus one future live
    session when live_future) and `questions` quiz questions whose correct
    option text is always 'RIGHT'."""
    r = call("POST", "/rtc/admin/courses", admin, json={"title": f"{title} {RUN}", "description": "test", "audience": "corps"})
    assert r.status_code == 201, r.text[:200]
    cid = r.json()["course"]["id"]
    lesson_ids = []
    for i in range(lessons):
        r = call("POST", f"/rtc/admin/courses/{cid}/lessons", admin,
                 json={"title": f"Lesson {i + 1}", "kind": "video", "url": "https://example.com/v"})
        assert r.status_code == 201, r.text[:200]
        lesson_ids.append(r.json()["lesson"]["id"])
    live_id = None
    if live_future:
        when = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 7 * 86400))
        r = call("POST", f"/rtc/admin/courses/{cid}/lessons", admin,
                 json={"title": "Live Q&A", "kind": "live", "url": "https://example.com/live", "scheduledAt": when})
        assert r.status_code == 201, r.text[:200]
        live_id = r.json()["lesson"]["id"]
    qids = []
    for i in range(questions):
        r = call("POST", f"/rtc/admin/courses/{cid}/questions", admin, json={
            "prompt": f"Question {i + 1}?", "explanation": f"Explanation {i + 1}",
            "options": [{"text": "RIGHT", "isCorrect": True}, {"text": "WRONG a"}, {"text": "WRONG b"}, {"text": "WRONG c"}],
        })
        assert r.status_code == 201, r.text[:200]
        qids.append(r.json()["question"]["id"])
    if approve:
        r = call("POST", f"/rtc/admin/courses/{cid}/approve", admin, json={})
        if r.status_code == 409 and r.json().get("code") == "APPROVAL_IMPACT":
            r = call("POST", f"/rtc/admin/courses/{cid}/approve", admin, json={"confirmImpact": True})
        assert r.status_code == 200, r.text[:200]
    return {"id": cid, "lessons": lesson_ids, "live": live_id, "questions": qids}


def finish_lessons(corper, course):
    for lid in course["lessons"]:
        r = call("POST", f"/corpers/courses/{course['id']}/lessons/{lid}/complete", corper, json={})
        assert r.status_code == 200, r.text[:200]


def answers_from(quiz, pick_right=True):
    out = []
    for q in quiz["questions"]:
        want = "RIGHT" if pick_right else "WRONG a"
        opt = next(o for o in q["options"] if o["text"] == want)
        out.append({"questionId": q["id"], "optionId": opt["id"]})
    return out


def submit(corper, course, answers, **extra):
    return call("POST", f"/corpers/courses/{course['id']}/quiz/attempts", corper, json={"answers": answers, **extra})


def overall(corper):
    return call("GET", "/corpers/courses", corper).json()["overall"]


def expected_percent(done, total):
    return 0 if total <= 0 else max(0, min(100, round(100 * done / total)))


# ================================================================ 1. the payment gate
c1 = new_corper("gate")
course_a = make_course("Gate course A")

gated = [
    ("GET", "/corpers/courses"), ("GET", "/corpers/progress"),
    ("GET", f"/corpers/courses/{course_a['id']}"),
    ("POST", f"/corpers/courses/{course_a['id']}/lessons/{course_a['lessons'][0]}/complete"),
    ("GET", f"/corpers/courses/{course_a['id']}/lessons/{course_a['lessons'][0]}/file"),
    ("GET", f"/corpers/courses/{course_a['id']}/quiz"),
    ("POST", f"/corpers/courses/{course_a['id']}/quiz/attempts"),
    ("GET", f"/corpers/courses/{course_a['id']}/quiz/attempts"),
]
for method, path in gated:
    r = call(method, path, c1, json={} if method == "POST" else None)
    check(f"UNPAID {method} {path.split('/corpers')[1]} -> 402", r.status_code == 402 and r.json().get("code") == "PAYMENT_REQUIRED", f"{r.status_code} {r.text[:120]}")

pid = pay(c1)
r = call("GET", "/corpers/courses", c1)
check("PAID: course list opens", r.status_code == 200, r.text[:200])

# do some real work, then get refunded -> locked, progress kept, comes back on re-pay
finish_lessons(c1, course_a)
r = call("POST", f"/rtc/admin/corps/payments/{pid}/refund", admin, json={"reason": "test refund"})
check("admin refunds", r.status_code == 200, r.text[:200])
for method, path in gated[:3]:
    r = call(method, path, c1, json={} if method == "POST" else None)
    check(f"REFUNDED {method} {path.split('/corpers')[1]} -> 402", r.status_code == 402, str(r.status_code))
pay(c1)  # pays again
r = call("GET", f"/corpers/courses/{course_a['id']}", c1)
check("re-paid: old lesson progress is back", r.status_code == 200 and r.json()["progress"]["lessonsDone"] == len(course_a["lessons"]), r.text[:200])

# ================================================================ 2. no answer leakage
r = call("GET", f"/corpers/courses/{course_a['id']}", c1)
check("course detail has no quiz answers", not any(k in r.text for k in ("isCorrect", "is_correct", "correct_text")), r.text[:200])
r = call("GET", f"/corpers/courses/{course_a['id']}/quiz", c1)
check("quiz served (lessons done)", r.status_code == 200, r.text[:200])
text = r.text
check("quiz response leaks no correct flag / explanation", not any(k in text for k in ("isCorrect", "is_correct", "Explanation")), text[:300])
quiz = r.json()
check("quiz has every question, 4 options each", len(quiz["questions"]) == 3 and all(len(q["options"]) == 4 for q in quiz["questions"]))
orders = set()
for _ in range(8):
    q = call("GET", f"/corpers/courses/{course_a['id']}/quiz", c1).json()
    orders.add(tuple(x["id"] for x in q["questions"]))
check("question order is shuffled between loads", len(orders) > 1, str(len(orders)))

# ================================================================ 3. lessons-before-quiz lock
c2 = new_corper("lock"); pay(c2)
course_b = make_course("Lock course B", lessons=3)
r = call("GET", f"/corpers/courses/{course_b['id']}/quiz", c2)
check("quiz locked before lessons -> 403 QUIZ_LOCKED", r.status_code == 403 and r.json().get("code") == "QUIZ_LOCKED", f"{r.status_code} {r.text[:150]}")
r = submit(c2, course_b, [{"questionId": course_b["questions"][0], "optionId": str(uuid.uuid4())}])
check("submitting before lessons -> 403", r.status_code == 403, f"{r.status_code} {r.text[:150]}")
call("POST", f"/corpers/courses/{course_b['id']}/lessons/{course_b['lessons'][0]}/complete", c2, json={})
detail = call("GET", f"/corpers/courses/{course_b['id']}", c2).json()
check("detail says quiz locked with a reason", detail["quiz"]["locked"] and "lesson" in detail["quiz"]["lockedReason"], str(detail["quiz"]))

# ================================================================ 4. live session time rule
course_live = make_course("Live course", lessons=1, live_future=True)
r = call("POST", f"/corpers/courses/{course_live['id']}/lessons/{course_live['live']}/complete", c2, json={})
check("future live session can't be marked complete", r.status_code == 400 and r.json().get("code") == "LIVE_NOT_STARTED", f"{r.status_code} {r.text[:150]}")
d = call("GET", f"/corpers/courses/{course_live['id']}", c2).json()
live_row = next(l for l in d["lessons"] if l["kind"] == "live")
check("detail shows canComplete=false for the future live session", live_row["canComplete"] is False and live_row["availableAt"])

# ================================================================ 5. grading + completion
c3 = new_corper("grade"); pay(c3)
course_c = make_course("Grade course C", lessons=2, questions=4)
total_before = overall(c3)["total"]
finish_lessons(c3, course_c)
d = call("GET", f"/corpers/courses/{course_c['id']}", c3).json()
check("not completed after lessons alone (quiz still needed)", d["progress"]["completed"] is False and d["progress"]["status"] == "in_progress")
check("percent unchanged by lessons alone", overall(c3)["completed"] == 0)

quiz = call("GET", f"/corpers/courses/{course_c['id']}/quiz", c3).json()
# malformed
check("malformed: no answers -> 400", submit(c3, course_c, []).status_code == 400)
check("malformed: missing one -> 400 INCOMPLETE", (lambda r: r.status_code == 400 and r.json().get("code") == "INCOMPLETE")(submit(c3, course_c, answers_from(quiz)[:3])))
dup = answers_from(quiz) + [answers_from(quiz)[0]]
check("malformed: duplicate answer -> 400", submit(c3, course_c, dup).status_code == 400)
bad = answers_from(quiz); bad[0]["optionId"] = str(uuid.uuid4())
check("malformed: option that isn't in the question -> 400", (lambda r: r.status_code == 400 and r.json().get("code") == "UNKNOWN_OPTION")(submit(c3, course_c, bad)))
bad = answers_from(quiz); bad[0]["questionId"] = str(uuid.uuid4())
check("malformed: question not in this course -> 400", (lambda r: r.status_code == 400 and r.json().get("code") == "UNKNOWN_QUESTION")(submit(c3, course_c, bad)))
other_quiz = call("GET", f"/corpers/courses/{course_a['id']}/quiz", c1).json()
cross = answers_from(quiz); cross[0] = answers_from(other_quiz)[0]
check("malformed: question/option from ANOTHER course -> 400", submit(c3, course_c, cross).status_code == 400)
check("malformed: junk body -> 400", requests.post(f"{BASE}/corpers/courses/{course_c['id']}/quiz/attempts", headers=H(c3), json={"answers": "x"}).status_code == 400)
check("nothing was recorded by the rejected submissions", call("GET", f"/corpers/courses/{course_c['id']}", c3).json()["quiz"]["attempts"] == 0)

# all wrong -> 0%, but the course is still complete (score never changes the %)
r = submit(c3, course_c, answers_from(quiz, pick_right=False))
check("all wrong -> 201, score 0", r.status_code == 201 and r.json()["attempt"]["score"] == 0, r.text[:200])
res = r.json()
check("completion earned on first submit even with score 0", res["courseJustCompleted"] is True and res["course"]["completed"] is True)
check("review gives the correct answer + explanation after submitting", all(i["correctText"] == "RIGHT" and i["explanation"] for i in res["review"]))
ov = overall(c3)
check("dashboard % = completed / total (score ignored)", ov["completed"] == 1 and ov["percent"] == expected_percent(1, ov["total"]), str(ov))

# retake: partial then perfect; best score only goes up; completion is permanent
quiz2 = call("GET", f"/corpers/courses/{course_c['id']}/quiz", c3).json()
ans = answers_from(quiz2)
ans[0] = answers_from(quiz2, pick_right=False)[0]
r = submit(c3, course_c, ans)
check("partial (3 of 4) -> 75", r.status_code == 201 and r.json()["attempt"]["score"] == 75, r.text[:200])
check("not 'just completed' a second time", r.json()["courseJustCompleted"] is False)
quiz3 = call("GET", f"/corpers/courses/{course_c['id']}/quiz", c3).json()
r = submit(c3, course_c, answers_from(quiz3))
check("perfect -> 100, attempt 3", r.json()["attempt"]["score"] == 100 and r.json()["attempt"]["attemptNo"] == 3, r.text[:200])
quiz4 = call("GET", f"/corpers/courses/{course_c['id']}/quiz", c3).json()
r = submit(c3, course_c, answers_from(quiz4, pick_right=False))
d = call("GET", f"/corpers/courses/{course_c['id']}", c3).json()
check("best score stays 100 after a worse retake; last score 0", d["quiz"]["bestScore"] == 100 and d["quiz"]["lastScore"] == 0 and d["quiz"]["attempts"] == 4, str(d["quiz"]))
check("still completed after a bad retake", d["progress"]["completed"] is True)

# ================================================================ 6. double submit (same tab / two tabs)
c4 = new_corper("dbl"); pay(c4)
course_d = make_course("Double course D", lessons=1, questions=2)
finish_lessons(c4, course_d)
qz = call("GET", f"/corpers/courses/{course_d['id']}/quiz", c4).json()
payload = answers_from(qz)
token = f"tok-{RUN}"
with ThreadPoolExecutor(6) as ex:
    rs = list(ex.map(lambda _: submit(c4, course_d, payload, clientToken=token), range(6)))
check("6 simultaneous submits with one clientToken all succeed", all(x.status_code in (200, 201) for x in rs), [x.status_code for x in rs])
check("...and they are ONE attempt", len({x.json()["attempt"]["id"] for x in rs}) == 1)
d = call("GET", f"/corpers/courses/{course_d['id']}", c4).json()
check("attempts == 1 and completed once", d["quiz"]["attempts"] == 1 and d["progress"]["completed"] is True, str(d["quiz"]))
ov = overall(c4)
check("percent counts the course once", ov["completed"] == 1, str(ov))

# same lesson completed 5x at once
c5 = new_corper("lessonrace"); pay(c5)
course_e = make_course("Lesson race E", lessons=2, questions=1)
lid = course_e["lessons"][0]
with ThreadPoolExecutor(5) as ex:
    rs = list(ex.map(lambda _: call("POST", f"/corpers/courses/{course_e['id']}/lessons/{lid}/complete", c5, json={}), range(5)))
check("5 simultaneous lesson completions all OK", all(x.status_code == 200 for x in rs))
check("lesson counted once", call("GET", f"/corpers/courses/{course_e['id']}", c5).json()["progress"]["lessonsDone"] == 1)

# ================================================================ 7. isolation between members
r = call("GET", f"/corpers/courses/{course_c['id']}/quiz/attempts", c3)
mine = r.json()["attempts"]
check("I can list my own attempts", r.status_code == 200 and len(mine) == 4)
r = call("GET", f"/corpers/courses/{course_c['id']}/quiz/attempts/{mine[0]['id']}", c4)
check("another member can't open my attempt -> 404", r.status_code == 404, f"{r.status_code}")
r = call("GET", f"/corpers/courses/{course_c['id']}", c4)
check("another member sees their OWN progress on that course (not mine)", r.status_code == 200 and r.json()["progress"]["lessonsDone"] == 0 and r.json()["progress"]["completed"] is False, r.text[:200])
farmer = requests.post(f"{BASE}/auth/register", json={"name": "Farmer X", "email": f"f.{RUN}@test.com", "password": "Passw0rd1", "role_type": "farmer", "sex": "male", "phone": phone(99), "state": "Plateau", "lga": "Jos North"}).json()
check("a farmer can't use corps learning routes", call("GET", "/corpers/courses", farmer).status_code == 403)
check("admin can't use the member routes either", call("GET", "/corpers/courses", admin).status_code == 403)
check("no login -> 401", requests.get(f"{BASE}/corpers/courses").status_code == 401)
check("bad ids are 404, not a crash", call("GET", "/corpers/courses/not-a-uuid", c3).status_code == 404)

# ================================================================ 8. history survives admin edits
r = call("GET", f"/corpers/courses/{course_c['id']}/quiz/attempts/{mine[-1]['id']}", c3)
before = r.json()
# admin edits question 1 (option ids are regenerated) and deletes question 2 and lesson 1
r = call("PUT", f"/rtc/admin/courses/{course_c['id']}/questions/{course_c['questions'][0]}", admin, json={
    "prompt": "EDITED question?", "explanation": "edited", "options": [{"text": "NEW RIGHT", "isCorrect": True}, {"text": "NEW WRONG"}]})
check("admin edits a question", r.status_code == 200, r.text[:150])
call("DELETE", f"/rtc/admin/courses/{course_c['id']}/questions/{course_c['questions'][1]}", admin)
call("DELETE", f"/rtc/admin/courses/{course_c['id']}/lessons/{course_c['lessons'][0]}", admin)
after = call("GET", f"/corpers/courses/{course_c['id']}/quiz/attempts/{mine[-1]['id']}", c3).json()
check("old attempt review is byte-for-byte unchanged", before == after)
check("old review still shows the ORIGINAL question text", any(i["prompt"].startswith("Question") for i in after["review"]) and not any("EDITED" in i["prompt"] for i in after["review"]))
d = call("GET", f"/corpers/courses/{course_c['id']}", c3).json()
check("course stays completed after lessons/questions are edited or deleted", d["progress"]["completed"] is True and d["quiz"]["bestScore"] == 100, str(d["progress"]))
# a stale quiz (loaded before the edit) is refused rather than mis-graded
stale = answers_from(quiz2)
r = submit(c3, course_c, stale)
check("stale quiz submitted after an edit -> 400 (never mis-graded)", r.status_code == 400, f"{r.status_code} {r.text[:150]}")

# ================================================================ 9. percentage maths + a course being added
c6 = new_corper("pct"); pay(c6)
base = overall(c6)["total"]
courses = [course_d, course_e]
done_ids = set()


def complete_course(corper, course):
    finish_lessons(corper, course)
    qz = call("GET", f"/corpers/courses/{course['id']}/quiz", corper).json()
    r = submit(corper, course, answers_from(qz, pick_right=False))  # worst score on purpose
    assert r.status_code == 201, r.text[:200]


progress_seen = []
for course in courses:
    complete_course(c6, course)
    ov = overall(c6)
    progress_seen.append(ov)
    check(f"after {len(progress_seen)} course(s): percent == round(100*{ov['completed']}/{ov['total']})", ov["percent"] == expected_percent(ov["completed"], ov["total"]) and ov["completed"] == len(progress_seen), str(ov))
t0 = overall(c6)
more = make_course("Added later F", lessons=1, questions=1)  # approve may ask to confirm; make_course handles it
t1 = overall(c6)
check("adding a live course grows the total and LOWERS the percentage", t1["total"] == t0["total"] + 1 and t1["percent"] <= t0["percent"] and t1["completed"] == t0["completed"], f"{t0} -> {t1}")

# approval warning when members already have progress
unapproved = make_course("Needs confirm G", lessons=1, questions=1, approve=False)
r = call("POST", f"/rtc/admin/courses/{unapproved['id']}/approve", admin, json={})
check("approving with learners present asks for confirmation (409 APPROVAL_IMPACT)", r.status_code == 409 and r.json().get("code") == "APPROVAL_IMPACT" and r.json()["details"]["membersWithProgress"] >= 1, f"{r.status_code} {r.text[:200]}")
r = call("POST", f"/rtc/admin/courses/{unapproved['id']}/approve", admin, json={"confirmImpact": True})
check("...and succeeds once confirmed", r.status_code == 200, r.text[:150])

# ================================================================ 10. admin progress view
r = call("GET", "/rtc/admin/corps/progress", admin)
check("admin progress view loads", r.status_code == 200, r.text[:200])
data = r.json()
mem = next((m for m in data["members"] if m["userId"] == c6["user"]["id"]), None)
check("admin sees the member with the SAME numbers as their dashboard", mem is not None and mem["percent"] == overall(c6)["percent"] and mem["coursesCompleted"] == overall(c6)["completed"], str(mem))
stat = next((c for c in data["courses"] if c["id"] == course_d["id"]), None)
check("per-course stats: started/completed/avg best score", stat is not None and stat["completed"] >= 1 and stat["started"] >= stat["completed"] and stat["averageBestScore"] is not None, str(stat))
check("non-admin can't open the admin progress view", call("GET", "/rtc/admin/corps/progress", c6).status_code == 403)
r = call("GET", "/rtc/admin/corps/progress?paid=unpaid", admin)
check("filter: unpaid members appear with percent 0", r.status_code == 200 and all(m["percent"] == 0 and not m["paid"] for m in r.json()["members"]))

print()
if fails:
    print(f"{len(fails)} FAILED:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("ALL PASSED")
