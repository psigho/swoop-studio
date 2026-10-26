import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve("native/capture");
const receipt = (file) => ({
  path: file,
  sha256: createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex"),
});
fs.copyFileSync("LICENSE", path.join(root, "LICENSE"));
const manifest = {
  schemaVersion: 1,
  name: "SwoopCapture",
  version: "1.0",
  license: "MIT",
  platform: "win32-x64",
  minimumWindowsBuild: 19041,
  binary: receipt("win32-x64/SwoopCapture.exe"),
  sources: [
    "capture.cpp",
    "build.sh",
    "README.md",
    "imports.txt",
    "LICENSE",
  ].map(receipt),
  systemApis: [
    "Windows.Graphics.Capture",
    "Direct3D 11",
    "Windows Imaging Component",
  ],
  compiler: "MSYS2 UCRT64 GCC 16.2.0; static C++ and GCC support runtimes",
  reproducesByteIdentically: false,
};
fs.writeFileSync(
  path.join(root, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest.binary));
