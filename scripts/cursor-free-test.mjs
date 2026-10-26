import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const root = process.cwd(),
  out = path.join(
    root,
    "artifacts",
    `cursor-free-${version}${process.env.SWOOP_TEST_SYNTHETIC ? "-auto" : ""}`,
  );
await fs.mkdir(out, { recursive: true });
const env = {
  ...process.env,
  SWOOP_DATA_DIR: path.join(out, `profile-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
for (const name of ["ready.json", "go.json", "stop.json", "result.json"])
  await fs.rm(path.join(out, name), { force: true });
const app = await electron.launch({
  executablePath:
    process.env.SWOOP_PACKAGED === "1"
      ? path.join(
          root,
          `release/installers/${version}/win-unpacked/Swoop-Studio.exe`,
        )
      : require("electron"),
  args: process.env.SWOOP_PACKAGED === "1" ? [] : ["."],
  cwd: root,
  env,
});
const errors = [];
let page;
async function write(name, data) {
  await fs.writeFile(path.join(out, name), JSON.stringify(data, null, 2));
}
async function signal(name, timeout = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      return JSON.parse(await fs.readFile(path.join(out, name), "utf8"));
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for " + name);
}
async function saveTo(file) {
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(out, file),
  );
}
try {
  page = await app.firstWindow();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.waitForSelector(".app-shell");
  const info = await page.evaluate(() => window.swoop.getAppInfo());
  if (!info.ffmpeg || !info.clicksSupported)
    throw new Error("Missing native capture/encoding capability");
  await app.evaluate(
    async ({ BrowserWindow }, boardPath) => {
      const board = new BrowserWindow({
        width: 1280,
        height: 720,
        frame: false,
        resizable: false,
        title: "Swoop Cursor Field Test",
        backgroundColor: "#f4f6f2",
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      globalThis.__swoopTestBoard = board;
      board.setMenuBarVisibility(false);
      await board.loadFile(boardPath);
      board.center();
      await board.webContents.executeJavaScript(
        `document.head.insertAdjacentHTML("beforeend", "<style>* {cursor: default !important}</style>")`,
      );
    },
    path.join(root, "scripts/recording-test-board.html"),
  );
  await page
    .getByRole("button", { name: "Cursor", exact: true })
    .first()
    .click();
  for (const [tab, button] of [
    ["Pointer", "Presenter cursor"],
    ["Trail", "Ribbon trail"],
    ["Click", "Burst click effect"],
    ["Drag", "Elastic drag effect"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.getByRole("button", { name: button, exact: true }).click();
  }
  await page.getByRole("checkbox", { name: /^Cursor effects/ }).check();
  await page.getByRole("button", { name: "New video", exact: true }).click();
  const source = page.locator(".source-grid button").filter({
    has: page.locator("span", { hasText: /^Swoop Cursor Field Test$/ }),
  });
  await expect(source).toHaveCount(1);
  await source.click();
  await page.getByRole("checkbox", { name: /System audio/ }).uncheck();
  // Owned stereo tones exercise the picker/channel routing without recording a real microphone.
  await page.evaluate(() => {
    window.__micConstraints = [];
    const contexts = [];
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: "audioinput", deviceId: "input-a", label: "Test microphone A" },
      { kind: "audioinput", deviceId: "input-b", label: "Test microphone B" },
      {
        kind: "audiooutput",
        deviceId: "default",
        label: "Test default output",
      },
    ];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__micConstraints.push(constraints);
      const context = new AudioContext();
      contexts.push(context);
      await context.resume();
      const left = context.createOscillator(),
        right = context.createOscillator();
      left.frequency.value = 220;
      right.frequency.value = 660;
      const merger = context.createChannelMerger(2),
        destination = context.createMediaStreamDestination();
      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);
      merger.connect(destination);
      left.start();
      right.start();
      const track = destination.stream.getAudioTracks()[0];
      const settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), channelCount: 2 });
      track.addEventListener("ended", () => {
        void context.close();
      });
      return destination.stream;
    };
  });
  await page.getByRole("checkbox", { name: /Microphone/ }).check();
  await expect(page.getByLabel("Microphone input")).toBeEnabled();
  await page.getByLabel("Microphone input").selectOption("input-b");
  await page.getByLabel("Microphone channel").selectOption("right");
  await expect(page.locator(".system-audio-source")).toContainText(
    "Test default output",
  );
  await page.screenshot({ path: path.join(out, "recording-setup.png") });
  await page.getByRole("checkbox", { name: /Minimize studio/ }).uncheck();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish take", exact: true }),
  ).toBeVisible({ timeout: 40000 });
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await write("ready.json", {
    ready: true,
    board: "Swoop Cursor Field Test",
    version: info.version,
    paused: true,
    hwnd: await app.evaluate(() =>
      globalThis.__swoopTestBoard
        .getNativeWindowHandle()
        .readBigUInt64LE()
        .toString(),
    ),
  });
  console.log("READY: paused; waiting for go.json");
  if (!process.env.SWOOP_TEST_SYNTHETIC) await signal("go.json");
  await page
    .getByRole("button", { name: "Resume recording", exact: true })
    .click();
  await write("recording.json", { started: Date.now() });
  console.log("RECORDING: perform Windows clicks and drags");
  if (process.env.SWOOP_TEST_SYNTHETIC) {
    await page.waitForTimeout(Number(process.env.SWOOP_STATIC_TEST_MS || 0));
    const board = app.windows().find((candidate) => candidate !== page);
    await board.getByRole("button", { name: "Target one" }).click();
    await board.getByRole("button", { name: "Target two" }).click();
    await board.getByRole("button", { name: "Target three" }).click();
    await page.waitForTimeout(1400);
  } else await signal("stop.json", 120000);
  await page.getByRole("button", { name: "Finish take", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Finish take", exact: true }),
  ).toBeHidden({ timeout: 25000 });
  await expect(page.getByLabel("Project name")).toHaveValue(/^Take /);
  await page.getByLabel("Project name").fill("Fresh cursor field test");
  await saveTo("fresh-cursor-test.swoop");
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  const project = JSON.parse(
    await fs.readFile(path.join(out, "fresh-cursor-test.swoop"), "utf8"),
  );
  const down = project.pointers.filter((p) => p.event === "down"),
    up = project.pointers.filter((p) => p.event === "up"),
    held = project.pointers.filter((p) => p.event === "move" && p.pressed);
  if (
    !process.env.SWOOP_TEST_SYNTHETIC &&
    (down.length < 3 || up.length < 3 || held.length < 3)
  )
    throw new Error(
      `Native gesture data incomplete: ${down.length} down / ${up.length} up / ${held.length} held moves`,
    );
  if (
    project.settings.cursorStyle !== "presenter" ||
    project.settings.trailStyle !== "ribbon" ||
    project.settings.clickStyle !== "burst" ||
    project.settings.dragStyle !== "elastic"
  )
    throw new Error("Effects settings changed");
  // Keep the full board visible for this inspection, and trim idle setup/tail only.
  project.zooms = [];
  project.trimStart = Math.max(0, (down[0]?.t ?? 0.6) - 0.6);
  project.trimEnd = Math.min(
    project.duration,
    (up.at(-1)?.t ?? project.duration - 1) + 1.0,
  );
  await fs.writeFile(
    path.join(out, "fresh-cursor-test.swoop"),
    JSON.stringify(project),
  );
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    },
    path.join(out, "fresh-cursor-test.swoop"),
  );
  await page.getByRole("button", { name: "Open project · Ctrl+O" }).click();
  await expect(page.getByLabel("Project name")).toHaveValue(project.name);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("1080");
  await page.getByLabel("Export format").selectOption("mp4");
  await saveTo("fresh-cursor-test-1080p.mp4");
  console.log(
    "EXPORTING: " +
      (project.trimEnd - project.trimStart).toFixed(2) +
      " seconds, 1080p MP4",
  );
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 180000,
  });
  const output = path.join(out, "fresh-cursor-test-1080p.mp4"),
    stat = await fs.stat(output);
  if (stat.size < 10000) throw new Error("Empty export");
  const boardEvents = await app.evaluate(async () =>
    globalThis.__swoopTestBoard.webContents.executeJavaScript(
      "window.fieldTestEvents",
    ),
  );
  await page.screenshot({ path: path.join(out, "editor.png") });
  const result = {
    passed: errors.length === 0,
    version: info.version,
    runtimeVersion: await app.evaluate(() => process.versions.electron),
    source: "Swoop Cursor Field Test - real Windows window capture",
    physicalInput: process.env.SWOOP_TEST_SYNTHETIC
      ? "No physical mouse verification: owned browser clicks exercised capture, backup and export while the desktop was unavailable"
      : "Windows Computer Use mouse input; native uiohook down/up and held samples",
    output,
    project: path.join(out, "fresh-cursor-test.swoop"),
    recordedDuration: project.duration,
    trimStart: project.trimStart,
    trimEnd: project.trimEnd,
    pointerSamples: project.pointers.length,
    downEvents: down.length,
    upEvents: up.length,
    heldMoves: held.length,
    effects: project.settings,
    boardEvents,
    microphoneConstraints: await page.evaluate(() => window.__micConstraints),
    bytes: stat.size,
    errors,
  };
  await write("result.json", result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (page)
    await page
      .screenshot({ path: path.join(out, "failure.png") })
      .catch(() => {});
  await write("result.json", { passed: false, error: String(error), errors });
  console.error(error);
  process.exitCode = 1;
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
