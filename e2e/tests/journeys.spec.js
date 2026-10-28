import { test, expect } from "@playwright/test";
import pg from "pg";


const STANDIN = "http://127.0.0.1:4510"; // the stand-in Paystack (see global-setup.mjs)

// The browser should only talk to the app and the stand-in. Web fonts and anything else on the
// internet are blocked, so a slow or missing connection can never stall a test.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|paystack\.standin)/, (route) => route.abort());
});

// The 8 journeys that matter most. Each becomes a real test when the phase it
// depends on is built; until then it is marked fixme so the list stays visible.

test("smoke: the site loads and an admin can sign in @phone", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/EPHAAG|Ephaag/i);
  await page.goto("/login/admin");
  await page.locator("form input").first().fill("admin@ephaag.test");
  await page.locator("input[type=password]").first().fill("Admin1234");
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();
  await expect(page).toHaveURL(/admin/);
});

test("wrong password shows the same message every time", async ({ page }) => {
  await page.goto("/login/member");
  await page.locator("form input").first().fill("nobody@example.test");
  await page.locator("input[type=password]").first().fill("wrong-password-1");
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});

test.fixme("1 farmer registers with NIN verification, then blocked and unblocked features (needs phase 8) @phone", async () => {});
async function newBuyerSession(page, request) {
  const email = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}@example.test`;
  const reg = await request.post("/api/auth/register", { data: { name: "E2E Buyer", email, password: "Passw0rd!x", role_type: "buyer", sex: "male", buyerType: "individual", address: "1 Test Street, Bauchi" } });
  expect(reg.status()).toBe(201);
  const { token } = await reg.json();
  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), token);
  return { email, token };
}

// The dashboard menu is a drawer behind the hamburger button.
async function openMenuItem(page, name) {
  await page.locator("header button").first().click();
  await page.getByRole("button", { name }).first().click();
}

// Farmer Savings is a pull-down ("Go to": My savings / Farm shares). The share-purchase card lives under
// "Farm shares", so tests that buy or inspect shares pick it first.
async function openFarmShares(page) {
  await page.getByLabel(/^go to/i).selectOption("farm-share");
}

async function shopOneItemToPaymentStep(page, email) {
  await page.goto("/dashboard/buyer");
  await openMenuItem(page, /shop item/i);
  await page.locator("button:has-text('₦')").first().click();   // first product card
  await page.getByRole("button", { name: /add to cart/i }).click();
  await page.getByRole("button", { name: /view cart/i }).click();
  await page.getByRole("button", { name: /proceed to checkout/i }).click();
  await page.getByPlaceholder(/street, city, state/i).fill("12 Market Road, Bauchi");
  await page.getByPlaceholder("080...", { exact: true }).fill("08031112222");
  await page.getByPlaceholder(/backup contact/i).fill("08033334444");
  await page.getByPlaceholder("you@example.com").fill(email);
  // a buyer with a standing balance is offered a choice; this one has none, so it is upfront by default
  if (await page.locator("select").count()) await page.locator("select").selectOption("upfront");
  await page.getByRole("button", { name: /proceed to payment/i }).click();
}

test("2 buyer: shop, pay on the stand-in Paystack, order confirmed, duplicate warning @phone", async ({ page, request }) => {
  const { email } = await newBuyerSession(page, request);
  await page.route("http://paystack.standin/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Paystack stand-in</h1>" }));

  await shopOneItemToPaymentStep(page, email);
  // the fee is shown as its own line before paying
  await expect(page.getByText(/payment processing fee/i)).toBeVisible();
  await expect(page.getByText(/total to pay/i)).toBeVisible();
  await page.getByRole("button", { name: /pay with paystack/i }).click();

  // sent to Paystack's page; the app has saved the order as awaiting payment
  await page.waitForURL(/paystack\.standin\/pay\/(OPR-[A-Z0-9-]+)/);
  const reference = page.url().split("/pay/")[1];
  // the buyer "pays" on Paystack, then comes back
  const standin = STANDIN;
  await request.get(`${standin}/__set?reference=${reference}&status=success`);
  await page.goto(`/dashboard/buyer/payment-return?reference=${reference}`);
  await expect(page.getByText(/payment received/i)).toBeVisible();

  // order history shows it confirmed, with a receipt
  await page.goto("/dashboard/buyer");
  await openMenuItem(page, /order history/i);
  await expect(page.getByText(/payment confirmed/i)).toBeVisible();
  await page.getByRole("button", { name: /^receipt$/i }).click();
  await expect(page.getByText(/total paid/i)).toBeVisible();
  await page.getByRole("button", { name: /^close$/i }).click();

  // ordering exactly the same thing again: the buyer is told on screen and chooses
  await shopOneItemToPaymentStep(page, email);
  await page.getByRole("button", { name: /pay with paystack/i }).click();
  await expect(page.getByText(/you have already paid for this/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /proceed to pay again/i })).toBeVisible();
  await page.getByRole("button", { name: /i don't need to pay again/i }).click();
  await expect(page.getByRole("button", { name: /proceed to pay again/i })).toHaveCount(0);
});

test("a payment that cannot be used is refused on screen, not left for Finance @phone", async ({ page, request }) => {
  const { email } = await newBuyerSession(page, request);
  await page.route("http://paystack.standin/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Paystack stand-in</h1>" }));
  await shopOneItemToPaymentStep(page, email);
  await page.getByRole("button", { name: /pay with paystack/i }).click();
  await page.waitForURL(/paystack\.standin\/pay\/(OPR-[A-Z0-9-]+)/);
  const reference = page.url().split("/pay/")[1];
  // only ₦1 was paid
  await request.get(`${STANDIN}/__set?reference=${reference}&status=success&amountKobo=100`);
  await page.goto(`/dashboard/buyer/payment-return?reference=${reference}`);
  await expect(page.getByText(/could not be used/i)).toBeVisible();
  await expect(page.getByText(/will return the money to you/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /pay the correct amount/i })).toBeVisible();
});

test("3 farmer buys shares through Paystack, sees them, and is warned about a duplicate purchase @phone", async ({ page, request }) => {
  const email = `e2efarmer${Date.now()}@example.test`;
  const reg = await request.post("/api/auth/register", { data: { name: "E2E Farmer", email, password: "Passw0rd!x", role_type: "farmer", sex: "male", state: "Bauchi", lga: "Bauchi", ward: "Ward A", unit: "Unit 1", crops: "Maize,Cassava" } });
  expect(reg.status()).toBe(201);
  const { token } = await reg.json();
  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), token);
  await page.route("http://paystack.standin/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Paystack stand-in</h1>" }));

  await page.goto("/dashboard/farmer");
  await openMenuItem(page, /savings/i);
  await openFarmShares(page);
  // the fee is shown before paying
  await expect(page.getByText(/payment processing fee/i).first()).toBeVisible();
  await page.getByRole("button", { name: /buy & pay/i }).click();
  await expect(page.getByText(/total to pay/i)).toBeVisible();
  await page.getByRole("button", { name: /with paystack/i }).click();

  await page.waitForURL(/paystack\.standin\/pay\/(SPR-[A-Z0-9-]+)/);
  const reference = page.url().split("/pay/")[1];
  await request.get(`${STANDIN}/__set?reference=${reference}&status=success`);
  // back from Paystack: the app verifies the payment itself and shows the new share
  await page.goto(`/dashboard/farmer?sharePayment=${reference}`);
  await expect(page.getByText(/payment verified/i)).toBeVisible();
  await expect(page.getByText(/1 share is now active/i)).toBeVisible();

  // choosing the same number of shares again: told on screen, the farmer decides
  await page.getByRole("button", { name: /all my shares/i }).click();
  await page.getByRole("button", { name: /buy & pay/i }).click();
  await expect(page.getByText(/you have already paid for this/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /proceed to pay again/i })).toBeVisible();
  await page.getByRole("button", { name: /i don't need to pay again/i }).click();
  await expect(page.getByRole("button", { name: /proceed to pay again/i })).toHaveCount(0);
});

test("a share payment of the wrong amount is refused on screen", async ({ page, request }) => {
  const email = `e2efarmer2${Date.now()}@example.test`;
  const reg = await request.post("/api/auth/register", { data: { name: "E2E Farmer Two", email, password: "Passw0rd!x", role_type: "farmer", sex: "female", state: "Bauchi", lga: "Bauchi", ward: "Ward A", unit: "Unit 1", crops: "Maize" } });
  const { token } = await reg.json();
  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), token);
  await page.route("http://paystack.standin/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Paystack stand-in</h1>" }));
  await page.goto("/dashboard/farmer");
  await openMenuItem(page, /savings/i);
  await openFarmShares(page);
  await page.getByRole("button", { name: /buy & pay/i }).click();
  await page.getByRole("button", { name: /with paystack/i }).click();
  await page.waitForURL(/paystack\.standin\/pay\/(SPR-[A-Z0-9-]+)/);
  const reference = page.url().split("/pay/")[1];
  await request.get(`${STANDIN}/__set?reference=${reference}&status=success&amountKobo=100`);
  await page.goto(`/dashboard/farmer?sharePayment=${reference}`);
  await expect(page.getByText(/could not be used/i)).toBeVisible();
  await expect(page.getByText(/will return the money to you/i)).toBeVisible();
});

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/ephaag_e2e";
async function sql(text, params) { const c = new pg.Client({ connectionString: DB_URL }); await c.connect(); try { return await c.query(text, params); } finally { await c.end(); } }
async function farmerStartsShareCheckout(page, request, name) {
  const email = `e2e${name}${Date.now()}@example.test`;
  const reg = await request.post("/api/auth/register", { data: { name: `E2E ${name}`, email, password: "Passw0rd!x", role_type: "farmer", sex: "male", state: "Bauchi", lga: "Bauchi", ward: "Ward A", unit: "Unit 1", crops: "Maize" } });
  expect(reg.status()).toBe(201);
  const { token } = await reg.json();
  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), token);
  await page.route("http://paystack.standin/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Paystack stand-in</h1>" }));
  await page.goto("/dashboard/farmer");
  await openMenuItem(page, /savings/i);
  await openFarmShares(page);
  await page.getByRole("button", { name: /buy & pay/i }).click();
  await page.getByRole("button", { name: /with paystack/i }).click();
  await page.waitForURL(/paystack\.standin\/pay\/(SPR-[A-Z0-9-]+)/);
  return { reference: page.url().split("/pay/")[1], token };
}

test("9 a late share payment is not refused: the farmer sees the fee, must tick agree, then pays and gets the share @phone", async ({ page, request }) => {
  const { reference } = await farmerStartsShareCheckout(page, request, "latefarmer");
  // the purchase fell due 10 days ago
  await sql("UPDATE share_purchases SET expires_at = now() - interval '230 hours' WHERE reference = $1", [reference]);
  await page.goto("/dashboard/farmer");
  await openMenuItem(page, /savings/i);
  await openFarmShares(page);
  await expect(page.getByText(/overdue by 10 days/i)).toBeVisible();
  await page.getByRole("button", { name: /pay again/i }).click();
  await expect(page.getByText(/this purchase is 10 days late/i)).toBeVisible();
  await expect(page.getByText(/late fee/i).first()).toBeVisible();
  const proceed = page.getByRole("button", { name: /proceed to pay/i });
  await expect(proceed).toBeDisabled();
  await page.getByRole("checkbox", { name: /i agree to pay the late fee/i }).check();
  await expect(proceed).toBeEnabled();
  await proceed.click();
  await page.waitForURL(/paystack\.standin\/pay\/(SPR-[A-Z0-9-]+)/);
  const ref2 = page.url().split("/pay/")[1];
  expect(ref2).not.toBe(reference);
  await request.get(`${STANDIN}/__set?reference=${ref2}&status=success`);
  await page.goto(`/dashboard/farmer?sharePayment=${reference}`);
  await expect(page.getByText(/payment verified/i)).toBeVisible();
});

test("10 admin Refund room: money that could not be applied is listed, a reason is required, the refund is full and moves to History", async ({ page, request }) => {
  const { reference } = await farmerStartsShareCheckout(page, request, "refundfarmer");
  await request.get(`${STANDIN}/__set?reference=${reference}&status=success&amountKobo=100`);
  await page.goto(`/dashboard/farmer?sharePayment=${reference}`);
  await expect(page.getByText(/could not be used/i)).toBeVisible();

  const adminLogin = await request.post("/api/auth/login", { data: { email: "admin@ephaag.test", password: "Admin1234" } });
  const adminToken = (await adminLogin.json()).token;
  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), adminToken);
  await page.goto("/admin/refunds");
  await expect(page.getByRole("heading").or(page.getByText(/^Refund room$/)).first()).toBeVisible();
  const row = page.locator("li", { hasText: reference });
  await expect(row).toBeVisible();
  await expect(row.getByText(/amount paid did not match/i)).toBeVisible();
  await row.getByRole("button", { name: /refund…/i }).click();
  await row.getByRole("button", { name: /refund in full/i }).click();
  await expect(row.getByText(/write the reason/i)).toBeVisible();
  await row.getByPlaceholder(/reason for the refund/i).fill("Farmer paid the wrong amount");
  await row.getByRole("button", { name: /refund in full/i }).click();
  await expect(page.locator("li", { hasText: reference })).toHaveCount(0);
  await page.getByRole("button", { name: /^history$/i }).click();
  await expect(page.locator("li", { hasText: reference }).getByText(/farmer paid the wrong amount/i)).toBeVisible();
});

test("11 investor pays to activate through Paystack, then pays a month with Pay now and can switch to automatic card payments @phone", async ({ page, request }) => {
  const email = `e2einvestor${Date.now()}@example.test`;
  const reg = await request.post("/api/auth/register", { data: { name: "E2E Investor", email, password: "Passw0rd!x", role_type: "investor", sex: "male" } });
  expect(reg.status()).toBe(201);
  const { token } = await reg.json();
  const auth = { Authorization: `Bearer ${token}` };
  const adminToken = (await (await request.post("/api/auth/login", { data: { email: "admin@ephaag.test", password: "Admin1234" } })).json()).token;
  const adm = { Authorization: `Bearer ${adminToken}` };
  const app = (await (await request.post("/api/investments/apply", { headers: auth, data: { planType: "monthly", amount: 10000, durationYears: 1, paymentMode: "manual" } })).json()).application;
  expect((await request.post(`/api/investments/applications/${app.id}/decide`, { headers: adm, data: { decision: "approve" } })).status()).toBe(200);
  await sql("UPDATE investment_applications SET status='agreement_review', agreement_file_url='/uploads/agreements/x.pdf' WHERE id=$1", [app.id]);
  expect((await request.post(`/api/investments/applications/${app.id}/decide`, { headers: adm, data: { decision: "approve" } })).status()).toBe(200);

  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), token);
  await page.route("http://paystack.standin/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Paystack stand-in</h1>" }));
  await page.goto("/dashboard/investor");
  await expect(page.getByText(/approved — pay to activate/i).first()).toBeVisible();
  await expect(page.getByText(/payment processing fee/i)).toBeVisible();
  await page.getByRole("button", { name: /pay securely with paystack/i }).click();
  await page.waitForURL(/paystack\.standin\/pay\/(IPR-[A-Z0-9-]+)/);
  const ref = page.url().split("/pay/")[1];
  await request.get(`${STANDIN}/__set?reference=${ref}&status=success`);
  await page.goto(`/dashboard/investor?investmentPayment=${ref}`);
  await expect(page.getByText(/payment received/i)).toBeVisible();
  await expect(page.getByText(/active investment/i)).toBeVisible();
  await expect(page.getByText(/pay now: month due/i)).toBeVisible();

  // pay the next month with Pay now
  await page.getByRole("button", { name: /pay securely with paystack/i }).click();
  await page.waitForURL(/paystack\.standin\/pay\/(IPR-[A-Z0-9-]+)/);
  const ref2 = page.url().split("/pay/")[1];
  expect(ref2).not.toBe(ref);
  await request.get(`${STANDIN}/__set?reference=${ref2}&status=success`);
  await page.goto(`/dashboard/investor?investmentPayment=${ref2}`);
  await expect(page.getByText(/payment received/i)).toBeVisible();
  await expect(page.getByText(/paystack\)/i).first()).toBeVisible();

  // switch to automatic card payments
  await page.getByRole("button", { name: /switch to automatic card payments/i }).click();
  await expect(page.getByText(/no card is saved yet/i)).toBeVisible();
});

test("12 Finance can record an investment payment received outside Paystack, with a required reason", async ({ page, request }) => {
  const email = `e2einvoffline${Date.now()}@example.test`;
  const reg = await request.post("/api/auth/register", { data: { name: "E2E Offline Investor", email, password: "Passw0rd!x", role_type: "investor", sex: "male" } });
  const { token } = await reg.json();
  const adminToken = (await (await request.post("/api/auth/login", { data: { email: "admin@ephaag.test", password: "Admin1234" } })).json()).token;
  const adm = { Authorization: `Bearer ${adminToken}` };
  const app = (await (await request.post("/api/investments/apply", { headers: { Authorization: `Bearer ${token}` }, data: { planType: "bulk", amount: 100000, durationYears: 1 } })).json()).application;
  expect((await request.post(`/api/investments/applications/${app.id}/decide`, { headers: adm, data: { decision: "approve" } })).status()).toBe(200);
  await sql("UPDATE investment_applications SET status='agreement_review', agreement_file_url='/uploads/agreements/x.pdf' WHERE id=$1", [app.id]);
  const fin = await request.post(`/api/investments/applications/${app.id}/decide`, { headers: adm, data: { decision: "approve" } });
  expect(fin.status()).toBe(200);
  expect((await fin.json()).application.status).toBe("awaiting_payment");

  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), adminToken);
  await page.goto("/admin/finance");
  await page.getByRole("button", { name: /open menu/i }).click();
  await page.getByRole("button", { name: /^investments$/i }).click();
  const card = page.locator("div", { hasText: app.reference }).last();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /record a payment received outside paystack/i }).click();
  await card.getByRole("button", { name: /^record payment$/i }).click();
  await expect(card.getByText(/write the reason/i)).toBeVisible();
  await card.getByPlaceholder(/reason \(required\)/i).fill("Bank transfer TRF-555 from the investor");
  await card.getByRole("button", { name: /^record payment$/i }).click();
  await expect.poll(async () => (await sql("SELECT status FROM investment_applications WHERE id=$1", [app.id])).rows[0].status).toBe("active");
});

test("4a corps member must agree the fee is non-refundable, pays through Paystack, and is unlocked @phone", async ({ page, request }) => {
  // an admin sets the access fee
  const adminLogin = await request.post("/api/auth/login", { data: { email: "admin@ephaag.test", password: "Admin1234" } });
  const adminToken = (await adminLogin.json()).token;
  const fee = await request.put("/api/rtc/admin/corps/fee", { headers: { Authorization: `Bearer ${adminToken}` }, data: { amount: 5000 } });
  expect(fee.status()).toBe(200);
  const email = `e2ecorper${Date.now()}@example.test`;
  const n = Math.floor(Math.random() * 900000) + 100000;
  const reg = await request.post("/api/auth/register", { data: {
    name: "E2E Corper", email, password: "Passw0rd!x", role_type: "corper", sex: "male", phone: `0803${Math.floor(1000000 + Math.random() * 8999999)}`,
    callUpNumber: `NYSC/E2E/${n}`, stateCode: `PL/26B/${n}`, serviceYear: 2026, batch: "B", stream: "II", stateOfDeployment: "Plateau", ppa: "Test PPA", discipline: "Agriculture", consentTerms: true, consentData: true } });
  expect(reg.status()).toBe(201);
  const { token } = await reg.json();
  await page.addInitScript((t) => localStorage.setItem("ephaag_token", t), token);
  await page.route("http://paystack.standin/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Paystack stand-in</h1>" }));

  await page.goto("/dashboard/corper");
  await openMenuItem(page, /^payments$/i);
  await expect(page.getByText(/payment processing fee/i)).toBeVisible();
  // the non-refundable tick is required before Pay now works
  const payNow = page.getByRole("button", { name: /^pay now$/i });
  await expect(payNow).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(payNow).toBeEnabled();
  await payNow.click();
  await page.waitForURL(/paystack\.standin\/pay\/(CPAY-[A-Z0-9-]+)/);
  const reference = page.url().split("/pay/")[1];
  await request.get(`${STANDIN}/__set?reference=${reference}&status=success`);
  await page.goto(`/dashboard/corper?corperPayment=${reference}`);
  await openMenuItem(page, /^payments$/i);
  await expect(page.getByText(/access fee paid/i)).toBeVisible();
  await expect(page.getByText(/total paid/i)).toBeVisible();
});

test.fixme("5 investor: apply, agreement, pay, active, Pay now (needs phase 4)", async () => {});
test.fixme("6 loan: savings deposit, score, apply, approvals, payout (needs phases 5, 6)", async () => {});
test.fixme("7 purchasing: request, attachments, budget block, role approvals (needs phase 10)", async () => {});
test.fixme("8 delivery: dispatch, driver delivers with code, photo and GPS, buyer sees it (needs phase 12)", async () => {});
