import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const folder = path.join(
  root,
  "release",
  "installers",
  version,
  "win-unpacked",
);
const executable = path.join(folder, "Swoop-Studio.exe");
if (!fs.existsSync(executable))
  throw new Error(
    "Build the installer candidate with npm run installer first.",
  );
const profile = fs.existsSync("K:\\")
  ? "K:\\_data\\swoop-studio-final-test"
  : path.join(root, "artifacts", "final-test-profile");
const env = { ...process.env, SWOOP_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [], {
  cwd: folder,
  env,
  detached: true,
  stdio: "ignore",
  windowsHide: false,
});
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("spawn", () => {
  console.log(
    JSON.stringify({
      version,
      pid: child.pid,
      executable,
      profile,
      installed: false,
    }),
  );
  child.unref();
});
