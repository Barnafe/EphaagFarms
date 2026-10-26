// Run the browser tests in an environment that cannot download Playwright's Chromium:
//   npm i --no-save @sparticuz/chromium && node run-local.mjs [playwright args]
import chromium from "@sparticuz/chromium";
import { spawnSync } from "node:child_process";
const exe = await chromium.executablePath();
const r = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, PW_CHROMIUM_PATH: exe, PW_CHROMIUM_ARGS: JSON.stringify(chromium.args.filter((a) => !/^--(single-process|no-zygote)/.test(a))) },
});
process.exit(r.status ?? 1);
