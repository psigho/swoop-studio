"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  checkDependencies,
  prepareDependencyCheck,
} = require("./dependency-check.cjs");
function fixture(extra = {}) {
  const calls = [];
  let starts = 0;
  const options = {
    applicationRoot: "K:\\App\\resources\\app.asar",
    executableDirectory: "K:\\App",
    workDirectory: "K:\\scratch",
    version: "0.2.5",
    platform: "win32",
    architecture: "x64",
    release: "10.0.22631",
    exists: () => true,
    loadNative: (file) => {
      calls.push(["native", file]);
      return {
        start() {
          starts++;
        },
        stop() {},
      };
    },
    runEncoder: async (file, args) => {
      calls.push(["encoder", file, args]);
      return { stdout: "ffmpeg version bundled" };
    },
    browserProbe: async () => ({
      width: 1920,
      height: 1080,
      duration: 8.486,
      captureAPI: true,
      recordingAPI: true,
    }),
    ...extra,
  };
  return { options, calls, starts: () => starts };
}
test("offline check validates exact shipped dependencies without starting pointer capture", async () => {
  const env = fixture();
  const report = await checkDependencies(env.options);
  assert.equal(report.passed, true);
  assert.equal(report.checks.length, 5);
  assert.equal(env.starts(), 0);
  const native = env.calls.find((c) => c[0] === "native")[1];
  const encoders = env.calls.filter((c) => c[0] === "encoder");
  assert.match(native, /app\.asar\.unpacked.*win32-x64.*uiohook-napi\.node/);
  assert.equal(encoders.length, 3);
  assert.ok(
    encoders.every(
      (c) => c[1] === path.join("K:\\App\\resources", "encoder", "ffmpeg.exe"),
    ),
  );
});
test("source checkout checks the reviewed vendor encoder rather than a package loader", async () => {
  const applicationRoot = "K:\\App\\source";
  const env = fixture({ applicationRoot });
  const report = await checkDependencies(env.options);
  assert.equal(report.passed, true);
  assert.ok(
    env.calls
      .filter((call) => call[0] === "encoder")
      .every(
        (call) =>
          call[1] ===
          path.join(
            applicationRoot,
            "vendor",
            "ffmpeg",
            "win32-x64",
            "ffmpeg.exe",
          ),
      ),
  );
});
test("unsupported Windows architecture or OS stops before loading dependencies", async () => {
  for (const patch of [
    { platform: "linux" },
    { architecture: "ia32" },
    { release: "6.3.9600" },
  ]) {
    const env = fixture(patch);
    const report = await checkDependencies(env.options);
    assert.equal(report.passed, false);
    assert.equal(env.calls.length, 0);
    assert.equal(report.failures[0].id, "windows");
  }
});
test("missing runtime data fails with the missing filename instead of a false success", async () => {
  const env = fixture({ exists: (file) => !file.endsWith("icudtl.dat") });
  const report = await checkDependencies(env.options);
  assert.equal(report.passed, false);
  assert.match(report.summary, /icudtl\.dat/);
  assert.equal(report.failures[0].id, "runtime");
});
test("a missing native addon is rejected before environment-dependent loaders can run", async () => {
  const env = fixture({ exists: (file) => !file.endsWith(".node") });
  const report = await checkDependencies(env.options);
  assert.equal(report.passed, false);
  assert.equal(report.failures[0].id, "pointer");
  assert.equal(env.calls.filter((c) => c[0] === "native").length, 0);
});
test("native system dependency errors are retained with repair guidance", async () => {
  const env = fixture({
    loadNative: () => {
      throw new Error("A required Windows DLL could not load.");
    },
  });
  const report = await checkDependencies(env.options);
  assert.equal(report.passed, false);
  assert.match(report.summary, /Windows DLL/);
  assert.match(report.failures[0].hint, /Windows/);
});
test("missing bundled encoder never falls back to another encoder on PATH", async () => {
  const env = fixture({ exists: (file) => !file.endsWith("ffmpeg.exe") });
  const report = await checkDependencies(env.options);
  assert.equal(report.passed, false);
  assert.equal(report.failures[0].id, "encoder");
  assert.equal(env.calls.filter((c) => c[0] === "encoder").length, 0);
});
test("an encoder that starts but cannot encode is reported as a dependency failure", async () => {
  const env = fixture({
    runEncoder: async (_file, args) => {
      if (args.includes("libx264")) throw new Error("libx264 unavailable");
      return { stdout: "ffmpeg" };
    },
  });
  const report = await checkDependencies(env.options);
  assert.equal(report.passed, false);
  assert.match(report.summary, /libx264 unavailable/);
});
test("missing demo and browser media decoding failures cannot pass setup", async () => {
  for (const patch of [
    { exists: (file) => !file.endsWith(".mp4") },
    {
      browserProbe: async () => {
        throw new Error("Media decoding failed");
      },
    },
  ]) {
    const report = await checkDependencies(fixture(patch).options);
    assert.equal(report.passed, false);
    assert.equal(report.failures.at(-1).id, "media");
    assert.match(report.failures.at(-1).hint, /Media Feature Pack/);
  }
});
test("preflight uses an isolated profile in caller scratch instead of the user studio profile", () => {
  const parent = path.join(__dirname, "..", "artifacts", "dependency-unit");
  fs.mkdirSync(parent, { recursive: true });
  const set = [];
  const app = {
    getPath: () => parent,
    setPath: (key, value) => set.push([key, value]),
  };
  const report = path.join(parent, "report.json");
  const ctx = prepareDependencyCheck(app, [
    `--dependency-report=${report}`,
    `--dependency-work-dir=${parent}`,
  ]);
  try {
    assert.equal(ctx.reportPath, report);
    assert.ok(ctx.workDirectory.startsWith(parent + path.sep));
    assert.ok(set.every(([, value]) => value.startsWith(ctx.workDirectory)));
    assert.deepEqual(
      set.map(([key]) => key),
      ["userData", "sessionData", "temp"],
    );
  } finally {
    fs.rmSync(ctx.workDirectory, { recursive: true, force: true });
  }
});
