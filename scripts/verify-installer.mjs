import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFile, listPackage } from "@electron/asar";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const manifest = require("../package.json");
const output = path.join(root, "release", "installers", manifest.version);
const unpacked = path.join(output, "win-unpacked");
const archive = path.join(unpacked, "resources", "app.asar");
const installer = path.join(
  output,
  `Swoop-Studio-Setup-${manifest.version}-x64.exe`,
);
const evidence = path.join(root, "artifacts", `installer-${manifest.version}`);
await fs.mkdir(evidence, { recursive: true });
const entries = listPackage(archive).map((entry) =>
  entry.replaceAll("\\", "/"),
);
const checks = [];
assert.ok(entries.includes("/dist/index.html"));
for (const source of [
  "electron/main.cjs",
  "electron/preload.cjs",
  "electron/pointer-session.cjs",
  "electron/data-path.cjs",
  "electron/take-store.cjs",
  "electron/dependency-check.cjs",
  "electron/dependency-check.html",
])
  assert.deepEqual(
    extractFile(archive, source),
    await fs.readFile(path.join(root, source)),
  );
const packedManifest = JSON.parse(
  extractFile(archive, "package.json").toString(),
);
assert.equal(packedManifest.version, manifest.version);
checks.push(
  "Packaged app version and seven runtime sources match the reviewed checkout.",
);

const includedDemo = extractFile(
  archive,
  path.join("dist", "demo", "Swoop-Studio-Demo.mp4"),
);
const demoSource = await fs.readFile(
  path.join(root, "public/demo/Swoop-Studio-Demo.mp4"),
);
assert.deepEqual(includedDemo, demoSource);
checks.push("Included demo video exactly matches the reviewed local original.");

for (const entry of entries) {
  assert.ok(
    !/^\/(?:artifacts|scripts|tests|src|release|\.git|\.impeccable)(?:\/|$)/.test(
      entry,
    ),
    `Private or development content included: ${entry}`,
  );
  assert.ok(!/^\/electron\/.*\.test\.cjs$/.test(entry));
  assert.ok(
    !/^\/node_modules\/(?:electron-builder|app-builder-lib|@playwright|typescript|vite|@electron|tsx)(?:\/|$)/.test(
      entry,
    ),
    `Build tool included: ${entry}`,
  );
}
assert.ok(
  entries.some((entry) => entry.startsWith("/node_modules/uiohook-napi/")),
);
checks.push(
  "Allowlist excludes local recordings/projects, source tests, Git state and build tools.",
);

const nativeFiles = await fs.readdir(
  path.join(
    unpacked,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "uiohook-napi",
  ),
  { recursive: true },
);
assert.ok(nativeFiles.some((file) => /win32-x64[/\\].*\.node$/.test(file)));
checks.push("Windows x64 native pointer hook is physically unpacked.");

const encoder = path.join(unpacked, "resources", "encoder", "ffmpeg.exe");
assert.ok(
  !entries.some((entry) => entry.startsWith("/node_modules/ffmpeg-static/")),
);
const encoderRoot = path.join(root, "vendor", "ffmpeg");
const encoderManifestPath = path.join(encoderRoot, "manifest.json");
const encoderManifest = JSON.parse(
  await fs.readFile(encoderManifestPath, "utf8"),
);
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
assert.deepEqual(
  await fs.readFile(path.join(unpacked, "resources", "LICENSE-Swoop.txt")),
  await fs.readFile(path.join(root, "LICENSE")),
);
const hookSourceRoot = path.join(root, "vendor", "uiohook");
const hookManifest = JSON.parse(
  await fs.readFile(path.join(hookSourceRoot, "manifest.json"), "utf8"),
);
assert.equal(
  await sha256(path.join(hookSourceRoot, hookManifest.archive.file)),
  hookManifest.archive.sha256,
);
assert.equal(
  await sha256(path.join(unpacked, hookManifest.shippedNative.packagedPath)),
  hookManifest.shippedNative.sha256,
);
for (const file of [
  "SOURCE.md",
  "manifest.json",
  hookManifest.archive.file,
  ...hookManifest.licenses.map((license) => license.file),
]) {
  assert.deepEqual(
    await fs.readFile(
      path.join(unpacked, "resources", "third-party", "uiohook", file),
    ),
    await fs.readFile(path.join(hookSourceRoot, file)),
  );
}
for (const license of hookManifest.licenses)
  assert.equal(
    await sha256(path.join(hookSourceRoot, license.file)),
    license.sha256,
  );
const hookArchiveEntries = execFileSync(
  "tar",
  ["-tf", path.join(hookSourceRoot, hookManifest.archive.file)],
  { encoding: "utf8", windowsHide: true, timeout: 30000 },
);
for (const input of hookManifest.nativeBuildInputs)
  assert.ok(
    hookArchiveEntries.split(/\r?\n/).includes("package/" + input),
    "Native hook build input absent: " + input,
  );
checks.push(
  "Application MIT license and native hook MIT/LGPL notices, exact source archive and rebuild instructions accompany the installer.",
);
function sourceFile(relative) {
  assert.equal(typeof relative, "string");
  const resolved = path.resolve(encoderRoot, relative);
  assert.ok(
    resolved.startsWith(encoderRoot + path.sep),
    "Encoder source path escapes vendor directory",
  );
  return resolved;
}
async function verifyReceipt(receipt, label) {
  assert.match(
    receipt?.sha256 ?? "",
    /^[a-f0-9]{64}$/,
    `${label} SHA256 missing`,
  );
  const file = sourceFile(receipt.path);
  assert.equal(await sha256(file), receipt.sha256, `${label} hash mismatch`);
  return file;
}
const reviewedEncoder = await verifyReceipt(
  encoderManifest.binary,
  "Encoder binary",
);
assert.equal(
  path.resolve(reviewedEncoder),
  path.resolve(encoderRoot, "win32-x64", "ffmpeg.exe"),
);
assert.equal(
  await sha256(encoder),
  encoderManifest.binary.sha256,
  "Packaged encoder differs from reviewed build",
);
const recipe = await verifyReceipt(
  encoderManifest.recipe,
  "Encoder build recipe",
);
assert.equal(path.basename(recipe), "build.sh");
assert.ok((await fs.stat(recipe)).size > 100, "Encoder build recipe is empty");
assert.ok(
  Array.isArray(encoderManifest.sources) &&
    encoderManifest.sources.length === 2,
);
const verifiedSources = [];
for (const receipt of encoderManifest.sources) {
  const file = await verifyReceipt(receipt, "Corresponding source archive");
  assert.ok(path.relative(encoderRoot, file).startsWith("source" + path.sep));
  const contents = execFileSync("tar", ["-tf", file], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  })
    .split(/\r?\n/)
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter(Boolean);
  assert.ok(
    contents.length > 100,
    "Corresponding source archive is incomplete",
  );
  assert.ok(
    contents.some((entry) => /(?:^|\/)configure$/.test(entry)),
    "Source configure script missing",
  );
  if (/ffmpeg/i.test(path.basename(file))) {
    assert.ok(
      contents.some((entry) => /(?:^|\/)libavcodec\/avcodec\.h$/.test(entry)),
    );
    assert.ok(contents.some((entry) => /(?:^|\/)COPYING\.GPLv2$/.test(entry)));
    verifiedSources.push("FFmpeg");
  } else if (/x264/i.test(path.basename(file))) {
    assert.ok(contents.some((entry) => /(?:^|\/)x264\.h$/.test(entry)));
    assert.ok(contents.some((entry) => /(?:^|\/)COPYING$/.test(entry)));
    verifiedSources.push("x264");
  } else assert.fail("Unexpected corresponding source archive: " + file);
}
assert.deepEqual(verifiedSources.sort(), ["FFmpeg", "x264"]);
assert.ok(
  Array.isArray(encoderManifest.licenseFiles) &&
    encoderManifest.licenseFiles.length >= 2,
);
for (const receipt of encoderManifest.licenseFiles) {
  await verifyReceipt(receipt, "Encoder license");
  assert.equal(
    await sha256(path.join(unpacked, "resources", "encoder", receipt.path)),
    receipt.sha256,
  );
}
for (const file of ["manifest.json", "build.sh", "SOURCE.md"])
  assert.deepEqual(
    await fs.readFile(path.join(unpacked, "resources", "encoder", file)),
    await fs.readFile(path.join(encoderRoot, file)),
  );
checks.push(
  "Self-built encoder, build recipe and license files match reviewed hashes; full FFmpeg and x264 source archives are present and verified locally for release distribution.",
);
const ffmpegVersion = execFileSync(encoder, ["-hide_banner", "-version"], {
  encoding: "utf8",
  windowsHide: true,
  timeout: 10000,
})
  .split("\n")[0]
  .trim();
const probe = path.join(evidence, "bundled-encoder-probe.mp4");
execFileSync(
  encoder,
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x162c26:s=64x64:d=0.25",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    probe,
  ],
  { windowsHide: true, timeout: 30000 },
);
execFileSync(
  encoder,
  ["-hide_banner", "-loglevel", "error", "-i", probe, "-f", "null", "-"],
  {
    windowsHide: true,
    timeout: 30000,
  },
);
checks.push(
  "Bundled FFmpeg runs from resources/encoder and encodes/decodes H.264 MP4.",
);

for (const notice of ["NOTICES.md", "ffmpeg-GPL-3.0.txt", "ffmpeg-BUILD.txt"])
  assert.ok(
    (await fs.stat(path.join(unpacked, "resources", "third-party", notice)))
      .size > 100,
  );
checks.push(
  "Third-party notices and the encoder source/build instructions accompany the app.",
);

const installerInfo = await fs.stat(installer);
assert.ok(installerInfo.size > 10 * 1024 * 1024);
const hash = createHash("sha256");
for await (const chunk of createReadStream(installer)) hash.update(chunk);
const result = {
  passed: true,
  version: manifest.version,
  installer,
  bytes: installerInfo.size,
  sha256: hash.digest("hex"),
  ffmpegVersion,
  encoderSha256: encoderManifest.binary.sha256,
  encoderSources: encoderManifest.sources,
  checks,
  unsigned: true,
  installerExecuted: false,
  installationAndUninstallTested: false,
  githubUploaded: false,
  publicEncoderSourceDistributionPending: false,
  publicEncoderSourcesUploaded: false,
};
await fs.writeFile(
  path.join(evidence, "verification.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
await fs.writeFile(
  `${installer}.sha256`,
  `${result.sha256}  ${path.basename(installer)}\n`,
);
console.log(JSON.stringify(result, null, 2));
