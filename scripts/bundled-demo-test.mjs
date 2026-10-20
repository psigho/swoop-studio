import { _electron as electron, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

const root = process.cwd();
const out = path.resolve(
  process.env.SWOOP_DEMO_TEST_OUT ||
    path.join(root, "artifacts", "bundled-demo"),
);
await fs.mkdir(out, { recursive: true });
const binary = process.env.SWOOP_DEMO_APP;
const env = {
  ...process.env,
  SWOOP_DATA_DIR: path.join(out, "isolated-profile"),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const app = await electron.launch({
  executablePath:
    binary ||
    path.join(root, "node_modules", "electron", "dist", "electron.exe"),
  args: binary ? [] : [root],
  cwd: root,
  env,
});
const errors = [];
const networkRequests = [];
const checks = [];
try {
  if (process.env.SWOOP_TEST_HIDE === "1")
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.hide()),
    );
  await app.context().setOffline(true);
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) networkRequests.push(request.url());
  });
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page
    .getByRole("button", { name: "Watch included demo", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Included Swoop demo",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const player = dialog.getByLabel("Swoop cursor effects demo");
  await expect
    .poll(() => player.evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  const metadata = await player.evaluate((video) => ({
    src: video.currentSrc,
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration,
    error: video.error?.message || null,
  }));
  expect(metadata.src).toMatch(/^file:/);
  expect(metadata.src).toMatch(/\/dist\/demo\/Swoop-Studio-Demo\.mp4$/);
  expect(metadata.width).toBe(1920);
  expect(metadata.height).toBe(1080);
  expect(metadata.duration).toBeGreaterThan(8);
  expect(metadata.duration).toBeLessThan(9);
  expect(metadata.error).toBeNull();
  checks.push(
    "bundled local H.264 demo opens offline at 1080p without native file IPC",
  );

  await player.evaluate(async (video) => {
    video.currentTime = 2;
    await video.play();
  });
  await expect
    .poll(() => player.evaluate((video) => video.currentTime))
    .toBeGreaterThan(2.25);
  await player.evaluate((video) => video.pause());
  await page.screenshot({ path: path.join(out, "included-demo.png") });
  checks.push("embedded video plays and seeks inside Swoop");

  await player.evaluate(async (video) => {
    video.currentTime = video.duration - 0.25;
    await video.play();
  });
  await expect.poll(() => player.evaluate((video) => video.ended)).toBe(true);
  expect(
    await player.evaluate((video) => video.error?.message || null),
  ).toBeNull();
  checks.push("seeking to the end completes without media error");

  await dialog
    .getByRole("button", { name: "Back to help", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Watch included demo", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".demo-video-player")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(networkRequests).toEqual([]);
  checks.push("back and Escape close the player and release its video element");

  const bytes = await fs.readFile(
    path.join(root, "public", "demo", "Swoop-Studio-Demo.mp4"),
  );
  const result = {
    passed: true,
    app: binary || "source Electron",
    metadata,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    checks,
    networkRequests,
    errors,
  };
  await fs.writeFile(
    path.join(out, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
