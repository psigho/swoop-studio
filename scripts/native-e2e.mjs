import { _electron as electron, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url),
  root = process.cwd(),
  env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const version = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
).version;
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
const mediaFixture = path.join(
  root,
  "artifacts",
  "engine-source-with-audio.webm",
);
// A clean source checkout has no recordings. Generate the owned fixture locally.
try {
  await fs.access(mediaFixture);
} catch {
  const encoder = process.env.SWOOP_FIXTURE_ENCODER;
  if (!encoder)
    throw new Error(
      "Set SWOOP_FIXTURE_ENCODER to a separate FFmpeg build with libvpx-vp9 and libopus to generate the owned test fixture. The app uses its reviewed bundled encoder for export.",
    );
  execFileSync(
    encoder,
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
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "2.4",
      "-c:v",
      "libvpx-vp9",
      "-c:a",
      "libopus",
      mediaFixture,
    ],
    { windowsHide: true, timeout: 30000 },
  );
}
env.SWOOP_DATA_DIR = path.join(root, "artifacts", `e2e-${version}-profile`);
const packaged = process.env.SWOOP_PACKAGED === "1";
const app = await electron.launch({
  executablePath: packaged
    ? (process.env.SWOOP_EXECUTABLE ??
      path.join(
        root,
        `release/installers/${version}/win-unpacked/Swoop-Studio.exe`,
      ))
    : require("electron"),
  args: packaged ? [] : ["."],
  cwd: root,
  env,
});
let page;
const errors = [],
  checks = [];
async function saveTo(name) {
  const file = path.join(root, "artifacts", name);
  await app.evaluate(({ dialog }, file) => {
    globalThis.__swoopSavePath = file;
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: globalThis.__swoopSavePath,
    });
  }, file);
  return file;
}
try {
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => {
    void d.accept().catch(() => {});
  });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => {
    window.__swoopConfirms = [];
    window.confirm = (message) => {
      window.__swoopConfirms.push(message);
      return true;
    };
  });
  const info = await page.evaluate(() => window.swoop.getAppInfo());
  if (!info.ffmpeg || !info.clicksSupported)
    throw new Error("Expected local capabilities");
  checks.push("native bridge + ffmpeg + clicks");
  await page
    .getByRole("button", { name: "Cursor", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Halo cursor" }).click();
  await expect(page.getByRole("button", { name: "Halo cursor" })).toHaveClass(
    /selected/,
  );
  await page.getByLabel("Trim out seconds").fill("2.4");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("720");
  await page.getByLabel("Export format").selectOption("mp4");
  await saveTo("native-demo-export.mp4");
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 40000,
  });
  if (
    (await fs.stat(path.join(root, "artifacts/native-demo-export.mp4"))).size <
    1000
  )
    throw new Error("Empty native export");
  checks.push("UI demo render + native MP4 save");
  const projectPath = await saveTo("native-demo-project.swoop");
  await page.getByLabel("Project name").fill("");
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  await expect(page.getByLabel("Project name")).toHaveValue("Untitled take");
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
  if (project.settings.cursorStyle !== "ring" || project.trimEnd !== 2.4)
    throw new Error("Project state lost");
  checks.push("project save includes edit state");
  await page.getByLabel("Project name").fill("Changed title");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, projectPath);
  await page.getByRole("button", { name: "Open project · Ctrl+O" }).click();
  await expect(page.getByLabel("Project name")).toHaveValue(project.name);
  checks.push("project reopen");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(path.join(root, "artifacts/engine-source-with-audio.webm"));
  await expect(page.getByLabel("Project name")).toHaveValue(
    "engine-source-with-audio",
  );
  await page.getByLabel("Trim in seconds").fill("0.4");
  await page.getByLabel("Trim out seconds").fill("1.4");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("720");
  await page.getByLabel("Export format").selectOption("webm");
  await saveTo("native-import-audio-export.webm");
  await page.getByRole("button", { name: "Export WEBM", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 30000,
  });
  checks.push("import + trim + WebM UI export");
  const embedded = await saveTo("native-embedded-project.swoop");
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  const embeddedProject = JSON.parse(await fs.readFile(embedded, "utf8"));
  if (!embeddedProject.mediaBase64) throw new Error("Project not portable");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, embedded);
  await page.getByRole("button", { name: "Open project · Ctrl+O" }).click();
  await page.waitForTimeout(300);
  const position = await page.locator("video").evaluate((v) => v.currentTime);
  if (Math.abs(position - 0.4) > 0.12)
    throw new Error("Restored trimmed playback wrong " + position);
  checks.push("portable media roundtrip + restored source seek");
  await page.getByLabel("Trim out seconds").fill("1.2");
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole("button", { name: "Go to start", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Play preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause preview", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play preview", exact: true }),
    ).toBeVisible({ timeout: 4000 });
    await page
      .getByRole("button", { name: "Play preview", exact: true })
      .click();
    await page.waitForTimeout(100);
    const replayAt = await page.locator("video").evaluate((v) => v.currentTime);
    if (replayAt < 0.39 || replayAt > 1)
      throw new Error("Trim endpoint replay failed " + replayAt);
    await page
      .getByRole("button", { name: "Pause preview", exact: true })
      .click();
  }
  checks.push("trim-end replay regression: four consecutive passes");

  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "New recording" }),
  ).toBeVisible();
  if (
    !(await page.evaluate(() =>
      window.__swoopConfirms.some((m) => m.startsWith("Start a new take")),
    ))
  )
    throw new Error("Missing unsaved record replacement guard");
  checks.push("unsaved edit guarded before new recording");
  const own = page.locator('.source-grid button[data-self="true"]');
  await own.click();
  await page.getByRole("checkbox", { name: /System audio/ }).uncheck();
  if (await page.getByRole("checkbox", { name: /Minimize studio/ }).count())
    await page.getByRole("checkbox", { name: /Minimize studio/ }).uncheck();
  else await expect(page.locator(".capture-self-note")).toBeVisible();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Finish take" })).toBeVisible({
    timeout: 40000,
  });
  await page.waitForTimeout(1100);
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await page.waitForTimeout(400);
  await page
    .getByRole("button", { name: "Resume recording", exact: true })
    .click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Finish take", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish take" })).toBeHidden({
    timeout: 20000,
  });
  await expect(page.getByLabel("Project name")).toHaveValue(/^Take /, {
    timeout: 20000,
  });
  if (
    !(await page
      .locator(".timeline-footer")
      .textContent()
      .then((t) => /cursor samples/.test(t)))
  )
    throw new Error("No cursor samples");
  checks.push(
    "actual own-window capture + pause/resume + editor import + cursor track",
  );
  await saveTo("native-recorded-project.swoop");
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  checks.push("recorded media saved in portable project");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("720");
  await page.getByLabel("Export format").selectOption("webm");
  await saveTo("native-recorded-export.webm");
  await page.getByRole("button", { name: "Export WEBM", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 30000,
  });
  checks.push("actual recorded take renders through shared exporter");
  await page
    .getByRole("button", { name: "Load playground", exact: true })
    .click();
  await page.screenshot({
    path: packaged
      ? "artifacts/packaged-final.png"
      : "artifacts/native-final.png",
  });
  if (errors.length) throw new Error("Renderer errors: " + errors.join("; "));
  console.log(
    JSON.stringify(
      { passed: true, version: info.version, packaged, checks, errors },
      null,
      2,
    ),
  );
  await fs.writeFile(
    packaged
      ? "artifacts/packaged-e2e-results.json"
      : "artifacts/native-e2e-results.json",
    JSON.stringify(
      { passed: true, version: info.version, packaged, checks, errors },
      null,
      2,
    ),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: "artifacts/native-e2e-failure.png" })
      .catch(() => {});
  console.error(error);
  await fs.writeFile(
    "artifacts/native-e2e-results.json",
    JSON.stringify(
      { passed: false, checks, errors, error: String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
