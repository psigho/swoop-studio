import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  out = path.resolve(
    process.env.SWOOP_EXPORT_DIR ??
      path.join(root, "artifacts/fresh-cursor-test"),
  );
const projectFile = path.join(out, "fresh-cursor-test.swoop");
const env = {
  ...process.env,
  SWOOP_DATA_DIR: path.join(out, "reexport-profile"),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: path.join(
    root,
    "release/v0.2.1/Swoop-Studio-win32-x64/Swoop-Studio.exe",
  ),
  cwd: root,
  env,
});
const errors = [];
let page;
try {
  page = await app.firstWindow();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.waitForSelector(".app-shell");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, projectFile);
  await page.getByRole("button", { name: "Open project · Ctrl+O" }).click();
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Fresh cursor field test",
  );
  const project = JSON.parse(await fs.readFile(projectFile, "utf8"));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("1080");
  await page.getByLabel("Export format").selectOption("mp4");
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(out, "fresh-cursor-test-1080p.mp4"),
  );
  console.log("EXPORTING recorded take with updated trail renderer");
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 180000,
  });
  await page.screenshot({ path: path.join(out, "editor.png") });
  const result = JSON.parse(
    await fs.readFile(path.join(out, "result.json"), "utf8"),
  );
  result.reexportedAt = new Date().toISOString();
  result.version = (
    await page.evaluate(() => window.swoop.getAppInfo())
  ).version;
  result.output = path.join(out, "fresh-cursor-test-1080p.mp4");
  result.project = projectFile;
  result.fastDragFix = true;
  result.errors = errors;
  result.passed = errors.length === 0;
  result.bytes = (await fs.stat(result.output)).size;
  await fs.writeFile(
    path.join(out, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log("EXPORTED " + result.output);
} catch (error) {
  if (page)
    await page
      .screenshot({ path: path.join(out, "reexport-failure.png") })
      .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
