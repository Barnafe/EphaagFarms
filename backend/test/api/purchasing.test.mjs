// Phase 10: Purchasing. Separate approval roles (Procurement, Finance, CEO), required attachments, annual
// department budgets with low-budget alerts and a Finance hold when a budget is used up.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, db, newFarmer, loginAdmin, waitForMessage, uniq, API } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";

after(async () => {
  await db.query("UPDATE users SET department_head_of = NULL WHERE id = ANY($1)", [Object.values(staff).map((s) => s.id)]);
  await db.end(); await pool.end();
});

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const TXT = Buffer.from("just some text, not a document");
const YEAR = new Date().getUTCFullYear();
let main;
const staff = {};          // procurement, finance, ceo, maintenance (head of the Maintenance department)
const post = (path, token, body) => api(`/purchasing${path}`, { method: "POST", token, body });
const get = (path, token) => api(`/purchasing${path}`, { token });
const file = (buf = PDF, name = "doc.pdf", type = "application/pdf") => { const f = new FormData(); f.append("file", new Blob([buf], { type }), name); return f; };
const form = (fields, buf = PDF, name = "doc.pdf", type = "application/pdf") => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, String(v)); if (buf) f.append("file", new Blob([buf], { type }), name); return f; };

async function makeStaff(role) {
  const f = await newFarmer();
  assert.equal((await api(`/admin/positions/admins/${f.id}/promote`, { method: "POST", token: main })).status, 200);
  assert.equal((await api(`/admin/positions/hods/${f.id}/promote`, { method: "POST", token: main, body: { department: role } })).status, 200);
  const login = await api("/auth/login", { method: "POST", body: { email: f.email, password: f.password } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  return { id: f.id, email: f.email, token: login.data.token };
}
async function supplier() {
  const r = await post("/suppliers", staff.procurement.token, { name: `Supplier ${uniq()}`, category: "goods" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.supplier;
}
// Take a new request for `department` as far as "sourcing" with a quotation that has its document attached.
async function sourcing(department, amount = 50000) {
  const sup = await supplier();
  const c = await post("/requests", staff.procurement.token, { department, title: `Item ${uniq()}`, items: [{ description: "Thing", quantity: 1, estimatedUnitPrice: amount }] });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const id = c.data.request.id;
  assert.equal((await post(`/requests/${id}/approve`, staff.procurement.token, { note: "needed" })).status, 200);
  const q = await api(`/purchasing/requests/${id}/quotations`, { method: "POST", token: staff.procurement.token, body: form({ supplierId: sup.id, amount }) });
  assert.equal(q.status, 201, JSON.stringify(q.data));
  assert.equal((await post(`/requests/${id}/select-supplier`, staff.procurement.token, { quotationId: q.data.quotation.id })).status, 200);
  return { id, reference: c.data.request.reference };
}
const makePO = (id, total, token = staff.procurement.token) => post(`/requests/${id}/purchase-order`, token, { items: [{ description: "Thing", quantity: 1, unitPrice: total }] });
async function approvedPO(department, total) {
  const r = await sourcing(department, total);
  const po = await makePO(r.id, total);
  assert.equal(po.status, 201, JSON.stringify(po.data));
  assert.equal(po.data.onHold, false);
  const d = await post(`/purchase-orders/${po.data.purchaseOrder.id}/decide`, staff.ceo.token, { decision: "approve" });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  return { ...r, poId: po.data.purchaseOrder.id };
}
const budget = async (department) => (await get(`/budgets?year=${YEAR}`, main)).data.budgets.find((b) => b.department === department);
const countMsgs = async (template, email) => (await db.query("SELECT count(*)::int AS n FROM messages WHERE template=$1 AND to_address=$2", [template, email])).rows[0].n;

test("setup: appoint a Procurement head, a Finance head, a CEO and a Maintenance head", async () => {
  main = await loginAdmin();
  for (const [key, role] of [["procurement", "Procurement"], ["finance", "Finance"], ["ceo", "CEO"], ["maintenance", "Maintenance"]]) staff[key] = await makeStaff(role);
  const me = await get("/me", staff.ceo.token);
  assert.equal(me.data.role, "CEO");
  assert.equal((await get("/me", main)).data.role, "Main admin");
  const f = await newFarmer();
  assert.equal((await get("/me", f.token)).status, 403);
  assert.equal((await api("/purchasing/requests")).status, 401);
});

test("each approval stage belongs to one role; the main admin can act in any role; the audit trail records the role", async () => {
  const c = await post("/requests", staff.maintenance.token, { department: "Maintenance", title: `Spanners ${uniq()}`, items: [{ description: "Spanner set", quantity: 2 }] });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const id = c.data.request.id;
  assert.equal(c.data.request.waitingFor, "Procurement");
  const wrong = await post(`/requests/${id}/approve`, staff.finance.token, {});
  assert.equal(wrong.status, 403); assert.equal(wrong.data.code, "WRONG_STAGE_ROLE"); assert.equal(wrong.data.requiredRole, "Procurement");
  assert.equal((await post(`/requests/${id}/approve`, staff.ceo.token, {})).status, 403);
  assert.equal((await post(`/requests/${id}/approve`, staff.maintenance.token, {})).status, 403, "the requesting department cannot approve its own need");
  assert.ok(await waitForMessage("template = 'purchase_awaiting' AND to_address = $1 AND body_html LIKE $2", [staff.procurement.email, `%${c.data.request.reference}%`]), "the Procurement head is told");
  assert.equal(await countMsgs("purchase_awaiting", staff.ceo.email), 0, "and nobody else is bothered");
  const ok = await post(`/requests/${id}/approve`, staff.procurement.token, { note: "Needed" });
  assert.equal(ok.status, 200);
  const sup = await supplier();
  assert.equal((await api(`/purchasing/requests/${id}/quotations`, { method: "POST", token: staff.ceo.token, body: form({ supplierId: sup.id, amount: 100 }) })).status, 403);
  const viaMain = await api(`/purchasing/requests/${id}/quotations`, { method: "POST", token: main, body: form({ supplierId: sup.id, amount: 100 }) });
  assert.equal(viaMain.status, 201, "the main admin can act in the Procurement role");
  const detail = (await get(`/requests/${id}`, main)).data.request;
  assert.equal(detail.history[0].actor_role, "Maintenance", "the request itself was raised by the Maintenance head");
  assert.ok(detail.history.some((h) => h.actor_role === "Procurement" && h.to_status === "approved"));
  assert.ok(detail.history.some((h) => h.actor_role === "Main admin" && h.to_status === "sourcing"));
});

test("a department must be one of the known departments", async () => {
  const r = await post("/requests", staff.procurement.token, { department: "Made-up", title: "x", items: [{ description: "a", quantity: 1 }] });
  assert.equal(r.status, 400); assert.match(r.data.error, /department must be one of/);
});

// ---------------- attachments ----------------
test("a quotation must be attached before a supplier can be selected; documents are stored privately and only admins can download them", async () => {
  const sup = await supplier();
  const c = await post("/requests", staff.procurement.token, { department: "Store", title: `Shelving ${uniq()}`, items: [{ description: "Shelf", quantity: 4 }] });
  const id = c.data.request.id;
  await post(`/requests/${id}/approve`, staff.procurement.token, {});
  const bare = await post(`/requests/${id}/quotations`, staff.procurement.token, { supplierId: sup.id, amount: 80000 });
  assert.equal(bare.status, 201, "a quotation can be noted first");
  assert.equal(bare.data.quotation.hasFile, false); assert.ok(!("file_url" in bare.data.quotation));
  const qid = bare.data.quotation.id;
  const blocked = await post(`/requests/${id}/select-supplier`, staff.procurement.token, { quotationId: qid });
  assert.equal(blocked.status, 400); assert.match(blocked.data.error, /Attach the supplier's quotation/);

  const bad = await api(`/purchasing/requests/${id}/quotations/${qid}/attachment`, { method: "POST", token: staff.procurement.token, body: file(TXT, "note.txt", "text/plain") });
  assert.ok(bad.status >= 400 && bad.status < 500, `a text file is refused (${bad.status})`);
  assert.equal((await api(`/purchasing/requests/${id}/quotations/${qid}/attachment`, { method: "POST", token: staff.ceo.token, body: file() })).status, 403);
  const att = await api(`/purchasing/requests/${id}/quotations/${qid}/attachment`, { method: "POST", token: staff.procurement.token, body: file(PDF, "quote.pdf") });
  assert.equal(att.status, 200, JSON.stringify(att.data));
  assert.equal(att.data.request.quotations[0].hasFile, true); assert.equal(att.data.request.quotations[0].fileName, "quote.pdf");
  assert.equal((await post(`/requests/${id}/select-supplier`, staff.procurement.token, { quotationId: qid })).status, 200);

  const dl = await api(`/purchasing/requests/${id}/quotations/${qid}/file`, { token: staff.finance.token, raw: true });
  assert.equal(dl.status, 200); assert.match(dl.headers.get("content-type"), /pdf/);
  assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), PDF.toString());
  const f = await newFarmer();
  assert.equal((await api(`/purchasing/requests/${id}/quotations/${qid}/file`, { token: f.token })).status, 403);
  assert.equal((await api(`/purchasing/requests/${id}/quotations/${qid}/file`)).status, 401);
  const stored = (await db.query("SELECT file_url FROM supplier_quotations WHERE id=$1", [qid])).rows[0].file_url;
  const viaFiles = await api(`/files/${stored}`, { token: f.token });
  assert.ok([401, 403, 404].includes(viaFiles.status), `a member cannot reach it through the file route (${viaFiles.status})`);
});

test("an invoice must be attached before it is verified and before the final payment", async () => {
  const r = await approvedPO("Store", 40000);
  const id = r.id;
  assert.equal((await post(`/requests/${id}/authorize-payment`, staff.procurement.token, { amount: 20000 })).status, 403, "payment is Finance's step");
  assert.equal((await post(`/requests/${id}/authorize-payment`, staff.finance.token, { amount: 20000, reference: "BANK-1" })).status, 201);
  assert.equal((await post(`/requests/${id}/mark-delivered`, staff.procurement.token, {})).status, 200);
  assert.equal((await post(`/requests/${id}/verify-goods`, staff.procurement.token, { result: "correct" })).status, 200);
  const inv = await post(`/requests/${id}/invoice`, staff.procurement.token, { invoiceNumber: "INV-9", amount: 40000 });
  assert.equal(inv.status, 201, JSON.stringify(inv.data));
  assert.equal(inv.data.invoice.hasFile, false);
  assert.equal((await post(`/requests/${id}/verify-invoice`, staff.finance.token, {})).status, 400, "cannot verify an invoice nobody can see");
  assert.match((await post(`/requests/${id}/verify-invoice`, staff.finance.token, {})).data.error, /Attach the supplier's invoice/);
  const att = await api(`/purchasing/requests/${id}/invoice/attachment`, { method: "POST", token: staff.procurement.token, body: file(PDF, "invoice.pdf") });
  assert.equal(att.status, 200, JSON.stringify(att.data));
  assert.equal((await post(`/requests/${id}/verify-invoice`, staff.procurement.token, {})).status, 403, "verifying is Finance's step");
  assert.equal((await post(`/requests/${id}/verify-invoice`, staff.finance.token, {})).status, 200);
  await db.query("UPDATE supplier_invoices SET file_url = NULL WHERE request_id = $1", [id]); // simulate a missing document
  const noFile = await post(`/requests/${id}/final-payment`, staff.finance.token, { amount: 20000 });
  assert.equal(noFile.status, 400); assert.match(noFile.data.error, /invoice document must be attached/);
  await db.query("UPDATE supplier_invoices SET file_url = (SELECT file_url FROM supplier_quotations WHERE request_id=$1 LIMIT 1) WHERE request_id = $1", [id]);
  const done = await post(`/requests/${id}/final-payment`, staff.finance.token, { amount: 20000 });
  assert.equal(done.status, 201, JSON.stringify(done.data));
  assert.equal(done.data.request.status, "completed");
  const dl = await api(`/purchasing/requests/${id}/invoice/file`, { token: main, raw: true });
  assert.equal(dl.status, 200);
});

// ---------------- budgets ----------------
test("only Finance sets budgets; the numbers are validated; every department is listed", async () => {
  const bad = [{ amount: -1 }, { amount: "abc" }, { amount: 1000, warnAtPercent: 0 }, { amount: 1000, warnAtPercent: 101 }, { amount: 1000, year: 1999 }];
  for (const b of bad) assert.equal((await api("/purchasing/budgets/Maintenance", { method: "PUT", token: staff.finance.token, body: b })).status, 400, JSON.stringify(b));
  assert.equal((await api("/purchasing/budgets/Maintenance", { method: "PUT", token: staff.procurement.token, body: { amount: 1000 } })).status, 403);
  assert.equal((await api("/purchasing/budgets/Nowhere", { method: "PUT", token: staff.finance.token, body: { amount: 1000 } })).status, 404);
  const all = (await get(`/budgets?year=${YEAR}`, staff.ceo.token)).data;
  assert.deepEqual(all.budgets.map((b) => b.department), ["Store", "Production", "Maintenance", "Transport", "Finance", "TRC", "Procurement", "Other"]);
  const set = await api("/purchasing/budgets/Maintenance", { method: "PUT", token: staff.finance.token, body: { amount: 100000, warnAtPercent: 80 } });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  const b = await budget("Maintenance");
  assert.deepEqual([b.configured, b.amount, b.committed, b.remaining, b.percentUsed], [true, 100000, 0, 100000, 0]);
  assert.equal((await budget("Store")).configured, false, "no budget set means no limit");
});

test("the department head is told once as soon as the budget is getting low, and again when it is used up", async () => {
  await approvedPO("Maintenance", 60000);
  let b = await budget("Maintenance");
  assert.deepEqual([b.committed, b.percentUsed, b.low], [60000, 60, false]);
  assert.equal(await countMsgs("budget_low", staff.maintenance.email), 0);
  await approvedPO("Maintenance", 30000);                       // 90% used
  b = await budget("Maintenance");
  assert.deepEqual([b.committed, b.percentUsed, b.low, b.exhausted], [90000, 90, true, false]);
  const m = await waitForMessage("template = 'budget_low' AND to_address = $1", [staff.maintenance.email]);
  assert.ok(m, "the Maintenance head is warned");
  assert.ok(m.body_html.includes("Requests form"), "and told how to ask for more");
  assert.ok(await waitForMessage("template = 'budget_low' AND to_address = $1", [staff.finance.email]), "Finance is told too");
  await approvedPO("Maintenance", 5000);                        // 95%: still low, no second warning
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(await countMsgs("budget_low", staff.maintenance.email), 1, "the low-budget warning is sent once");
});

test("when the budget would be overrun the purchase order waits for Finance; the CEO cannot act until Finance decides", async () => {
  const r = await sourcing("Maintenance", 20000);
  const po = await makePO(r.id, 20000);                          // 95,000 + 20,000 > 100,000
  assert.equal(po.status, 201, JSON.stringify(po.data));
  assert.equal(po.data.onHold, true);
  assert.equal(po.data.request.status, "budget_approval_pending"); assert.equal(po.data.request.waitingFor, "Finance");
  assert.ok(await waitForMessage("template = 'purchase_budget_hold' AND to_address = $1 AND body_html LIKE $2", [staff.finance.email, `%${r.reference}%`]), "Finance is told");
  const poId = po.data.purchaseOrder.id;
  const ceo = await post(`/purchase-orders/${poId}/decide`, staff.ceo.token, { decision: "approve" });
  assert.equal(ceo.status, 409); assert.match(ceo.data.error, /Finance must decide on the budget first/);

  assert.equal((await post(`/requests/${r.id}/budget-decision`, staff.ceo.token, { decision: "approve", note: "x" })).status, 403);
  assert.equal((await post(`/requests/${r.id}/budget-decision`, staff.finance.token, { decision: "approve" })).status, 400, "a note is required");
  assert.equal((await post(`/requests/${r.id}/budget-decision`, staff.finance.token, { decision: "maybe", note: "x" })).status, 400);
  const ok = await post(`/requests/${r.id}/budget-decision`, staff.finance.token, { decision: "approve", note: "Critical repair, approved over budget." });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.request.status, "po_pending_approval");
  assert.equal((await post(`/requests/${r.id}/budget-decision`, staff.finance.token, { decision: "approve", note: "again" })).status, 400, "it is no longer waiting for a budget decision");
  const done = await post(`/purchase-orders/${poId}/decide`, staff.ceo.token, { decision: "approve" });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.request.status, "po_approved");
  const b = await budget("Maintenance");
  assert.equal(b.committed, 115000); assert.equal(b.exhausted, true);
  assert.ok(await waitForMessage("template = 'budget_exhausted' AND to_address = $1", [staff.maintenance.email]), "the department head is told the budget is used up");
  assert.ok((await get(`/requests/${r.id}`, main)).data.request.history.some((h) => /over budget/i.test(h.note || "") && h.actor_role === "Finance"));
});

test("Finance can decline an over-budget order: it goes back to sourcing and a corrected order can be raised", async () => {
  const r = await sourcing("Maintenance", 30000);
  const po = await makePO(r.id, 30000);
  assert.equal(po.data.onHold, true);
  const no = await post(`/requests/${r.id}/budget-decision`, staff.finance.token, { decision: "reject", note: "Too expensive. Get a cheaper quote." });
  assert.equal(no.status, 200); assert.equal(no.data.request.status, "sourcing");
  assert.equal((await db.query("SELECT status FROM purchase_orders WHERE id=$1", [po.data.purchaseOrder.id])).rows[0].status, "rejected");
  const again = await makePO(r.id, 100);
  assert.equal(again.status, 201, "a corrected order can be raised after a rejection");
  assert.equal(again.data.onHold, true, "still over budget while the budget is used up");
  assert.equal((await get(`/requests/${r.id}`, main)).data.request.purchaseOrder.id, again.data.purchaseOrder.id, "the live order is shown");
});

test("raising the budget lets purchasing continue, and alerts can fire again later", async () => {
  assert.equal((await api("/purchasing/budgets/Maintenance", { method: "PUT", token: staff.finance.token, body: { amount: 1000000, warnAtPercent: 80 } })).status, 200);
  const b = await budget("Maintenance");
  assert.deepEqual([b.exhausted, b.low, b.remaining > 0], [false, false, true]);
  const r = await sourcing("Maintenance", 10000);
  const po = await makePO(r.id, 10000);
  assert.equal(po.data.onHold, false);
  assert.equal((await post(`/purchase-orders/${po.data.purchaseOrder.id}/decide`, staff.ceo.token, { decision: "reject", note: "Not now" })).status, 200, "the CEO can also reject");
  assert.equal((await get(`/requests/${r.id}`, main)).data.request.status, "sourcing");
});

test("another department's budget is separate, and a cancelled request frees its commitment", async () => {
  await api("/purchasing/budgets/Transport", { method: "PUT", token: staff.finance.token, body: { amount: 50000 } });
  const a = await approvedPO("Transport", 30000);
  assert.equal((await budget("Transport")).committed, 30000);
  assert.equal((await budget("Production")).committed, 0);
  await db.query("UPDATE purchase_requests SET status = 'cancelled' WHERE id = $1", [a.id]);
  assert.equal((await budget("Transport")).committed, 0, "cancelled requests no longer count");
});
