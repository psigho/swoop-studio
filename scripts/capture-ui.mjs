import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:9347");
await page.waitForSelector("canvas");
for (const [w, h, name] of [
  [1366, 768, "1366"],
  [1440, 900, "1440"],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "artifacts/ui-desktop-" + name + ".png" });
}
console.log(
  JSON.stringify({
    errors,
    canvas: await page.locator(".canvas-fit").boundingBox(),
    overflow: await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.body.scrollWidth,
    })),
  }),
);
await browser.close();
