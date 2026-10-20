import { _electron as electron, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: require("electron"),
  args: ["."],
  cwd: process.cwd(),
  env,
});
const page = await app.firstWindow();
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.waitForSelector(".app-shell");
console.log(
  JSON.stringify({
    title: await page.title(),
    info: await page.evaluate(() => window.swoop.getAppInfo()),
    errors,
  }),
);
await page.screenshot({ path: "artifacts/native-first-launch.png" });
await app.evaluate(({ app }) => app.exit(0));
