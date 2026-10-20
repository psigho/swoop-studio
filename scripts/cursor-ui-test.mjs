import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept().catch(() => {}));
const checks = [];
try {
  await page.goto("http://127.0.0.1:9347");
  await page
    .getByRole("button", { name: "Cursor", exact: true })
    .first()
    .click();
  const fingerprints = [];
  for (const style of [
    "Classic",
    "Presenter",
    "Outline",
    "Dot",
    "Halo",
    "Neon",
    "Focus",
    "Hand",
    "Spotlight",
  ]) {
    await page
      .getByRole("button", { name: style + " cursor", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: style + " cursor", exact: true }),
    ).toHaveClass(/selected/);
    await page.waitForTimeout(50);
    fingerprints.push(
      await page
        .locator('canvas[aria-label="Video preview"]')
        .evaluate((c) => c.toDataURL()),
    );
  }
  if (new Set(fingerprints).size !== 9)
    throw new Error("Some cursor styles render identically");
  checks.push("all nine cursor controls change rendered output");
  await page
    .getByRole("button", { name: "Presenter cursor", exact: true })
    .click();
  await page.getByRole("tab", { name: "Trail", exact: true }).click();
  await page.getByRole("button", { name: "Ribbon trail", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: /^Cursor trail/ }),
  ).toBeChecked();
  for (const style of ["Comet", "Ghost", "Ribbon"]) {
    await page
      .getByRole("button", { name: style + " trail", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: style + " trail", exact: true }),
    ).toHaveClass(/selected/);
  }
  checks.push("three trail presets enable their visible effect");
  const pad = page.getByLabel("Effects playground: move, click and drag here");
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height - 35, {
    steps: 12,
  });
  await page.screenshot({ path: "artifacts/cursor-v02-ui-trail.png" });
  await page.mouse.up();
  await expect(page.locator(".playground-mode")).toHaveText("LIVE");
  checks.push("test pad accepts movement, click, hold and release");
  await page.getByRole("tab", { name: "Click", exact: true }).click();
  for (const style of ["Ripple", "Pulse", "Burst", "Ring"]) {
    await page
      .getByRole("button", { name: style + " click effect", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: style + " click effect", exact: true }),
    ).toHaveClass(/selected/);
  }
  await page
    .getByRole("button", { name: "Burst click effect", exact: true })
    .click();
  checks.push("four click presets");
  await page.getByRole("tab", { name: "Drag", exact: true }).click();
  for (const style of ["Elastic", "Drag path", "Selection"]) {
    await page
      .getByRole("button", { name: style + " drag effect", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: style + " drag effect", exact: true }),
    ).toHaveClass(/selected/);
  }
  await page
    .getByRole("button", { name: "Elastic drag effect", exact: true })
    .click();
  checks.push("three drag presets");
  await page.mouse.move(box.x + 30, box.y + 55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 25, box.y + box.height - 30, {
    steps: 15,
  });
  await page.screenshot({ path: "artifacts/cursor-v02-ui-drag.png" });
  await page.mouse.up();
  const dlPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  const dl = await dlPromise;
  await dl.saveAs("artifacts/cursor-v02-project.swoop");
  const project = JSON.parse(
    await fs.readFile("artifacts/cursor-v02-project.swoop", "utf8"),
  );
  if (
    project.settings.cursorStyle !== "presenter" ||
    project.settings.trailStyle !== "ribbon" ||
    project.settings.clickStyle !== "burst" ||
    project.settings.dragStyle !== "elastic" ||
    !project.pointers.some((p) => p.event === "down" && p.pressed)
  )
    throw new Error("Effect project state lost");
  checks.push("all effects and demo drag state saved");
  await page.getByRole("tab", { name: "Pointer", exact: true }).click();
  await page.getByTitle("Run effects demo", { exact: true }).click();
  for (const [w, h] of [
    [1366, 768],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `artifacts/cursor-v02-ui-${w}.png` });
  }
  if (errors.length) throw new Error(errors.join(";"));
  console.log(JSON.stringify({ passed: true, checks, errors }, null, 2));
  await fs.writeFile(
    "artifacts/cursor-v02-ui-results.json",
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
} catch (e) {
  console.error(e);
  await page.screenshot({ path: "artifacts/cursor-v02-ui-failure.png" });
  process.exitCode = 1;
} finally {
  await browser.close();
}
