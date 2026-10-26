import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const env = { ...process.env };
if (fs.existsSync("K:\\") && !env.electron_config_cache)
  env.electron_config_cache = "K:\\_cache\\electron";
const result = spawnSync(process.execPath, [path.join(root, "node_modules/electron/install.js")], {cwd: root, env, stdio: "inherit", windowsHide: true});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
