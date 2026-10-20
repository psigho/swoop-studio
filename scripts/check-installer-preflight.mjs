import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Compile and execute the actual .nsh macros in small, silent harnesses. These
// harnesses create no shortcuts, registry entries or uninstall registration.
const runFile = promisify(execFile);
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = require("../package.json");
const config = require("../electron-builder.cjs");
const cache =
  process.env.ELECTRON_BUILDER_CACHE ?? "K:\\_cache\\electron-builder";
const evidence = path.join(
  root,
  "artifacts",
  `installer-preflight-${manifest.version}`,
);
await fs.mkdir(evidence, { recursive: true });

async function findFile(
  directory,
  basename,
  maxDepth = 4,
  requiredFragment = "",
) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (
      entry.isFile() &&
      entry.name === basename &&
      candidate.includes(requiredFragment)
    )
      return candidate;
    if (entry.isDirectory() && maxDepth > 0) {
      const nested = await findFile(
        candidate,
        basename,
        maxDepth - 1,
        requiredFragment,
      );
      if (nested) return nested;
    }
  }
}
const compiler =
  process.env.SWOOP_NSIS_COMPILER ??
  (await findFile(path.join(cache, "nsis-3.0.4.1"), "makensis.exe"));
assert.ok(
  compiler,
  "Build the installer first to populate its pinned NSIS compiler cache.",
);
const plugin = await findFile(
  path.join(cache, "nsis-resources-3.4.1"),
  "nsProcess.dll",
  4,
  "x86-unicode",
);
assert.ok(plugin && plugin.includes("x86-unicode"));
const pluginDirectory = path.dirname(plugin);
const includeDirectory = path.join(
  root,
  "node_modules",
  "app-builder-lib",
  "templates",
  "nsis",
  "include",
);
const preflight = path.join(root, config.nsis.include);
assert.deepEqual(config.nsis.preCompressedFileExtensions, []);
for (const file of [
  "electron/dependency-check.cjs",
  "electron/dependency-check.html",
])
  assert.ok(config.files.includes(file));
const quote = (value) => value.replaceAll("$", "$$");

async function compile(name, body) {
  const executable = path.join(evidence, `${name}.exe`);
  const source = path.join(evidence, `${name}.nsi`);
  await fs.writeFile(
    source,
    `Unicode true\nRequestExecutionLevel user\nSilentInstall silent\nName "Swoop preflight verification"\nOutFile "${quote(executable)}"\n!addincludedir "${quote(includeDirectory)}"\n!addplugindir /x86-unicode "${quote(pluginDirectory)}"\n${body}\n`,
  );
  await runFile(compiler, ["/V2", source], {
    windowsHide: true,
    timeout: 30000,
  });
  return executable;
}
async function runHarness(
  name,
  target,
  macro,
  executableName = "dependency-fixture.exe",
) {
  const executable = await compile(
    name,
    `!define APP_EXECUTABLE_FILENAME "${executableName}"\n!include "${quote(preflight)}"\nFunction .onInit\n !insertmacro customInit\nFunctionEnd\nSection\n StrCpy $INSTDIR "${quote(target)}"\n !insertmacro ${macro}\n SetErrorLevel 0\nSectionEnd`,
  );
  try {
    await runFile(executable, [], { windowsHide: true, timeout: 15000 });
    return 0;
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return error.code;
  }
}

const fixture = await compile(
  "dependency-fixture",
  `!include "FileFunc.nsh"\nSection\n \${GetParameters} $0\n \${GetOptions} $0 "--dependency-report=" $1\n IfErrors badArguments\n StrCmp $1 "$EXEDIR\\dependency-report.json" 0 badArguments\n FileOpen $2 "$EXEDIR\\mode.txt" r\n FileRead $2 $3\n FileClose $2\n StrCmp $3 "missing" missingReport\n StrCmp $3 "empty" emptyReport\n FileOpen $2 $1 w\n FileWrite $2 '{"passed":true,"fixture":true}'\n FileClose $2\n StrCmp $3 "fail" failed\n SetErrorLevel 0\n Quit\n emptyReport:\n FileOpen $2 $1 w\n FileClose $2\n missingReport:\n SetErrorLevel 0\n Quit\n failed:\n SetErrorLevel 1\n Quit\n badArguments:\n SetErrorLevel 4\n Quit\nSectionEnd`,
);
const checks = [];
const writable = path.join(evidence, "writable target with spaces");
assert.equal(
  await runHarness("writable", writable, "swoopCheckWritableTarget"),
  0,
);
assert.deepEqual(await fs.readdir(writable), []);
checks.push(
  "Windows 10+ AMD64 preflight and actual writable-directory probe pass; probe leaves no files.",
);
const blocked = path.join(evidence, "target-is-a-file");
await fs.writeFile(blocked, "Existing file must remain unchanged.");
assert.notEqual(
  await runHarness("blocked", blocked, "swoopCheckWritableTarget"),
  0,
);
assert.equal(
  await fs.readFile(blocked, "utf8"),
  "Existing file must remain unchanged.",
);
checks.push(
  "Unwritable target fails before extraction and preserves the existing file.",
);
const dependencyTarget = path.join(evidence, "bundled runtime with spaces");
await fs.mkdir(dependencyTarget, { recursive: true });
await fs.copyFile(
  fixture,
  path.join(dependencyTarget, "dependency-fixture.exe"),
);
for (const mode of ["pass", "fail", "missing", "empty"]) {
  await fs.writeFile(path.join(dependencyTarget, "mode.txt"), mode);
  if (mode === "missing")
    await fs.writeFile(
      path.join(dependencyTarget, "dependency-report.json"),
      '{"passed":true,"stale":true}',
    );
  const result = await runHarness(
    `dependency-${mode}`,
    dependencyTarget,
    "swoopCheckBundledDependencies",
  );
  if (mode === "pass") assert.equal(result, 0);
  else assert.notEqual(result, 0);
}
checks.push(
  "Fresh success report plus zero exit passes; failure exit, missing/stale report and empty report all stop Setup.",
);
const missingTarget = path.join(evidence, "missing executable");
await fs.mkdir(missingTarget, { recursive: true });
assert.notEqual(
  await runHarness(
    "missing-executable",
    missingTarget,
    "swoopCheckBundledDependencies",
  ),
  0,
);
checks.push(
  "An executable that cannot start stops Setup, including loader-level missing dependencies.",
);

const runningName = "installer-running-fixture.exe";
const runningFixture = await compile(
  "installer-running-fixture",
  "Section\n Sleep 30000\nSectionEnd",
);
const child = spawn(runningFixture, [], { windowsHide: true, stdio: "ignore" });
await new Promise((resolve, reject) => {
  child.once("spawn", resolve);
  child.once("error", reject);
});
try {
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.notEqual(
    await runHarness(
      "running-app",
      writable,
      "customCheckAppRunning",
      runningName,
    ),
    0,
  );
  assert.equal(
    child.exitCode,
    null,
    "Installer must not terminate the open process.",
  );
} finally {
  child.kill(); // Only this script's dedicated, disposable fixture process.
}
checks.push(
  "Open-app guard cancels silently without killing the running app fixture.",
);
const actualApp = process.argv
  .find((argument) => argument.startsWith("--app="))
  ?.slice(6);
if (actualApp) {
  const application = path.resolve(actualApp);
  assert.ok((await fs.stat(application)).isFile());
  assert.equal(
    await runHarness(
      "actual-packaged-runtime",
      path.dirname(application),
      "swoopCheckBundledDependencies",
      path.basename(application),
    ),
    0,
  );
  const report = JSON.parse(
    await fs.readFile(
      path.join(path.dirname(application), "dependency-report.json"),
      "utf8",
    ),
  );
  assert.equal(report.passed, true);
  checks.push(
    "Actual packaged Electron app passes through the same NSIS dependency-check macro with a fresh success report.",
  );
}
const result = {
  passed: true,
  version: manifest.version,
  checks,
  fullInstallerExecuted: false,
  registrationChanged: false,
};
await fs.writeFile(
  path.join(evidence, "results.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
