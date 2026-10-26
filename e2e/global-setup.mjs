import { startFakePaystack } from "../backend/test/standins/fakePaystack.mjs";

// The stand-in Paystack the app talks to (the browser never reaches the real one).
// Started once, in the main Playwright process (config files also load in every
// worker, so it cannot be started from the config itself).
export default async function globalSetup() {
  const fake = await startFakePaystack({ port: 4510 });
  return async () => fake.close();
}
