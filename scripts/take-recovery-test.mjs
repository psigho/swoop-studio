import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Run only against an app build containing the take-recovery bridge and UI.
// Every file, native dialog override and captured source belongs to this test.
const root = process.cwd();
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const out = path.resolve(
  process.env.SWOOP_RECOVERY_TEST_OUT ||
    path.join(root, "artifacts", "take-recovery", `${version}-${randomUUID()}`),
);
const profile = path.join(out, "isolated-profile");
await fs.mkdir(out, { recursive: true });
if (process.platform === "win32" && !/^K:/i.test(out))
  throw new Error("Use a K: output folder for this isolated recording test.");
const binary = process.env.SWOOP_RECOVERY_APP;
const encoder = binary
  ? path.join(path.dirname(binary), "resources", "encoder", "ffmpeg.exe")
  : path.join(root, "vendor", "ffmpeg", "win32-x64", "ffmpeg.exe");
// A separate, test-only generator can create the VP9 fixture. Recovery decoding
// always uses the reviewed application encoder above.
const fixtureEncoder = process.env.SWOOP_FIXTURE_ENCODER || encoder;
const env = { ...process.env, SWOOP_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const checks = [];
const errors = [];
const decoderWarnings = [];
const networkRequests = [];
const launches = [];
const fixtures = {};
let app;
let page;
let appInfo;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function encodeFixture(file) {
  const result = spawnSync(
    fixtureEncoder,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30",
      "-t",
      "2.4",
      "-c:v",
      "libvpx-vp9",
      "-an",
      file,
    ],
    { windowsHide: true, timeout: 30000, encoding: "utf8" },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Owned video fixture failed: ${result.error || result.stderr}`,
    );
}

function decode(file, label) {
  const result = spawnSync(
    encoder,
    [
      "-hide_banner",
      "-v",
      "warning",
      "-nostdin",
      "-i",
      file,
      "-map",
      "0:v:0",
      "-fps_mode",
      "passthrough",
      "-f",
      "null",
      "-",
    ],
    {
      windowsHide: true,
      timeout: 30000,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `${label} did not decode: ${result.error || result.stderr}`,
    );
  if (result.stderr.trim())
    decoderWarnings.push({ label, warning: result.stderr.trim() });
}

async function launch(label) {
  app = await electron.launch({
    executablePath:
      binary ||
      path.join(root, "node_modules", "electron", "dist", "electron.exe"),
    args: binary ? [] : [root],
    cwd: root,
    env,
    timeout: 30000,
  });
  await app.context().setOffline(true);
  const actualProfile = await app.evaluate(({ app }) =>
    app.getPath("userData"),
  );
  assert.equal(path.resolve(actualProfile), path.resolve(profile));
  await app.evaluate(({ dialog }) => {
    // Approve discard only in this unique test instance, never a user's app.
    dialog.showMessageBox = async () => ({ response: 1 });
    dialog.showMessageBoxSync = () => 1;
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) =>
    errors.push({ label, message: error.message }),
  );
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) networkRequests.push(request.url());
  });
  page.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  appInfo = await page.evaluate(() => window.swoop.getAppInfo());
  launches.push({ label, profile: actualProfile, version: appInfo.version });
}

async function forceExit() {
  if (!app) return;
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
  app = undefined;
  page = undefined;
}

async function closeWithoutSaving() {
  const closed = app.waitForEvent("close", { timeout: 20000 });
  await page
    .evaluate(() => window.swoop.close())
    .catch((error) => {
      if (!/closed|destroyed/i.test(String(error))) throw error;
    });
  await closed;
  app = undefined;
  page = undefined;
}

async function seedTake(name, bytes, complete, pointers = []) {
  return page.evaluate(
    async ({ name, data, complete, pointers }) => {
      const take = await window.swoop.beginTake({
        name,
        mimeType: "video/webm",
        width: 640,
        height: 360,
      });
      const bytes = new Uint8Array(data);
      // Exercise several ordered writes through the actual context bridge.
      const step = Math.ceil(bytes.length / 4);
      for (let offset = 0; offset < bytes.length; offset += step)
        await window.swoop.appendTakeChunk(
          take.id,
          bytes.slice(offset, offset + step),
        );
      if (complete)
        await window.swoop.completeTake(take.id, {
          duration: 2.4,
          pointers,
          warnings: [],
        });
      return take;
    },
    { name, data: Array.from(bytes), complete, pointers },
  );
}

async function openNativeTake(id, outputName) {
  const opened = await page.evaluate(async (id) => {
    const opened = await window.swoop.openTake(id);
    return { ...opened, bytes: Array.from(opened.bytes) };
  }, id);
  const bytes = Buffer.from(opened.bytes);
  const file = path.join(out, outputName);
  await fs.writeFile(file, bytes);
  return { opened, bytes, file };
}

async function openRow(name) {
  const dialog = page.getByRole("dialog", {
    name: "Your recordings",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: `Open recording ${name}`, exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Project name")).toHaveValue(name);
}

async function renderedMediaHash() {
  return page
    .locator("video")
    .first()
    .evaluate(async (video) => {
      const bytes = await (
        await fetch(video.src || video.currentSrc)
      ).arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    });
}

async function saveProjectForAssertion(file) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function startOwnWindowRecording() {
  const before = await page.evaluate(() => window.swoop.listTakes());
  const known = new Set(before.takes.map((take) => take.id));
  await page.getByRole("button", { name: "New video", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "New recording",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const own = dialog.locator('.source-grid button[data-self="true"]');
  await expect(own).toHaveCount(1);
  await own.click();
  await dialog.getByRole("checkbox", { name: /System audio/ }).uncheck();
  const microphone = dialog.getByRole("checkbox", { name: /Microphone/ });
  if (await microphone.count()) await microphone.uncheck();
  const minimize = dialog.getByRole("checkbox", { name: /Minimize studio/ });
  if (await minimize.count()) await minimize.uncheck();
  else await expect(dialog.locator(".capture-self-note")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish take", exact: true }),
  ).toBeVisible({
    timeout: 40000,
  });
  return { before, known };
}

async function actualOwnWindowRecording() {
  const { known } = await startOwnWindowRecording();
  // Events stay inside the owned studio window. No desktop or other app is selected.
  await page.mouse.move(600, 300);
  await page.waitForTimeout(800);
  await page.mouse.move(760, 370, { steps: 12 });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Finish take", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Finish take", exact: true }),
  ).toBeHidden({
    timeout: 25000,
  });
  await expect
    .poll(async () => {
      const { takes } = await page.evaluate(() => window.swoop.listTakes());
      return takes.filter(
        (take) => !known.has(take.id) && take.state === "ready",
      ).length;
    })
    .toBe(1);
  const after = await page.evaluate(() => window.swoop.listTakes());
  const take = after.takes.find((take) => !known.has(take.id));
  assert(
    take && take.bytes > 1000 && take.duration > 1,
    "A completed native backup was not created.",
  );
  assert.equal(
    take.hasCursorData,
    true,
    "Own-window recording did not retain cursor data.",
  );
  const recovered = await openNativeTake(take.id, "actual-own-window.webm");
  assert(recovered.opened.pointers.length > 0);
  await expect(page.locator(".take-backup-state")).toContainText(
    "Original backed up",
  );
  assert.equal(await renderedMediaHash(), hash(recovered.bytes));
  decode(recovered.file, "actual completed own-window recording");
  fixtures.actual = {
    id: take.id,
    name: take.name,
    bytes: recovered.bytes.length,
    sha256: hash(recovered.bytes),
    pointerSamples: recovered.opened.pointers.length,
  };
  checks.push(
    "Actual owned-window MediaRecorder capture streams to a completed native backup, with cursor samples and a fully decodable raw WebM.",
  );
  // Deliberately perform no Save project, edit or export for this captured take.
  await closeWithoutSaving();
  await launch("after closing actual unedited recording without saving");
  await openRow(take.name);
  assert.equal(await renderedMediaHash(), fixtures.actual.sha256);
  const reopened = await openNativeTake(take.id, "actual-after-restart.webm");
  assert.equal(hash(reopened.bytes), fixtures.actual.sha256);
  assert.deepEqual(reopened.opened.pointers, recovered.opened.pointers);
  checks.push(
    "Closing the isolated studio without Save project or Export preserves the unedited actual recording; restart and the recordings UI restore identical media and cursors.",
  );
}

async function assertEditorFrame(expectedHash) {
  assert.equal(await renderedMediaHash(), expectedHash);
  const duration = Number(
    await page.getByLabel("Trim out seconds").inputValue(),
  );
  assert(
    Number.isFinite(duration) && duration > 0,
    "The recovered editor has no finite usable duration.",
  );
  const video = page.locator("video").first();
  await expect
    .poll(() => video.evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(1);
  await video.evaluate((video) => {
    video.currentTime = Math.min(0.25, video.duration / 2);
  });
  await expect
    .poll(() => video.evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  const dimensions = await video.evaluate((video) => ({
    width: video.videoWidth,
    height: video.videoHeight,
    error: video.error?.message || null,
  }));
  assert(dimensions.width > 0 && dimensions.height > 0);
  assert.equal(dimensions.error, null);
  return { duration, ...dimensions };
}

async function actualInterruptedWindowRecording() {
  const { before, known } = await startOwnWindowRecording();
  let active;
  await expect
    .poll(
      async () => {
        const entries = await fs.readdir(before.directory, {
          withFileTypes: true,
        });
        const unknown = entries.filter(
          (entry) => entry.isDirectory() && !known.has(entry.name),
        );
        if (unknown.length !== 1) return false;
        const file = path.join(
          before.directory,
          unknown[0].name,
          "recording.webm",
        );
        try {
          const stat = await fs.stat(file);
          if (stat.size <= 1000) return false;
          active = { id: unknown[0].name, file, firstObservedBytes: stat.size };
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
  // Observe another streamed write before quitting without a stop/finalize call.
  await page.mouse.move(660, 430, { steps: 10 });
  await expect
    .poll(async () => (await fs.stat(active.file)).size, {
      timeout: 15000,
    })
    .toBeGreaterThan(active.firstObservedBytes);
  await forceExit();
  const persisted = await fs.readFile(active.file);
  fixtures.actualInterrupted = {
    id: active.id,
    firstObservedBytes: active.firstObservedBytes,
    bytes: persisted.length,
    sha256: hash(persisted),
  };
  await launch("after forced exit during actual own-window recording");
  const { takes } = await page.evaluate(() => window.swoop.listTakes());
  const take = takes.find((take) => take.id === active.id);
  assert.equal(take?.state, "interrupted");
  const reopened = await openNativeTake(
    active.id,
    "actual-interrupted-after-restart.webm",
  );
  assert.equal(hash(reopened.bytes), hash(persisted));
  decode(
    reopened.file,
    "actual own-window capture interrupted before recorder stop",
  );
  await openRow(take.name);
  fixtures.actualInterrupted.editor = await assertEditorFrame(hash(persisted));
  fixtures.actualInterrupted.cursorSamples = reopened.opened.pointers.length;
  checks.push(
    "Actual interrupted capture: two on-disk byte sizes were observed while recording the owned window, then the app exited without MediaRecorder.stop or take completion. Restart retains identical partial media and the recovery UI opens a readable frame with a finite editor duration. Cursor metadata is not claimed for this interrupted take.",
  );
}

try {
  const fixtureFile = path.join(out, "owned-seed.webm");
  encodeFixture(fixtureFile);
  const fixtureBytes = await fs.readFile(fixtureFile);
  const partialBytes = fixtureBytes.subarray(
    0,
    Math.floor(fixtureBytes.length * 0.72),
  );
  const pointers = [
    { t: 0, x: 0.2, y: 0.3, visible: true, event: "move" },
    {
      t: 0.5,
      x: 0.4,
      y: 0.4,
      click: true,
      event: "down",
      pressed: true,
      button: 1,
    },
    { t: 0.8, x: 0.6, y: 0.5, event: "up", pressed: false, button: 1 },
    { t: 2.2, x: 0.7, y: 0.6, event: "move", visible: true },
  ];
  await launch("seed native storage");
  const initial = await page.evaluate(() => window.swoop.listTakes());
  assert.equal(
    initial.takes.length,
    0,
    "The unique test profile was not empty.",
  );
  const ready = await seedTake(
    "Recovery fixture ready",
    fixtureBytes,
    true,
    pointers,
  );
  const interrupted = await seedTake(
    "Recovery fixture interrupted",
    partialBytes,
    false,
  );
  fixtures.ready = {
    id: ready.id,
    bytes: fixtureBytes.length,
    sha256: hash(fixtureBytes),
  };
  fixtures.interrupted = {
    id: interrupted.id,
    bytes: partialBytes.length,
    sha256: hash(partialBytes),
  };
  await forceExit();
  checks.push(
    "Seeded storage case: native context bridge accepts ordered video chunks; forced process exit occurs after acknowledged writes and before one take is finalized.",
  );

  await launch("after seeded interrupted write");
  const list = await page.evaluate(() => window.swoop.listTakes());
  const relative = path.relative(profile, list.directory);
  assert(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    "Backup storage escaped the isolated profile.",
  );
  const readyTake = list.takes.find((take) => take.id === ready.id);
  const interruptedTake = list.takes.find((take) => take.id === interrupted.id);
  assert.equal(readyTake?.state, "ready");
  assert.equal(interruptedTake?.state, "interrupted");
  assert.equal(readyTake.bytes, fixtureBytes.length);
  assert.equal(interruptedTake.bytes, partialBytes.length);
  const recovered = await openNativeTake(ready.id, "seed-ready-recovered.webm");
  assert.equal(hash(recovered.bytes), hash(fixtureBytes));
  assert.deepEqual(recovered.opened.pointers, pointers);
  decode(recovered.file, "completed seeded backup");
  const partial = await openNativeTake(
    interrupted.id,
    "seed-interrupted-recovered.webm",
  );
  assert.equal(hash(partial.bytes), hash(partialBytes));
  decode(partial.file, "interrupted seeded WebM prefix");
  checks.push(
    "After process restart, completed seeded media and cursor events are byte-exact; an unfinalized video prefix remains listed as interrupted and decodes with any container warnings reported separately.",
  );

  const recordings = page.getByRole("dialog", {
    name: "Your recordings",
    exact: true,
  });
  await expect(recordings).toBeVisible();
  await page.screenshot({ path: path.join(out, "recordings-panel.png") });
  await expect(
    recordings.getByRole("button", {
      name: "Show recordings folder",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    recordings.getByRole("button", {
      name: "Open recording Recovery fixture interrupted",
      exact: true,
    }),
  ).toBeVisible();
  await openRow("Recovery fixture ready");
  assert.equal(await renderedMediaHash(), hash(fixtureBytes));
  const saved = await saveProjectForAssertion(
    path.join(out, "recovered-fixture.swoop"),
  );
  assert.deepEqual(saved.pointers, pointers);
  assert.equal(
    hash(Buffer.from(saved.mediaBase64, "base64")),
    hash(fixtureBytes),
  );
  checks.push(
    "Startup automatically offers Your recordings; Open recording restores the selected seed to the editor and a portable project retains exact media and cursor events.",
  );

  await page.getByRole("button", { name: "Recordings", exact: true }).click();
  await openRow("Recovery fixture interrupted");
  fixtures.interrupted.editor = await assertEditorFrame(hash(partialBytes));
  checks.push(
    "The interrupted seeded take also opens through the actual recordings UI with identical partial bytes, a finite editor duration and a decoded video frame.",
  );

  await actualOwnWindowRecording();
  await actualInterruptedWindowRecording();
  assert.deepEqual(errors, []);
  assert.deepEqual(networkRequests, []);
  const result = {
    passed: true,
    checkedAt: new Date().toISOString(),
    app: binary || "source Electron with production dist",
    version: appInfo.version,
    out,
    profile,
    checks,
    fixtures,
    launches,
    fixtureEncoder,
    recoveryDecoder: encoder,
    decoderWarnings,
    errors,
    networkRequests,
    captureScope:
      "The isolated test Swoop window only; microphone and system audio disabled.",
    seededCrashScope:
      "Owned generated WebM chunks provide a deterministic interrupted-prefix comparison.",
    actualCrashScope:
      "An owned-window capture exits after two distinct on-disk byte sizes, without stopping or finalizing its recorder. This is process-exit recovery, not a power-loss test.",
    userProfilesTouched: false,
    userWindowsClosed: false,
    installerExecuted: false,
    githubUploaded: false,
  };
  await fs.writeFile(
    path.join(out, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (page)
    await page
      .screenshot({ path: path.join(out, "failure.png") })
      .catch(() => {});
  const result = {
    passed: false,
    checkedAt: new Date().toISOString(),
    out,
    profile,
    checks,
    fixtures,
    launches,
    fixtureEncoder,
    recoveryDecoder: encoder,
    decoderWarnings,
    errors,
    networkRequests,
    error: String(error?.stack || error),
    userProfilesTouched: false,
    installerExecuted: false,
    githubUploaded: false,
  };
  await fs.writeFile(
    path.join(out, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  await forceExit();
}
