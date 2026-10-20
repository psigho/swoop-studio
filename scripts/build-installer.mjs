import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheRoot = process.env.SWOOP_BUILD_CACHE
  ? path.resolve(process.env.SWOOP_BUILD_CACHE)
  : fs.existsSync("K:\\")
    ? "K:\\_cache"
    : path.join(root, "artifacts", ".build-cache");
const env = {
  ...process.env,
  ELECTRON_CACHE: path.join(cacheRoot, "electron"),
  ELECTRON_BUILDER_CACHE: path.join(cacheRoot, "electron-builder"),
  TEMP: path.join(cacheRoot, "swoop-build-temp"),
  TMP: path.join(cacheRoot, "swoop-build-temp"),
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};
// Prevent a configured shell from turning Electron binaries into Node.js.
delete env.ELECTRON_RUN_AS_NODE;
for (const key of ["ELECTRON_CACHE", "ELECTRON_BUILDER_CACHE", "TEMP"])
  fs.mkdirSync(env[key], { recursive: true });

const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules", "electron-builder", "cli.js"),
    "--config",
    "electron-builder.cjs",
    "--win",
    "--x64",
    ...(process.argv.includes("--dir") ? ["--dir"] : []),
    "--publish",
    "never",
  ],
  { cwd: root, env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
