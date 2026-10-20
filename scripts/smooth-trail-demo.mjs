import { _electron as electron, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
const root = process.cwd(),
  out = path.join(root, "artifacts/smooth-trail-test");
const env = {
  ...process.env,
  SWOOP_DATA_DIR: path.join(out, "motion-demo-profile"),
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
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.waitForSelector(".app-shell");
  await page
    .getByRole("button", { name: "Cursor", exact: true })
    .first()
    .click();
  for (const [tab, name] of [
    ["Pointer", "Presenter cursor"],
    ["Trail", "Ribbon trail"],
    ["Click", "Burst click effect"],
    ["Drag", "Elastic drag effect"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByLabel("Trim out seconds").fill("8.5");
  const file = path.join(out, "smooth-trail-motion-demo.mp4");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export quality").selectOption("1080");
  await page.getByLabel("Export format").selectOption("mp4");
  console.log(
    "EXPORTING built-in playground with continuous demo pointer movement",
  );
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeHidden({
    timeout: 60000,
  });
  await fs.writeFile(
    path.join(out, "motion-demo.json"),
    JSON.stringify(
      {
        file,
        basis:
          "Swoop built-in playground demo, with its continuous demo pointer data; not an additional desktop recording",
        version: "0.2.1",
        trimEnd: 8.5,
        bytes: (await fs.stat(file)).size,
      },
      null,
      2,
    ),
  );
  console.log(file);
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
