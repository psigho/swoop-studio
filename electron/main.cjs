"use strict";

const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  session,
  shell,
} = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { randomUUID } = require("node:crypto");
const { PointerSession } = require("./pointer-session.cjs");
const { TypingSession } = require("./typing-session.cjs");
const { SystemAudio } = require("./system-audio.cjs");
const { resolveDataDirectory } = require("./data-path.cjs");
const { TakeStore } = require("./take-store.cjs");
const { CleanCapture } = require("./clean-capture.cjs");
const {
  prepareDependencyCheck,
  runDependencyCheck,
} = require("./dependency-check.cjs");

const runFile = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");
const DIST_INDEX = path.join(ROOT, "dist", "index.html");
app.setName("Swoop Studio");
if (process.platform === "win32") app.setAppUserModelId("local.swoop.studio");
let startupError;
const dependencyMode = process.argv?.includes("--check-dependencies") ?? false;
let dependencyContext;
try {
  if (dependencyMode)
    dependencyContext = prepareDependencyCheck(app, process.argv);
  else {
    const dataHome = resolveDataDirectory({
      defaultDirectory: app.getPath("userData"),
      override: process.env.SWOOP_DATA_DIR,
    });
    app.setPath("userData", dataHome);
    app.setPath("sessionData", path.join(dataHome, "Session"));
    app.setPath("temp", path.join(dataHome, "Temp"));
  }
} catch (error) {
  startupError = error;
}

const MAX_VIDEO_BYTES = 1536 * 1024 * 1024;
const MAX_PROJECT_BYTES = 512 * 1024 * 1024;
let mainWindow;
let sourceInventory = new Map();
let selectedSourceId = null;
let capturePermitExpires = 0;
let pointerSession = null;
let nativeHook = null;
let nativeHookLoaded = false;
let nativeClickListener = null;
let nativeReleaseListener = null;
let nativeMoveListener = null;
let nativeKeyListener = null;
let typingSession = null;
let systemAudio = null;
let outputInventory = new Set();
let nativeHookRunning = false;
let exporting = false;
let encoderProcess = null;
let ffmpegPromise;
let quitApproved = false;
let takeStore;
let cleanCapture = null;
let cleanSource = null;
let acceptedSourceId = null;

function systemExecutable() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "system", "win32-x64", "SwoopSystem.exe")
    : path.join(ROOT, "native", "system", "win32-x64", "SwoopSystem.exe");
}
function stopSystemAudio() {
  systemAudio?.stop();
  systemAudio = null;
}
async function systemQuery(mode) {
  const { stdout } = await runFile(systemExecutable(), [mode], {
    windowsHide: true,
    timeout: 2000,
    maxBuffer: 128 * 1024,
  });
  return JSON.parse(stdout.trim());
}

function stopCleanCapture() {
  stopSystemAudio();
  cleanCapture?.stop();
  cleanCapture = null;
  cleanSource = null;
}

async function startCleanCapture(sourceId) {
  if (
    process.platform !== "win32" ||
    sourceId !== acceptedSourceId ||
    !sourceInventory.has(sourceId)
  )
    throw new Error("Choose a screen or window in recording setup first.");
  if (cleanCapture) throw new Error("A screen capture is already running.");
  const source = sourceInventory.get(sourceId);
  const target = {};
  if (sourceId.startsWith("screen:")) {
    const display = screen
      .getAllDisplays()
      .find((item) => String(item.id) === source.display_id);
    if (!display)
      throw new Error("The selected display is no longer connected.");
    target.bounds = screen.dipToScreenRect(null, display.bounds);
  } else {
    const match = /^window:(\d+):\d+$/.exec(sourceId);
    if (!match) throw new Error("The selected window is unavailable.");
    target.windowHandle = match[1];
    target.bounds = await getWindowBounds(sourceId);
    if (!target.bounds)
      throw new Error("Restore the selected window before recording.");
  }
  const executable = app.isPackaged
    ? path.join(
        process.resourcesPath,
        "capture",
        "win32-x64",
        "SwoopCapture.exe",
      )
    : path.join(ROOT, "native", "capture", "win32-x64", "SwoopCapture.exe");
  if (!fs.existsSync(executable))
    throw new Error(
      "The bundled screen recorder is unavailable. Reinstall Swoop Studio.",
    );
  // Recheck after asynchronous source lookup; concurrent starts cannot create two captures.
  if (cleanCapture || acceptedSourceId !== sourceId)
    throw new Error("Recording setup changed. Choose your source again.");
  const capture = new CleanCapture({
    executable,
    target,
    onFrame: (frame) => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("swoop:clean-frame", frame);
    },
  });
  cleanCapture = capture;
  cleanSource = { id: sourceId, bounds: target.bounds };
  try {
    await capture.ready;
    return { id: capture.id };
  } catch (error) {
    if (cleanCapture === capture) stopCleanCapture();
    throw error;
  }
}

function recordings() {
  if (!takeStore)
    takeStore = new TakeStore({
      directory: path.join(app.getPath("userData"), "Recordings"),
      maxVideoBytes: MAX_VIDEO_BYTES,
    });
  return takeStore;
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    const destination = path.join(app.getPath("userData"), "main.log");
    if (
      fs.existsSync(destination) &&
      fs.statSync(destination).size > 1024 * 1024
    )
      fs.writeFileSync(destination, "");
    fs.appendFileSync(destination, line);
  } catch {
    /* A log must never stop a recording. */
  }
}

function devServerUrl() {
  const candidate = process.env.VITE_DEV_SERVER_URL;
  if (!candidate) return null;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Invalid local development server URL.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error("The development server must run on localhost.");
  }
  return parsed;
}

const DEV_URL = dependencyMode ? null : devServerUrl();

function isTrustedUrl(value) {
  try {
    const candidate = new URL(value);
    if (DEV_URL) return candidate.origin === DEV_URL.origin;
    return (
      candidate.protocol === "file:" &&
      path.resolve(fileURLToPath(candidate)) === DIST_INDEX
    );
  } catch {
    return false;
  }
}

function trustedEvent(event) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !isTrustedUrl(event.senderFrame.url)
  ) {
    throw new Error("This action is only available inside Swoop Studio.");
  }
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    trustedEvent(event);
    return callback(event, ...args);
  });
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function isSelfSource(sourceId) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    typeof sourceId !== "string" ||
    !sourceId.startsWith("window:")
  )
    return false;
  if (process.platform === "win32") {
    try {
      const match = /^window:(\d+):/.exec(sourceId);
      const handle = mainWindow.getNativeWindowHandle();
      if (match && Buffer.isBuffer(handle) && handle.length >= 4) {
        const hwnd =
          handle.length >= 8
            ? handle.readBigUInt64LE(0)
            : BigInt(handle.readUInt32LE(0));
        return BigInt(match[1]) === hwnd;
      }
    } catch {
      /* Fall back to Electron's source identity if a handle is unavailable. */
    }
  }
  try {
    const own = mainWindow.getMediaSourceId();
    return sourceId.split(":")[1] === own.split(":")[1];
  } catch {
    return false;
  }
}

async function getSources() {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 480, height: 300 },
    fetchWindowIcons: true,
  });
  sourceInventory = new Map(sources.map((source) => [source.id, source]));
  return sources.map((source) => {
    const thumbnail = source.thumbnail.isEmpty()
      ? ""
      : source.thumbnail.toDataURL();
    return {
      id: source.id,
      name: source.name,
      thumbnail,
      dataURL: thumbnail,
      displayId: source.display_id || "",
      kind: source.id.startsWith("screen:") ? "screen" : "window",
      isSelf: isSelfSource(source.id),
      icon:
        source.appIcon && !source.appIcon.isEmpty()
          ? source.appIcon.toDataURL()
          : null,
    };
  });
}

function getNativeHook() {
  if (nativeHookLoaded) return nativeHook;
  nativeHookLoaded = true;
  try {
    nativeHook = require("uiohook-napi").uIOhook;
  } catch (error) {
    log(`Native click tracking unavailable: ${errorText(error)}`);
  }
  return nativeHook;
}

function stopCaptureData() {
  const typing = typingSession?.stop() ?? [];
  typingSession = null;
  const points = pointerSession ? pointerSession.stop() : [];
  pointerSession = null;
  if (nativeHook && nativeClickListener)
    nativeHook.off("mousedown", nativeClickListener);
  if (nativeHook && nativeReleaseListener)
    nativeHook.off("mouseup", nativeReleaseListener);
  nativeClickListener = null;
  nativeReleaseListener = null;
  if (nativeHook && nativeMoveListener)
    nativeHook.off("mousemove", nativeMoveListener);
  if (nativeHook && nativeKeyListener)
    nativeHook.off("keydown", nativeKeyListener);
  nativeMoveListener = null;
  nativeKeyListener = null;
  if (nativeHook && nativeHookRunning) {
    try {
      nativeHook.stop();
    } catch (error) {
      log(`Stopping pointer hook: ${errorText(error)}`);
    }
  }
  nativeHookRunning = false;
  return { pointers: points, typing };
}
function stopPointerCapture() {
  return stopCaptureData().pointers;
}

async function getWindowBounds(sourceId) {
  if (process.platform !== "win32") return null;
  const match = /^window:(\d+):\d+$/.exec(sourceId);
  if (!match) return null;
  // DesktopCapturer's Windows id is an HWND. Read its visible frame once. No
  // target code is injected and no native dependency is needed for this lookup.
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SwoopWindowRect {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref POINT point);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out RECT rect, int size);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
[SwoopWindowRect]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$handle = [IntPtr]::new([long]::Parse('${match[1]}'))
if (-not [SwoopWindowRect]::IsWindow($handle) -or [SwoopWindowRect]::IsIconic($handle)) { throw 'The selected window is closed or minimized.' }
$rect = New-Object SwoopWindowRect+RECT
$status = [SwoopWindowRect]::DwmGetWindowAttribute($handle, 9, [ref]$rect, 16)
if ($status -ne 0) { [SwoopWindowRect]::GetWindowRect($handle, [ref]$rect) | Out-Null }
@{ x=$rect.Left; y=$rect.Top; width=($rect.Right-$rect.Left); height=($rect.Bottom-$rect.Top) } | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await runFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 64 * 1024,
    },
  );
  const physical = JSON.parse(stdout.trim());
  if (
    ![physical.x, physical.y, physical.width, physical.height].every(
      Number.isFinite,
    ) ||
    physical.width <= 0 ||
    physical.height <= 0
  )
    return null;
  return physical;
}

async function startPointerCapture(sourceId, options = {}) {
  if (
    !options ||
    typeof options !== "object" ||
    (options.typingZoom !== undefined &&
      typeof options.typingZoom !== "boolean")
  )
    throw new Error("Invalid typing zoom option.");
  sourceId = sourceId || selectedSourceId;
  if (typeof sourceId !== "string" || !sourceInventory.has(sourceId))
    throw new Error("Choose a screen or window first.");
  stopPointerCapture();
  const source = sourceInventory.get(sourceId);
  let bounds;
  let scope = "display";
  let coordinateSpace = "dip";
  let warning = "";
  if (cleanSource?.id === sourceId) {
    bounds = cleanSource.bounds;
    coordinateSpace = "physical";
    if (sourceId.startsWith("window:")) {
      scope = "window-initial-bounds";
      warning =
        "Keep the recorded window visible, in the same position and size for accurate cursor effects.";
    }
  } else if (sourceId.startsWith("screen:")) {
    const displays = screen.getAllDisplays();
    const display = displays.find(
      (item) => String(item.id) === source.display_id,
    );
    if (display) bounds = display.bounds;
    else if (displays.length === 1) bounds = displays[0].bounds;
  } else {
    try {
      bounds = await getWindowBounds(sourceId);
    } catch (error) {
      log(`Window bounds unavailable: ${errorText(error)}`);
    }
    scope = "window-initial-bounds";
    coordinateSpace = "physical";
    warning =
      "Keep the recorded window in the same position and size for accurate cursor tracking.";
  }
  if (!bounds)
    return {
      clicksSupported: false,
      pointerSupported: false,
      scope: "unavailable",
      warning:
        "Cursor tracking could not locate this source. Choose a full display for accurate cursor effects.",
    };
  const startedAt = Date.now();
  pointerSession = new PointerSession({
    bounds,
    getPoint: () => {
      const point = screen.getCursorScreenPoint();
      // A window can cross displays with different scale factors. Convert each
      // cursor position to physical pixels rather than scaling its whole frame.
      return coordinateSpace === "physical"
        ? screen.dipToScreenPoint(point)
        : point;
    },
  }).start();
  let clicksSupported = false;
  const hook = getNativeHook();
  if (hook) {
    try {
      nativeClickListener = (event) => {
        typingSession?.pause();
        pointerSession?.sample("down", event.button);
      };
      nativeReleaseListener = (event) =>
        pointerSession?.sample("up", event.button);
      nativeMoveListener = () => {
        if (
          pointerSession &&
          pointerSession.elapsed() - (pointerSession.points.at(-1)?.t ?? 0) >=
            0.004
        )
          pointerSession.sample();
      };
      hook.on("mousemove", nativeMoveListener);
      if (options.typingZoom && cleanSource?.id === sourceId) {
        const { UiohookKey } = require("uiohook-napi");
        const names = [
          ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
          "Space",
          "Backspace",
          "Enter",
          "Delete",
          "Semicolon",
          "Equal",
          "Comma",
          "Minus",
          "Period",
          "Slash",
          "Backquote",
          "BracketLeft",
          "Backslash",
          "BracketRight",
          "Quote",
        ];
        const keys = new Set(
          names.map((name) => UiohookKey[name]).filter(Number.isInteger),
        );
        typingSession = new TypingSession({
          clock: pointerSession,
          bounds,
          windowHandle: /^window:(\d+):/.exec(sourceId)?.[1],
          getFocus: async () => {
            const focus = await systemQuery("--focus");
            focus.inBounds =
              focus.windowX >= bounds.x &&
              focus.windowX <= bounds.x + bounds.width &&
              focus.windowY >= bounds.y &&
              focus.windowY <= bounds.y + bounds.height;
            return focus;
          },
          getFallback: () => {
            const click = pointerSession?.points.findLast(
              (p) => p.click && p.visible,
            );
            return click ?? { x: 0.5, y: 0.5, visible: false };
          },
          isTypingKey: (event) =>
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            keys.has(event.keycode),
        });
        nativeKeyListener = (event) => typingSession?.key(event);
        hook.on("keydown", nativeKeyListener);
      }
      hook.on("mousedown", nativeClickListener);
      hook.on("mouseup", nativeReleaseListener);
      hook.start();
      nativeHookRunning = true;
      clicksSupported = true;
    } catch (error) {
      log(`Starting native click tracking failed: ${errorText(error)}`);
      if (nativeClickListener) hook.off("mousedown", nativeClickListener);
      if (nativeReleaseListener) hook.off("mouseup", nativeReleaseListener);
      nativeClickListener = null;
      nativeReleaseListener = null;
      if (nativeMoveListener) hook.off("mousemove", nativeMoveListener);
      if (nativeKeyListener) hook.off("keydown", nativeKeyListener);
      nativeMoveListener = null;
      nativeKeyListener = null;
      typingSession?.stop();
      typingSession = null;
      try {
        hook.stop();
      } catch {
        /* A partially started hook still has both listeners removed. */
      }
      nativeHookRunning = false;
    }
  }
  log(`Pointer capture started: ${scope}, native clicks=${clicksSupported}`);
  return {
    clicksSupported,
    typingSupported: !!typingSession,
    pointerSupported: true,
    scope,
    bounds: { ...bounds },
    coordinateSpace,
    warning,
    startedAt,
  };
}

function bundledFfmpegPath({
  isPackaged = app.isPackaged,
  resourcesPath = process.resourcesPath,
  root = ROOT,
} = {}) {
  // The reviewed encoder is an ordinary file outside Electron's ASAR archive.
  const executable = isPackaged
    ? path.join(resourcesPath, "encoder", "ffmpeg.exe")
    : path.join(root, "vendor", "ffmpeg", "win32-x64", "ffmpeg.exe");
  return fs.existsSync(executable) ? executable : null;
}

async function findFfmpeg() {
  if (!ffmpegPromise)
    ffmpegPromise = (async () => {
      const candidates = [process.env.FFMPEG_PATH];
      const bundled = bundledFfmpegPath();
      if (bundled) candidates.push(bundled);
      candidates.push(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
      for (const candidate of candidates.filter(Boolean)) {
        try {
          await runFile(candidate, ["-version"], {
            windowsHide: true,
            timeout: 10000,
            maxBuffer: 128 * 1024,
          });
          return candidate;
        } catch {
          /* Try the next explicitly configured or installed encoder. */
        }
      }
      return null;
    })();
  return ffmpegPromise;
}

function progress(payload) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("swoop:export-progress", payload);
}

function encodeMp4(executable, input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      output,
    ];
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    encoderProcess = child;
    let stderr = "";
    let pending = "";
    let duration = 0;
    const timeout = setTimeout(
      () => {
        child.kill();
        reject(
          new Error(
            "MP4 export exceeded 30 minutes. Try a shorter clip or export WebM.",
          ),
        );
      },
      30 * 60 * 1000,
    );
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-16384);
      const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      if (match)
        duration =
          Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    });
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        const match = /^out_time_us=(\d+)/.exec(line);
        if (match) {
          const seconds = Number(match[1]) / 1000000;
          progress({
            stage: "encoding",
            seconds,
            ratio:
              duration > 0 ? Math.min(0.99, seconds / duration) : undefined,
          });
        }
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      encoderProcess = null;
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      encoderProcess = null;
      if (code === 0) resolve();
      else {
        log(`FFmpeg export failed: ${stderr}`);
        reject(
          new Error(
            "MP4 encoding failed. Your recording is still in the studio; try WebM export.",
          ),
        );
      }
    });
  });
}

function safeName(value, extension) {
  const raw = typeof value === "string" ? value : "Swoop recording";
  const clean = raw
    .replace(/\.(webm|mp4|swoop|json)$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/[.\s]+$/g, "")
    .trim()
    .slice(0, 120);
  return `${clean || "Swoop recording"}.${extension}`;
}

function videoBuffer(bytes) {
  let buffer;
  if (bytes instanceof ArrayBuffer) buffer = Buffer.from(bytes);
  else if (ArrayBuffer.isView(bytes))
    buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  else throw new Error("The export did not include video data.");
  if (!buffer.length) throw new Error("There is no video to export yet.");
  if (buffer.length > MAX_VIDEO_BYTES)
    throw new Error(
      "This export is over 1.5 GB. Trim the recording into shorter clips before exporting.",
    );
  return buffer;
}

async function saveVideo(options) {
  if (exporting) return { error: "Another export is already running." };
  if (!options || !["webm", "mp4"].includes(options.format))
    return { error: "Choose WebM or MP4 for export." };
  let tempDir;
  let staged;
  exporting = true;
  try {
    const buffer = videoBuffer(options.bytes);
    const encoder = options.format === "mp4" ? await findFfmpeg() : null;
    if (options.format === "mp4" && !encoder)
      return {
        error:
          "FFmpeg is not installed. Export WebM, or install FFmpeg and restart Swoop Studio.",
      };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export your recording",
      defaultPath: path.join(
        app.getPath("videos"),
        safeName(options.name, options.format),
      ),
      buttonLabel: "Export",
      filters: [
        {
          name: options.format === "mp4" ? "MP4 video" : "WebM video",
          extensions: [options.format],
        },
      ],
      properties:
        process.platform === "linux" ? ["showOverwriteConfirmation"] : [],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const destination =
      path.extname(result.filePath).toLowerCase() === `.${options.format}`
        ? result.filePath
        : `${result.filePath}.${options.format}`;
    // Stage alongside the destination so committing a complete export is atomic.
    staged = path.join(
      path.dirname(destination),
      `.swoop-${randomUUID()}.${options.format}`,
    );
    progress({ stage: "preparing", ratio: 0 });
    if (options.format === "mp4") {
      tempDir = await fsp.mkdtemp(
        path.join(app.getPath("temp"), "swoop-export-"),
      );
      const input = path.join(tempDir, "recording.webm");
      await fsp.writeFile(input, buffer, { flag: "wx" });
      await encodeMp4(encoder, input, staged);
    } else await fsp.writeFile(staged, buffer, { flag: "wx" });
    if (destination !== result.filePath && fs.existsSync(destination)) {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Replace existing video?",
        message: `${path.basename(destination)} already exists. Replace it?`,
        buttons: ["Cancel", "Replace"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer.response !== 1) return { canceled: true };
    }
    await fsp.rename(staged, destination);
    staged = null;
    progress({ stage: "complete", ratio: 1, path: destination });
    log(`Export completed (${options.format}, ${buffer.length} input bytes).`);
    return { canceled: false, path: destination };
  } catch (error) {
    log(`Export failed: ${errorText(error)}`);
    progress({ stage: "error", error: errorText(error) });
    return { error: errorText(error) };
  } finally {
    exporting = false;
    if (staged) await fsp.rm(staged, { force: true }).catch(() => {});
    if (tempDir)
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function saveProject(data) {
  let staged;
  try {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("The project must contain recording settings.");
    const json = JSON.stringify(data, null, 2);
    if (Buffer.byteLength(json, "utf8") > MAX_PROJECT_BYTES)
      throw new Error(
        "The project exceeds 512 MB. Use a shorter recording before saving an embedded project.",
      );
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save Swoop project",
      defaultPath: path.join(
        app.getPath("documents"),
        safeName(data.name || data.title || "Untitled project", "swoop"),
      ),
      filters: [{ name: "Swoop project", extensions: ["swoop"] }],
      properties:
        process.platform === "linux" ? ["showOverwriteConfirmation"] : [],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const destination = result.filePath.toLowerCase().endsWith(".swoop")
      ? result.filePath
      : `${result.filePath}.swoop`;
    if (destination !== result.filePath && fs.existsSync(destination)) {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Replace existing project?",
        message: `${path.basename(destination)} already exists. Replace it?`,
        buttons: ["Cancel", "Replace"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer.response !== 1) return { canceled: true };
    }
    staged = path.join(path.dirname(destination), `.swoop-${randomUUID()}.tmp`);
    await fsp.writeFile(staged, json, { encoding: "utf8", flag: "wx" });
    await fsp.rename(staged, destination);
    staged = null;
    return { canceled: false, path: destination };
  } catch (error) {
    return { error: errorText(error) };
  } finally {
    if (staged) await fsp.rm(staged, { force: true }).catch(() => {});
  }
}

async function openProject() {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open Swoop project",
      properties: ["openFile"],
      filters: [{ name: "Swoop project", extensions: ["swoop", "json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const selected = result.filePaths[0];
    const stat = await fsp.stat(selected);
    if (!stat.isFile() || stat.size > MAX_PROJECT_BYTES)
      throw new Error("Choose a Swoop project smaller than 512 MB.");
    const data = JSON.parse(await fsp.readFile(selected, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("This file does not contain a valid Swoop project.");
    return { canceled: false, data, path: selected };
  } catch (error) {
    return { error: errorText(error) };
  }
}

function setupIpc() {
  handle("swoop:clean-start", (_event, id) => startCleanCapture(id));
  handle("swoop:clean-stop", (_event, id) => {
    if (cleanCapture?.id === id) stopCleanCapture();
  });
  ipcMain.on("swoop:clean-ack", (event, id) => {
    try {
      trustedEvent(event);
      cleanCapture?.acknowledge(id);
    } catch {
      /* Ignore untrusted senders. */
    }
  });
  handle("swoop:sound-settings", async () => {
    if (process.platform === "win32")
      await shell.openExternal("ms-settings:sound");
  });
  handle("swoop:get-sources", () => getSources());
  handle("swoop:select-source", (_event, id) => {
    if (typeof id !== "string" || !sourceInventory.has(id)) return false;
    selectedSourceId = id;
    capturePermitExpires = Date.now() + 120000;
    return true;
  });
  handle("swoop:outputs", async () => {
    const devices = await systemQuery("--outputs");
    outputInventory = new Set(devices.map((device) => device.id));
    return devices;
  });
  handle("swoop:audio-start", async (_event, deviceId) => {
    if (!cleanCapture || systemAudio)
      throw new Error("Start a screen recording before system audio.");
    if (deviceId !== "default" && !outputInventory.has(deviceId))
      throw new Error("Choose an available system output device first.");
    const capture = new SystemAudio({
      executable: systemExecutable(),
      deviceId,
      onPacket: (packet) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send("swoop:audio-packet", packet);
      },
    });
    systemAudio = capture;
    try {
      return await capture.ready;
    } catch (error) {
      if (systemAudio === capture) stopSystemAudio();
      throw error;
    }
  });
  handle("swoop:audio-stop", (_event, id) => {
    if (systemAudio?.id === id) stopSystemAudio();
  });
  ipcMain.on("swoop:audio-ack", (event, id) => {
    if (event.sender === mainWindow?.webContents && systemAudio?.id === id)
      systemAudio.ack();
  });
  handle("swoop:pointer-start", (_event, id, options) =>
    startPointerCapture(id, options),
  );
  handle("swoop:pointer-pause", (_event, paused) => {
    if (typeof paused !== "boolean")
      throw new Error("Paused must be true or false.");
    pointerSession?.pause(paused);
    if (paused) typingSession?.pause();
    return true;
  });
  handle("swoop:pointer-stop", () => stopPointerCapture());
  handle("swoop:capture-data-stop", () => stopCaptureData());
  handle("swoop:save-video", (_event, options) => saveVideo(options));
  handle("swoop:save-project", (_event, data) => saveProject(data));
  handle("swoop:open-project", () => openProject());
  handle("swoop:take-begin", (_event, details) =>
    recordings().beginTake(details),
  );
  handle("swoop:take-append", (_event, id, bytes) =>
    recordings().appendTakeChunk(id, bytes),
  );
  handle("swoop:take-complete", (_event, id, details) =>
    recordings().completeTake(id, details),
  );
  handle("swoop:take-interrupt", (_event, id) =>
    recordings().interruptTake(id),
  );
  handle("swoop:take-list", () => recordings().listTakes());
  handle("swoop:take-open", (_event, id) => recordings().openTake(id));
  handle("swoop:take-show-folder", async () => {
    const directory = await recordings().ensureDirectory();
    const error = await shell.openPath(directory);
    if (error)
      throw new Error(`The Recordings folder could not be opened. ${error}`);
  });
  handle("swoop:app-info", async () => ({
    version: app.getVersion(),
    platform: process.platform,
    ffmpeg: Boolean(await findFfmpeg()),
    clicksSupported: Boolean(getNativeHook()),
    desktop: true,
    projectSizeLimitMB: 512,
  }));
  handle("swoop:window", (_event, action) => {
    if (action === "minimize") mainWindow.minimize();
    else if (action === "maximize") {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else if (action === "close") mainWindow.close();
    else throw new Error("Unknown window action.");
    return true;
  });
}

function setupMediaPermissions() {
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) => {
      return (
        contents === mainWindow?.webContents &&
        isTrustedUrl(details.requestingUrl || contents.getURL()) &&
        ["media", "display-capture"].includes(permission)
      );
    },
  );
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      callback(
        contents === mainWindow?.webContents &&
          isTrustedUrl(details.requestingUrl || contents.getURL()) &&
          ["media", "display-capture"].includes(permission),
      );
    },
  );
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        if (
          !mainWindow ||
          !request.frame ||
          request.frame !== mainWindow.webContents.mainFrame ||
          !isTrustedUrl(request.frame.url) ||
          !request.videoRequested ||
          !selectedSourceId ||
          Date.now() > capturePermitExpires
        ) {
          callback(null);
          return;
        }
        const sourceId = selectedSourceId;
        capturePermitExpires = 0;
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 0, height: 0 },
        });
        const source = sources.find((item) => item.id === sourceId);
        if (!source) {
          callback(null);
          return;
        }
        const streams = { video: source };
        if (request.audioRequested && process.platform === "win32")
          streams.audio = "loopback";
        acceptedSourceId = sourceId;
        callback(streams);
      } catch (error) {
        log(`Display capture request failed: ${errorText(error)}`);
        callback(null);
      }
    },
  );
}

function confirmUnload(event) {
  // A capture/export close prompt has already approved this same close action.
  if (quitApproved) {
    event.preventDefault();
    return;
  }
  const response = dialog.showMessageBoxSync(mainWindow, {
    type: "question",
    title: "Keep your work?",
    message: "This project has unsaved changes or work in progress.",
    detail:
      "Recordings already backed up stay in Recordings. Unsaved edits will be lost. Closing an active recording can leave its ending and cursor track missing.",
    buttons: ["Keep working", "Close without saving"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (response === 1) {
    quitApproved = true;
    stopCleanCapture();
    stopPointerCapture();
    encoderProcess?.kill();
    // Electron uses preventDefault here to override the renderer's beforeunload
    // veto. The native dialog makes that decision explicit and reviewable.
    event.preventDefault();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1150,
    minHeight: 720,
    title: "Swoop Studio",
    icon: path.join(ROOT, "build", "icon.png"),
    backgroundColor: "#111116",
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  mainWindow.webContents.on("will-prevent-unload", confirmUnload);
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    stopCleanCapture();
    stopPointerCapture();
    takeStore
      ?.interruptAll()
      .catch((error) =>
        log(`Interrupted recording backup: ${errorText(error)}`),
      );
    log(`Renderer process exited: ${details.reason}`);
  });
  mainWindow.on("close", (event) => {
    if (quitApproved || (!pointerSession && !cleanCapture && !exporting))
      return;
    event.preventDefault();
    dialog
      .showMessageBox(mainWindow, {
        type: "question",
        title: "Leave Swoop Studio?",
        message: exporting
          ? "An export is still running."
          : "A recording is still running.",
        detail: exporting
          ? "Recordings already backed up stay in Recordings. Unsaved edits will be lost."
          : "Only video already written can be recovered; the ending and cursor track may be missing. Unsaved edits will be lost.",
        buttons: ["Keep working", "Close anyway"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 1) {
          quitApproved = true;
          stopPointerCapture();
          stopCleanCapture();
          encoderProcess?.kill();
          mainWindow.close();
        }
      });
  });
  mainWindow.on("closed", () => {
    stopCleanCapture();
    stopPointerCapture();
    mainWindow = null;
  });
  if (DEV_URL) mainWindow.loadURL(DEV_URL.href);
  else mainWindow.loadFile(DIST_INDEX);
}

if (dependencyMode) {
  // Closing the hidden decode window must not quit before its report is saved.
  app.on("window-all-closed", () => {});
  const dependencyDeadline = setTimeout(() => {
    const report = {
      summary: "Dependency check timed out after 70 seconds.",
      passed: false,
      failures: [
        {
          id: "timeout",
          detail: "The bundled runtime did not finish its offline checks.",
        },
      ],
    };
    if (dependencyContext) {
      try {
        fs.writeFileSync(
          dependencyContext.reportPath + ".tmp",
          JSON.stringify(report),
        );
        fs.renameSync(
          dependencyContext.reportPath + ".tmp",
          dependencyContext.reportPath,
        );
      } catch {
        /* Setup also rejects a missing report. */
      }
    }
    console.error(report.summary);
    app.exit(2);
  }, 70000);
  app
    .whenReady()
    .then(async () => {
      if (startupError) throw startupError;
      const exitCode = await runDependencyCheck({
        app,
        BrowserWindow,
        context: dependencyContext,
      });
      clearTimeout(dependencyDeadline);
      app.exit(exitCode);
    })
    .catch((error) => {
      clearTimeout(dependencyDeadline);
      console.error(`Dependency check failed: ${errorText(error)}`);
      app.exit(2);
    });
} else if (startupError) {
  app.whenReady().then(() => {
    dialog.showErrorBox(
      "Swoop Studio could not start",
      errorText(startupError),
    );
    app.quit();
  });
} else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(() => {
      setupIpc();
      createWindow();
      setupMediaPermissions();
      findFfmpeg().then((executable) =>
        log(
          `Swoop Studio ready; FFmpeg ${executable ? "available" : "unavailable"}.`,
        ),
      );
    })
    .catch((error) => {
      log(`Startup failed: ${errorText(error)}`);
      dialog.showErrorBox("Swoop Studio could not start", errorText(error));
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    stopCleanCapture();
    stopPointerCapture();
    encoderProcess?.kill();
  });
}
