import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { extractFile, listPackage } from "@electron/asar";
const root = process.cwd(),
  version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const appDir = path.join(
  root,
  "release",
  "installers",
  version,
  "win-unpacked",
);
const out = path.join(root, "artifacts", "release-review", version);
await fs.mkdir(out, { recursive: true });
const env = { ...process.env, SWOOP_DATA_DIR: path.join(out, "smoke-profile") };
for (const key of Object.keys(env))
  if (/^(PATH|FFMPEG_PATH|ELECTRON_RUN_AS_NODE)$/i.test(key)) delete env[key];
const win = process.env.SystemRoot ?? "C:\\Windows";
env.Path = [
  path.join(win, "System32"),
  win,
  path.join(win, "System32", "WindowsPowerShell", "v1.0"),
].join(";");
const errors = [],
  checks = [];
const app = await electron.launch({
  executablePath: path.join(appDir, "Swoop-Studio.exe"),
  cwd: root,
  env,
});
try {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.hide()),
  );
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.waitForSelector(".app-shell");
  const info = await page.evaluate(() => window.swoop.getAppInfo());
  if (info.version !== version || !info.ffmpeg || !info.clicksSupported)
    throw new Error(
      "Packaged native capabilities missing: " + JSON.stringify(info),
    );
  checks.push(
    "Installer payload starts with native pointer hook and bundled FFmpeg, without global encoder PATH.",
  );
  const archive = path.join(appDir, "resources", "app.asar");
  for (const entry of listPackage(archive).filter(
    (p) => /^[/\\]dist[/\\]/.test(p) && /\.(js|css|html)$/.test(p),
  )) {
    const relative = entry.replace(/^[/\\]/, "");
    const file = await fs.readFile(path.join(root, relative));
    if (!extractFile(archive, relative).equals(file))
      throw new Error("Packaged UI differs from reviewed build: " + relative);
  }
  checks.push("Packaged HTML, JS and CSS match the current production build.");
  const projectFile = path.join(out, "smoke-project.swoop");
  await page.getByLabel("Project name").fill("Release smoke");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, projectFile);
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  const saved = JSON.parse(await fs.readFile(projectFile, "utf8"));
  if (saved.name !== "Release smoke") throw new Error("Saved name mismatch");
  await page.getByLabel("Project name").fill("Changed for reopen");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, projectFile);
  await page.getByRole("button", { name: "Open project · Ctrl+O" }).click();
  await expect(page.getByLabel("Project name")).toHaveValue("Release smoke");
  checks.push("Packaged save/reopen roundtrip.");
  await page.getByLabel("Trim out seconds").fill("1.5");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("720");
  await page.getByLabel("Export format").selectOption("mp4");
  const video = path.join(out, "bundled-mp4-ui-export.mp4");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, video);
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 45000,
  });
  if ((await fs.stat(video)).size < 10000) throw new Error("MP4 export empty");
  const encoder = path.join(appDir, "resources", "encoder", "ffmpeg.exe");
  execFileSync(
    encoder,
    [
      "-v",
      "error",
      "-i",
      video,
      "-fps_mode",
      "passthrough",
      "-enc_time_base",
      "demux",
      "-f",
      "null",
      "-",
    ],
    { windowsHide: true, timeout: 20000 },
  );
  checks.push(
    "Packaged UI renders and saves MP4 through bundled encoder; output fully decodes.",
  );
  if (errors.length) throw new Error(errors.join("; "));
  const result = {
    passed: true,
    version,
    checkedAt: new Date().toISOString(),
    checks,
    errors,
    userWindowTouched: false,
    installerExecuted: false,
    githubUploaded: false,
  };
  await fs.writeFile(
    path.join(out, "packaged-smoke.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
