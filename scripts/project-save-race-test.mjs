import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Run against the local source preview. A deferred desktop bridge exposes the
// time spent reading media, waiting for a save dialog and writing a project.
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.addInitScript(() => {
    window.__savedProjects = [];
    window.__pendingSaves = [];
    window.confirm = () => true;
    window.swoop = {
      getAppInfo: async () => ({
        version: "review",
        platform: "win32",
        ffmpeg: false,
        clicksSupported: true,
      }),
      onExportProgress: () => () => {},
      listTakes: async () => ({ directory: "", takes: [] }),
      saveProject: (data) => {
        window.__savedProjects.push(structuredClone(data));
        return new Promise((resolve) => window.__pendingSaves.push(resolve));
      },
    };
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      if (window.__deferMediaRead) {
        window.__resumeMediaRead = () => read.call(this, blob);
      } else read.call(this, blob);
    };
  });
  await page.goto(process.env.SWOOP_REVIEW_URL ?? "http://127.0.0.1:9347");
  const save = page.getByRole("button", { name: "Save project · Ctrl+S" });
  const title = page.getByLabel("Project name");
  const saveState = page.locator(".save-state");
  const waitForSaves = (count) =>
    page.waitForFunction(
      (count) => window.__savedProjects.length === count,
      count,
    );
  const finishSave = (canceled = false) =>
    page.evaluate((canceled) => {
      window.__pendingSaves.shift()({ canceled, path: "review.swoop" });
    }, canceled);

  await title.fill("Before save");
  await save.click();
  await waitForSaves(1);
  await expect(save).toBeDisabled();
  await title.fill("Newer edit");
  await page
    .getByRole("button", { name: "Cursor", exact: true })
    .first()
    .click();
  const neon = page.getByRole("button", { name: "Neon cursor", exact: true });
  await neon.click();
  await page.keyboard.press("Control+s");
  assert.equal(await page.evaluate(() => window.__savedProjects.length), 1);
  await finishSave();
  await expect(save).toBeEnabled();
  await expect(title).toHaveValue("Newer edit");
  await expect(neon).toHaveClass(/selected/);
  await expect(saveState).toContainText("Unsaved");
  const first = await page.evaluate(() => window.__savedProjects[0]);
  assert.equal(first.name, "Before save");
  assert.equal(first.settings.cursorStyle, "arrow");
  checks.push(
    "pending save preserves newer title and cursor; duplicate save is serialized",
  );

  await title.fill("");
  await save.click();
  await waitForSaves(2);
  await finishSave();
  await expect(title).toHaveValue("Untitled take");
  await expect(saveState).toContainText("Ready to play");
  checks.push("unchanged snapshot normalizes an empty name and becomes clean");

  const makeVideo = async (color) =>
    Buffer.from(
      await page.evaluate(async (color) => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 64;
        const context = canvas.getContext("2d");
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp8",
        });
        const chunks = [];
        const completed = new Promise((resolve, reject) => {
          recorder.ondataavailable = (event) => chunks.push(event.data);
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: recorder.mimeType }));
          recorder.onerror = () =>
            reject(new Error("Test video creation failed"));
        });
        let frame = 0;
        const draw = () => {
          context.fillStyle = color;
          context.fillRect(0, 0, 96, 64);
          context.fillStyle = "#ffffff";
          context.fillRect(frame++ % 72, 12, 12, 12);
        };
        draw();
        recorder.start();
        const timer = setInterval(draw, 1000 / 30);
        await new Promise((resolve) => setTimeout(resolve, 600));
        recorder.stop();
        clearInterval(timer);
        const blob = await completed;
        stream.getTracks().forEach((track) => track.stop());
        const { withWebmDuration } = await import("/src/studio/webm.ts");
        const seekable = await withWebmDuration(blob, 0.6);
        return [...new Uint8Array(await seekable.arrayBuffer())];
      }, color),
    );
  const mediaA = await makeVideo("#366b42");
  const mediaB = await makeVideo("#835037");
  const input = page.locator("input[type=file]").first();
  await input.setInputFiles({
    name: "Before.webm",
    mimeType: "video/webm",
    buffer: mediaA,
  });
  await expect(title).toHaveValue("Before");
  await page.evaluate(() => {
    window.__deferMediaRead = true;
  });
  await save.click();
  await page.waitForFunction(() => !!window.__resumeMediaRead);
  await input.setInputFiles({
    name: "Replacement.webm",
    mimeType: "video/webm",
    buffer: mediaB,
  });
  await expect(title).toHaveValue("Replacement");
  await page
    .getByRole("button", { name: "Outline cursor", exact: true })
    .click();
  await page.evaluate(() => {
    window.__deferMediaRead = false;
    window.__resumeMediaRead();
  });
  await waitForSaves(3);
  const oldMediaSnapshot = await page.evaluate(() => window.__savedProjects[2]);
  assert.equal(oldMediaSnapshot.name, "Before");
  assert.equal(oldMediaSnapshot.mediaBase64, mediaA.toString("base64"));
  assert.equal(oldMediaSnapshot.settings.cursorStyle, "neon");
  await finishSave();
  await expect(title).toHaveValue("Replacement");
  await expect(saveState).toContainText("Unsaved");
  await expect(
    page.getByRole("button", { name: "Outline cursor", exact: true }),
  ).toHaveClass(/selected/);
  checks.push(
    "media snapshot stays coherent while a different video and style replace the editor",
  );

  await save.click();
  await waitForSaves(4);
  const replacement = await page.evaluate(() => window.__savedProjects[3]);
  assert.equal(replacement.name, "Replacement");
  assert.equal(replacement.mediaBase64, mediaB.toString("base64"));
  assert.equal(replacement.settings.cursorStyle, "outline");
  await finishSave(true);
  await expect(save).toBeEnabled();
  await expect(saveState).toContainText("Unsaved");
  checks.push(
    "a canceled save releases the save guard and retains unsaved changes",
  );
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, errors };
  await fs.mkdir("artifacts/release-review", { recursive: true });
  await fs.writeFile(
    path.join("artifacts/release-review", "project-save-race-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
