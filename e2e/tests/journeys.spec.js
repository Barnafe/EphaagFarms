import { test, expect } from "@playwright/test";

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
  await expect(page.getByText(/returned to your original payment method/i)).toBeVisible();
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
  await page.getByRole("button", { name: /buy & pay/i }).click();
  await page.getByRole("button", { name: /with paystack/i }).click();
  await page.waitForURL(/paystack\.standin\/pay\/(SPR-[A-Z0-9-]+)/);
  const reference = page.url().split("/pay/")[1];
  await request.get(`${STANDIN}/__set?reference=${reference}&status=success&amountKobo=100`);
  await page.goto(`/dashboard/farmer?sharePayment=${reference}`);
  await expect(page.getByText(/could not be used/i)).toBeVisible();
  await expect(page.getByText(/returned to your original payment method/i)).toBeVisible();
});

test.fixme("4 corps: register, pay, learn, quiz, certificate hidden, batch closed, download, public verify (needs phases 3, 13, 14)", async () => {});
test.fixme("5 investor: apply, agreement, pay, active, Pay now (needs phase 4)", async () => {});
test.fixme("6 loan: savings deposit, score, apply, approvals, payout (needs phases 5, 6)", async () => {});
test.fixme("7 purchasing: request, attachments, budget block, role approvals (needs phase 10)", async () => {});
test.fixme("8 delivery: dispatch, driver delivers with code, photo and GPS, buyer sees it (needs phase 12)", async () => {});
