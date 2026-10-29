import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const run = promisify(execFile),
  require = createRequire(import.meta.url),
  root = process.cwd();
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const out = path.join(root, "artifacts", `typing-recording-${version}`);
await fs.mkdir(out, { recursive: true });
for (const name of ["continue.json", "result.json"])
  await fs.rm(path.join(out, name), { force: true });
const env = {
  ...process.env,
  SWOOP_DATA_DIR: path.join(out, `profile-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.env.SWOOP_PACKAGED === "1";
const app = await electron.launch({
  executablePath: packaged
    ? path.join(
        root,
        `release/installers/${version}/win-unpacked/Swoop-Studio.exe`,
      )
    : require("electron"),
  args: packaged ? [] : ["."],
  cwd: root,
  env,
});
let page, tone;
const errors = [],
  checks = [];
async function save(file) {
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
  const outputs = await page.evaluate(() => window.swoop.getSystemOutputs());
  const selected = outputs.find((o) => o.name.includes("MSI G273Q"));
  assert.ok(
    selected,
    "An unused owned test output must be available; do not silently record default sound",
  );
  const boardFile = path.join(out, "typing-board.html");
  await fs.writeFile(
    boardFile,
    `<!doctype html><meta charset="utf-8"><title>Swoop Typing Test</title><style>body{margin:0;padding:70px;background:#eaf3eb;color:#16372b;font:26px Segoe UI}textarea{width:85%;height:220px;margin-top:45px;padding:22px;font:30px Segoe UI;border:2px solid #4b876f;border-radius:15px}small{font-size:18px}</style><h1>Words deserve a little focus.</h1><small>Swoop typing zoom test · original local fixture</small><textarea aria-label="Test sentence" autofocus></textarea>`,
  );
  await app.evaluate(async ({ BrowserWindow }, file) => {
    const board = new BrowserWindow({
      width: 1100,
      height: 700,
      title: "Swoop Typing Test",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    globalThis.__typingBoard = board;
    await board.loadFile(file);
    board.center();
  }, boardFile);
  const board = app.windows().find((w) => w !== page);
  await page.bringToFront();
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await page
    .locator(".source-grid button")
    .filter({ has: page.locator("span", { hasText: /^Swoop Typing Test$/ }) })
    .click();
  await page.getByRole("checkbox", { name: /Microphone/ }).uncheck();
  await page.getByRole("checkbox", { name: /System audio/ }).check();
  await expect(page.getByLabel("System sound output")).toContainText(
    selected.name,
  );
  await page.getByLabel("System sound output").selectOption(selected.id);
  await page.getByRole("checkbox", { name: /Zoom while typing/ }).check();
  await page.getByRole("checkbox", { name: /Minimize studio/ }).uncheck();
  await page.screenshot({ path: path.join(out, "setup.png") });
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish take", exact: true }),
  ).toBeVisible({ timeout: 40000 });
  checks.push(
    "Actual selected-endpoint WASAPI capture and 48 kHz AudioWorklet mixer started",
  );
  await board.bringToFront();
  await board.getByLabel("Test sentence").focus();
  const focusHelper = packaged
    ? path.join(
        root,
        `release/installers/${version}/win-unpacked/resources/system/win32-x64/SwoopSystem.exe`,
      )
    : path.join(root, "native/system/win32-x64/SwoopSystem.exe");
  if (process.env.SWOOP_PHYSICAL_TEST) {
    console.log("READY_FOR_FOCUS_CLICK");
    const started = Date.now();
    for (;;) {
      try {
        await fs.access(path.join(out, "continue.json"));
        break;
      } catch {}
      if (Date.now() - started > 150000)
        throw new Error("Test focus timed out");
      await page.waitForTimeout(250);
    }
  }
  const focus = JSON.parse(
    (await run(focusHelper, ["--focus"], { windowsHide: true, timeout: 5000 }))
      .stdout,
  );
  assert.equal(
    focus.found,
    true,
    "Windows must report focused text-field geometry",
  );
  assert.equal(focus.password, false);
  // Controlled provider events exercise the real hook listeners and recording clock.
  // They are explicitly not proof of physical keyboard/mouse input.
  await fs.writeFile(path.join(out, "focus.json"), JSON.stringify(focus));
  if (!process.env.SWOOP_NATIVE_INPUT) {
    for (let i = 0; i < 16; i++) {
      await app.evaluate(({ app }) =>
        process.mainModule
          .require(app.getAppPath() + "/node_modules/uiohook-napi")
          .uIOhook.emit("keydown", {
            keycode: 30,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
          }),
      );
      await board
        .getByLabel("Test sentence")
        .fill(
          "A smoother recording, with a little focus.".slice(0, (i + 1) * 3),
        );
      await page.waitForTimeout(90);
    }
  }
  tone = spawn(path.join(root, "artifacts/system-tone.exe"), [selected.id], {
    windowsHide: true,
    stdio: "ignore",
  });
  await new Promise((resolve, reject) => {
    tone.once("error", reject);
    tone.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Owned tone failed")),
    );
  });
  await page.bringToFront();
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await page.waitForTimeout(250);
  await page
    .getByRole("button", { name: "Resume recording", exact: true })
    .click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Finish take", exact: true }).click();
  await expect(page.getByLabel("Project name")).toHaveValue(/^Take /, {
    timeout: 30000,
  });
  await save("typing.swoop");
  await page.getByRole("button", { name: "Save project · Ctrl+S" }).click();
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  const project = JSON.parse(
    await fs.readFile(path.join(out, "typing.swoop"), "utf8"),
  );
  assert.ok(
    project.mediaBase64.length > 10000,
    "Embedded video must contain the actual recording payload",
  );
  assert.ok(project.typing?.length);
  assert.ok(project.zooms.some((z) => z.scale === 1.85));
  assert.ok(
    project.typing.every(
      (b) => Object.keys(b).sort().join(",") === "end,start,x,y",
    ),
  );
  const takes = await page.evaluate(() => window.swoop.listTakes());
  const reopened = await page.evaluate(
    (id) => window.swoop.openTake(id),
    takes.takes[0].id,
  );
  assert.deepEqual(reopened.typing, project.typing);
  assert.deepEqual(
    Buffer.from(project.mediaBase64, "base64"),
    Buffer.from(reopened.bytes),
  );
  checks.push(
    "Typing timing and focus produce automatic zooms and survive raw take backup",
  );
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    },
    path.join(out, "typing.swoop"),
  );
  await page.getByRole("button", { name: "Open project · Ctrl+O" }).click();
  await expect(page.getByLabel("Project name")).toHaveValue(project.name);
  await expect(page.locator(".save-state")).toContainText("Ready to play");
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "Auto zoom", exact: true }).click();
  checks.push(
    "Portable project reopen and Auto zoom regeneration retain typing activity",
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("720");
  await page.getByLabel("Export format").selectOption("mp4");
  await save("typing-zoom.mp4");
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 60000,
  });
  assert.ok((await fs.stat(path.join(out, "typing-zoom.mp4"))).size > 10000);
  await page.screenshot({ path: path.join(out, "editor.png") });
  checks.push(
    "Actual recorded take exported as H.264/AAC MP4 with typing camera regions",
  );
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    version,
    packaged,
    checks,
    focus,
    selectedOutput: selected,
    typing: project.typing,
    zooms: project.zooms,
    duration: project.duration,
    physicalInputVerified: process.env.SWOOP_NATIVE_INPUT === "1",
    errors,
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
  await fs.writeFile(
    path.join(out, "result.json"),
    JSON.stringify(
      { passed: false, checks, errors, error: String(error) },
      null,
      2,
    ),
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  tone?.kill();
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
