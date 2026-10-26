"use strict";
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const runFile = promisify(execFile);

const RUNTIME_FILES = [
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "resources.pak",
  "icudtl.dat",
  "ffmpeg.dll",
  "libEGL.dll",
  "libGLESv2.dll",
  "snapshot_blob.bin",
  "v8_context_snapshot.bin",
  "d3dcompiler_47.dll",
  "dxcompiler.dll",
  "dxil.dll",
  "vulkan-1.dll",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "locales/en-US.pak",
];
// Recent Electron distributions do not always ship separate EGL/GLES DLLs.
const REQUIRED_RUNTIME_FILES = RUNTIME_FILES.filter(
  (file) => !["libEGL.dll", "libGLESv2.dll"].includes(file),
);
const value = (argv, name) =>
  argv.find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);
function prepareDependencyCheck(app, argv) {
  const reportPath = path.resolve(
    value(argv, "--dependency-report") ||
      path.join(app.getPath("temp"), "Swoop-dependency-report.json"),
  );
  const workParent = path.resolve(
    value(argv, "--dependency-work-dir") || path.dirname(reportPath),
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.mkdirSync(workParent, { recursive: true });
  const workDirectory = fs.mkdtempSync(path.join(workParent, ".swoop-check-"));
  const profile = path.join(workDirectory, "profile");
  fs.mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  app.setPath("temp", workDirectory);
  return { reportPath, workDirectory };
}
async function probeBrowser(BrowserWindow, applicationRoot, demo) {
  const window = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  try {
    await window.loadFile(
      path.join(applicationRoot, "electron", "dependency-check.html"),
    );
    return await window.webContents.executeJavaScript(`(async()=>{
    if(typeof navigator.mediaDevices?.getDisplayMedia!=='function')throw new Error('Windows screen capture API is unavailable.');
    if(typeof MediaRecorder!=='function'||!MediaRecorder.isTypeSupported('video/webm'))throw new Error('WebM recording is unavailable.');
    const video=document.getElementById('demo');
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Bundled demo decode timed out.')),12000);video.onloadeddata=()=>{clearTimeout(timeout);resolve();};video.onerror=()=>{clearTimeout(timeout);reject(new Error(video.error?.message||'Bundled MP4 could not decode. Check Windows media components.'));};video.src=${JSON.stringify(pathToFileURL(demo).href)};video.load();});
    if(video.videoWidth<1||video.videoHeight<1||!Number.isFinite(video.duration))throw new Error('Bundled demo metadata is invalid.');
    return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,captureAPI:true,recordingAPI:true};
  })()`);
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}
async function checkDependencies(options) {
  const { applicationRoot, executableDirectory, workDirectory, version } =
    options;
  const platform = options.platform ?? process.platform,
    architecture = options.architecture ?? process.arch,
    release = options.release ?? os.release();
  const report = {
    summary: "Dependency checks in progress",
    passed: false,
    schemaVersion: 1,
    version,
    checkedAt: new Date().toISOString(),
    platform,
    architecture,
    checks: [],
    failures: [],
  };
  const exists = options.exists ?? ((file) => fs.existsSync(file));
  const check = async (id, label, action, hint) => {
    try {
      const detail = await action();
      report.checks.push({ id, label, passed: true, detail });
    } catch (error) {
      const failure = { id, label, passed: false, detail: error.message, hint };
      report.checks.push(failure);
      report.failures.push(failure);
    }
  };
  await check(
    "windows",
    "Supported Windows x64 runtime",
    () => {
      if (
        platform !== "win32" ||
        architecture !== "x64" ||
        Number(release.split(".")[0]) < 10 ||
        Number(release.split(".")[2] || 0) < 19041
      )
        throw new Error(
          `Unsupported platform: ${platform}/${architecture}, OS ${release}`,
        );
      return "Windows 10 version 2004 or later, x64 process";
    },
    "Use this x64 build on an Intel/AMD Windows 10 version 2004 or newer, or Windows 11 PC.",
  );
  if (!report.failures.length) {
    await check(
      "runtime",
      "Bundled Electron runtime files",
      () => {
        const missing = REQUIRED_RUNTIME_FILES.filter(
          (file) => !exists(path.join(executableDirectory, file)),
        );
        if (missing.length)
          throw new Error("Missing runtime files: " + missing.join(", "));
        return `${REQUIRED_RUNTIME_FILES.length} runtime files present`;
      },
      "Restart Setup to restore missing app files.",
    );
    await check(
      "pointer",
      "Bundled native pointer capture module",
      () => {
        const nativeFile = path
          .join(
            applicationRoot,
            "node_modules",
            "uiohook-napi",
            "prebuilds",
            "win32-x64",
            "uiohook-napi.node",
          )
          .replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
        if (!exists(nativeFile))
          throw new Error("The bundled Windows pointer module is missing.");
        const binding = (options.loadNative ?? ((file) => require(file)))(
          nativeFile,
        );
        const hook = { uIOhook: binding.uIOhook ?? binding };
        if (
          typeof hook.uIOhook?.start !== "function" ||
          typeof hook.uIOhook?.stop !== "function"
        )
          throw new Error("The Windows pointer module did not load.");
        return "Native Windows hook loaded; capture was not started";
      },
      "Restart Setup to restore the native module. Windows must be able to load its system components.",
    );
    await check(
      "capture",
      "Windows cursor-free screen capture",
      async () => {
        const executable = /(?:^|[\\/])app\.asar$/.test(applicationRoot)
          ? path.join(path.dirname(applicationRoot), "capture", "win32-x64", "SwoopCapture.exe")
          : path.join(applicationRoot, "native", "capture", "win32-x64", "SwoopCapture.exe");
        if (!exists(executable)) throw new Error("The bundled Windows screen recorder is missing.");
        const result = await (options.runCapture ?? runFile)(executable, ["--check"], { windowsHide: true, timeout: 15000, maxBuffer: 128 * 1024 });
        if (!String(result.stdout ?? result).includes("Windows Graphics Capture and D3D11 ready")) throw new Error("Windows screen recording support could not be confirmed.");
        return "Windows capture API and graphics device checked; no screen was recorded";
      },
      "Restart Setup to restore the recorder. Windows 10 version 2004 or newer and working graphics drivers are required.",
    );
    await check(
      "encoder",
      "Bundled MP4 encoder encode/decode",
      async () => {
        const encoder = /(?:^|[\\/])app\.asar$/.test(applicationRoot)
          ? path.join(path.dirname(applicationRoot), "encoder", "ffmpeg.exe")
          : path.join(
              applicationRoot,
              "vendor",
              "ffmpeg",
              "win32-x64",
              "ffmpeg.exe",
            );
        if (!encoder || !exists(encoder))
          throw new Error("The bundled FFmpeg executable is missing.");
        const run = options.runEncoder ?? runFile;
        const settings = {
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 128 * 1024,
        };
        const versionOutput = await run(
          encoder,
          ["-hide_banner", "-version"],
          settings,
        );
        const probe = path.join(workDirectory, "probe.mp4");
        await run(
          encoder,
          [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x162c26:s=64x64:d=0.15",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            probe,
          ],
          settings,
        );
        await run(
          encoder,
          ["-v", "error", "-nostdin", "-i", probe, "-f", "null", "-"],
          settings,
        );
        return {
          version: String(versionOutput.stdout ?? versionOutput)
            .split("\n")[0]
            .trim(),
          encodedAndDecoded: true,
        };
      },
      "Restart Setup to restore the bundled encoder; a separate FFmpeg installation is not required.",
    );
    const demo = path.join(
      applicationRoot,
      "dist",
      "demo",
      "Swoop-Studio-Demo.mp4",
    );
    await check(
      "media",
      "Screen-recording APIs and bundled demo playback",
      async () => {
        if (!exists(demo))
          throw new Error("The included demo video is missing.");
        return (
          options.browserProbe ??
          (() => probeBrowser(options.BrowserWindow, applicationRoot, demo))
        )();
      },
      "Restart Setup for missing files. If Windows media components are unavailable, use Windows Optional Features / Media Feature Pack on Windows N, then restart Windows.",
    );
  }
  report.passed = report.failures.length === 0;
  report.summary = report.passed
    ? "Swoop Studio dependencies passed."
    : report.failures
        .map((failure) => `${failure.label}: ${failure.detail}`)
        .join(" | ");
  return report;
}
async function runDependencyCheck({ app, BrowserWindow, context }) {
  let report;
  try {
    report = await checkDependencies({
      applicationRoot: app.getAppPath(),
      executableDirectory: path.dirname(app.getPath("exe")),
      workDirectory: context.workDirectory,
      version: app.getVersion(),
      BrowserWindow,
    });
  } catch (error) {
    report = {
      summary: error.message,
      passed: false,
      failures: [{ id: "check", detail: error.message }],
    };
  }
  // Fresh atomic report, never a partially written success marker.
  const temporary = context.reportPath + ".tmp";
  await fsp.writeFile(temporary, JSON.stringify(report, null, 2));
  await fsp.rename(temporary, context.reportPath);
  console.log(report.summary);
  // Installer scratch folders are removed by NSIS after this process exits.
  await fsp
    .rm(path.join(context.workDirectory, "probe.mp4"), { force: true })
    .catch(() => {});
  return report.passed ? 0 : 2;
}
module.exports = {
  prepareDependencyCheck,
  checkDependencies,
  runDependencyCheck,
  REQUIRED_RUNTIME_FILES,
};
