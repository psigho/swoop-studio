import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve("native/system");
const compiledSource = fs
  .readFileSync(path.join(root, "source.sha256"), "utf8")
  .trim();
const currentSource = createHash("sha256")
  .update(fs.readFileSync(path.join(root, "system.cpp")))
  .digest("hex");
if (compiledSource !== currentSource)
  throw new Error("Rebuild the system helper before creating its manifest.");
const receipt = (file) => ({
  path: file,
  sha256: createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex"),
});
fs.copyFileSync("LICENSE", path.join(root, "LICENSE"));
const manifest = {
  schemaVersion: 1,
  name: "SwoopSystem",
  version: "1.0",
  license: "MIT",
  platform: "win32-x64",
  minimumWindowsBuild: 19041,
  binary: receipt("win32-x64/SwoopSystem.exe"),
  sources: [
    "system.cpp",
    "build.sh",
    "README.md",
    "imports.txt",
    "source.sha256",
    "LICENSE",
  ].map(receipt),
  systemApis: ["Windows Audio Session API (WASAPI)", "Windows UI Automation"],
  compiler: "MSYS2 UCRT64 GCC 16.2.0; static C++ and GCC support runtimes",
  reproducesByteIdentically: false,
};
fs.writeFileSync(
  path.join(root, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest.binary));
