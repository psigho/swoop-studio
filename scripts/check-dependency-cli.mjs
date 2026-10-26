import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const executable =
  process.env.SWOOP_DEPENDENCY_APP ||
  path.join(root, "node_modules/electron/dist/electron.exe");
const packaged = Boolean(process.env.SWOOP_DEPENDENCY_APP);
const out = path.join(root, "artifacts", `dependency-cli-${version}`);
await fs.mkdir(out, { recursive: true });
const report = path.join(out, "dependency-report.json");
await fs.rm(report, { force: true });
const env = {
  ...process.env,
  FFMPEG_BIN: "Z:\\not-a-real-encoder.exe",
  UIOHOOK_NAPI_PREBUILD: "Z:\\not-a-native-addon",
  npm_config_platform: "linux",
  npm_config_arch: "ia32",
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
for (const key of Object.keys(env)) if (/^path$/i.test(key)) delete env[key];
env.Path = [
  process.env.SystemRoot || "C:\\Windows",
  path.join(process.env.SystemRoot || "C:\\Windows", "System32"),
].join(";");
const args = [
  ...(packaged ? [] : [root]),
  "--check-dependencies",
  `--dependency-report=${report}`,
  `--dependency-work-dir=${out}`,
];
const result = spawnSync(executable, args, {
  cwd: root,
  env,
  encoding: "utf8",
  windowsHide: true,
  timeout: 85000,
  maxBuffer: 512 * 1024,
});
console.log(result.stdout);
if (result.error || result.status !== 0) {
  console.error(result.stderr);
  throw result.error || new Error("Dependency CLI exit " + result.status);
}
const data = JSON.parse(await fs.readFile(report, "utf8"));
if (!data.passed || data.checks.length !== 6)
  throw new Error("Invalid successful report");
await fs.writeFile(
  path.join(out, "cli-verification.json"),
  JSON.stringify(
    {
      passed: true,
      version,
      packaged,
      checks: data.checks,
      systemEncoderPathExcluded: true,
      loaderEnvironmentOverridesIgnored: true,
      report,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(data, null, 2));
