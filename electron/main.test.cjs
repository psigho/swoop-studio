"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { execFileSync } = require("node:child_process");
const { resolveDataDirectory } = require("./data-path.cjs");

function profileFileSystem({ hasK = true, deniedFolders = [] } = {}) {
  const writes = [];
  const removed = [];
  return {
    writes,
    removed,
    existsSync: (folder) => folder === "K:\\" && hasK,
    mkdirSync() {},
    writeFileSync(file) {
      writes.push(file);
      if (deniedFolders.includes(path.win32.dirname(file))) {
        const error = new Error("EACCES: permission denied");
        error.code = "EACCES";
        throw error;
      }
    },
    unlinkSync: (file) => removed.push(file),
  };
}

const userProfile = "C:\\Users\\test\\AppData\\Roaming\\Swoop Studio";

function dataDirectory(fileSystem, extra = {}) {
  return resolveDataDirectory({
    defaultDirectory: userProfile,
    platform: "win32",
    paths: path.win32,
    fileSystem,
    ...extra,
  });
}

test("app data prefers K when the profile, session and temp folders are writable", () => {
  const fileSystem = profileFileSystem();
  assert.equal(dataDirectory(fileSystem), "K:\\_data\\swoop-studio");
  assert.deepEqual(
    fileSystem.writes.map((file) => path.win32.dirname(file)),
    [
      "K:\\_data\\swoop-studio",
      "K:\\_data\\swoop-studio\\Session",
      "K:\\_data\\swoop-studio\\Temp",
    ],
  );
  assert.deepEqual(fileSystem.removed, fileSystem.writes);
});

test("an absent K drive uses the per-user profile instead of the installation", () => {
  const fileSystem = profileFileSystem({ hasK: false });
  assert.equal(dataDirectory(fileSystem), userProfile);
  assert.ok(fileSystem.writes.every((file) => file.startsWith(userProfile)));
});

test("an existing K folder that denies writes falls back to the per-user profile", () => {
  const fileSystem = profileFileSystem({
    deniedFolders: ["K:\\_data\\swoop-studio"],
  });
  assert.equal(dataDirectory(fileSystem), userProfile);
  assert.equal(
    path.win32.dirname(fileSystem.writes[0]),
    "K:\\_data\\swoop-studio",
  );
  assert.equal(path.win32.dirname(fileSystem.writes[1]), userProfile);
});

test("an unwritable K session cache also falls back to the per-user profile", () => {
  const fileSystem = profileFileSystem({
    deniedFolders: ["K:\\_data\\swoop-studio\\Session"],
  });
  assert.equal(dataDirectory(fileSystem), userProfile);
  assert.equal(path.win32.dirname(fileSystem.writes[2]), userProfile);
});

test("an explicit writable data profile takes precedence over the preferred drive", () => {
  const fileSystem = profileFileSystem();
  const override = "D:\\Personal\\Swoop";
  assert.equal(dataDirectory(fileSystem, { override }), override);
  assert.ok(fileSystem.writes.every((file) => file.startsWith(override)));
  assert.deepEqual(fileSystem.removed, fileSystem.writes);
});

test("an invalid explicit data override reports its error without changing profiles", () => {
  const override = "D:\\ReadOnly\\Swoop";
  const fileSystem = profileFileSystem({ deniedFolders: [override] });
  assert.throws(
    () => dataDirectory(fileSystem, { override }),
    /SWOOP_DATA_DIR cannot be used: D:.*ReadOnly.*permission denied/,
  );
  assert.equal(fileSystem.writes.length, 1);
  assert.throws(
    () => dataDirectory(fileSystem, { override: " " }),
    /SWOOP_DATA_DIR must name a writable app data folder/,
  );
});

test("a failed per-user fallback reports the writable data directory requirement", () => {
  const fileSystem = profileFileSystem({
    hasK: false,
    deniedFolders: [userProfile],
  });
  assert.throws(
    () => dataDirectory(fileSystem),
    /cannot write its app data folder: C:.*SWOOP_DATA_DIR/,
  );
});

// Exercise main-process boundaries without opening a window or recording a screen.
async function sandbox({ failHookStart = false } = {}) {
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), "swoop-main-test-"),
  );
  const permissions = {};
  const hook = new EventEmitter();
  hook.starts = 0;
  hook.stops = 0;
  hook.start = () => {
    hook.starts++;
    if (failHookStart) throw new Error("Synthetic hook startup failure");
  };
  hook.stop = () => hook.stops++;
  const sourceFixtures = [];
  const dialogs = {
    saves: [],
    opens: [],
    messages: [],
    syncResponses: [],
    calls: 0,
    syncCalls: 0,
  };
  const fakeSession = {
    setPermissionCheckHandler(handler) {
      permissions.check = handler;
    },
    setPermissionRequestHandler(handler) {
      permissions.request = handler;
    },
    setDisplayMediaRequestHandler(handler) {
      permissions.display = handler;
    },
  };
  const electron = {
    app: {
      setName() {},
      setAppUserModelId() {},
      setPath() {},
      requestSingleInstanceLock: () => false,
      quit() {},
      getPath: () => directory,
      getVersion: () => "1.0.0",
    },
    session: { defaultSession: fakeSession },
    dialog: {
      async showSaveDialog() {
        dialogs.calls++;
        return dialogs.saves.shift() || { canceled: true };
      },
      async showOpenDialog() {
        return dialogs.opens.shift() || { canceled: true };
      },
      async showMessageBox() {
        return dialogs.messages.shift() || { response: 0 };
      },
      showMessageBoxSync() {
        dialogs.syncCalls++;
        return dialogs.syncResponses.shift() ?? 0;
      },
    },
    desktopCapturer: { getSources: async () => sourceFixtures },
    screen: {
      getAllDisplays: () => [
        { id: 1, bounds: { x: 0, y: 0, width: 100, height: 100 } },
      ],
      getCursorScreenPoint: () => ({ x: 25, y: 50 }),
    },
    ipcMain: { handle() {} },
  };
  const context = vm.createContext({
    require: (name) =>
      name === "electron"
        ? electron
        : name === "uiohook-napi"
          ? { uIOhook: hook }
          : require(name),
    process: {
      platform: process.platform,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: undefined,
        SWOOP_DATA_DIR: directory,
      },
    },
    __dirname,
    Buffer,
    URL,
    ArrayBuffer,
    setTimeout,
    clearTimeout,
    module: { exports: {} },
  });
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  vm.runInContext(
    `${source}\nmodule.exports = { isTrustedUrl, trustedEvent, saveVideo, saveProject, openProject, getSources, isSelfSource, setupMediaPermissions, confirmUnload, startPointerCapture, stopPointerCapture, bundledFfmpegPath, pausePointers(value) { pointerSession?.pause(value); }, setWindow(value) { mainWindow = value; } };`,
    context,
  );
  return {
    ...context.module.exports,
    directory,
    dialogs,
    permissions,
    sourceFixtures,
    hook,
    cleanup: () => fsp.rm(directory, { recursive: true, force: true }),
  };
}

async function addDisplay(env) {
  env.sourceFixtures.push({
    id: "screen:1:0",
    display_id: "1",
    name: "Synthetic display",
    thumbnail: { isEmpty: () => true },
    appIcon: null,
  });
  await env.getSources();
}

test("bundled encoder resolves reviewed developer and packaged paths outside ASAR", async () => {
  const env = await sandbox();
  try {
    for (const isPackaged of [false, true]) {
      const options = {
        root: env.directory,
        isPackaged,
        resourcesPath: path.join(env.directory, "resources"),
      };
      const physical = isPackaged
        ? path.join(options.resourcesPath, "encoder", "ffmpeg.exe")
        : path.join(
            options.root,
            "vendor",
            "ffmpeg",
            "win32-x64",
            "ffmpeg.exe",
          );
      assert.equal(env.bundledFfmpegPath(options), null);
      await fsp.mkdir(path.dirname(physical), { recursive: true });
      await fsp.writeFile(physical, "fixture executable path; never executed");
      assert.equal(env.bundledFfmpegPath(options), physical);
    }
  } finally {
    await env.cleanup();
  }
});

test("native capture pairs down/up listeners and removes them across repeated sessions", async () => {
  const env = await sandbox();
  try {
    await addDisplay(env);
    assert.equal(
      (await env.startPointerCapture("screen:1:0")).clicksSupported,
      true,
    );
    assert.equal(env.hook.listenerCount("mousedown"), 1);
    assert.equal(env.hook.listenerCount("mouseup"), 1);
    env.hook.emit("mousedown", { button: 1 });
    env.hook.emit("mouseup", { button: 1 });
    const points = env.stopPointerCapture();
    assert.equal(points.find((p) => p.event === "down").pressed, true);
    assert.equal(points.find((p) => p.event === "up").pressed, false);
    assert.equal(env.hook.listenerCount("mousedown"), 0);
    assert.equal(env.hook.listenerCount("mouseup"), 0);
    assert.equal(env.hook.stops, 1);
    await env.startPointerCapture("screen:1:0");
    await env.startPointerCapture("screen:1:0");
    assert.equal(env.hook.listenerCount("mousedown"), 1);
    assert.equal(env.hook.listenerCount("mouseup"), 1);
    env.stopPointerCapture();
    assert.equal(env.hook.stops, 3);
  } finally {
    env.stopPointerCapture();
    await env.cleanup();
  }
});

test("native release events continue updating held state during a pause", async () => {
  const env = await sandbox();
  try {
    await addDisplay(env);
    await env.startPointerCapture("screen:1:0");
    env.hook.emit("mousedown", { button: 1 });
    env.pausePointers(true);
    env.hook.emit("mouseup", { button: 1 });
    env.pausePointers(false);
    const points = env.stopPointerCapture();
    assert.equal(points.filter((p) => p.click).length, 1);
    assert.equal(points.find((p) => p.event === "up").pressed, false);
    assert.equal(points.at(-1).pressed, false);
  } finally {
    env.stopPointerCapture();
    await env.cleanup();
  }
});

test("native hook startup failure removes both listeners and retains pointer sampling", async () => {
  const env = await sandbox({ failHookStart: true });
  try {
    await addDisplay(env);
    const result = await env.startPointerCapture("screen:1:0");
    assert.equal(result.clicksSupported, false);
    assert.equal(result.pointerSupported, true);
    assert.equal(env.hook.listenerCount("mousedown"), 0);
    assert.equal(env.hook.listenerCount("mouseup"), 0);
    assert.equal(env.hook.stops, 1);
    assert.ok(env.stopPointerCapture().length > 0);
  } finally {
    env.stopPointerCapture();
    await env.cleanup();
  }
});

test("source inventory identifies the studio by HWND instead of its title", async () => {
  const env = await sandbox();
  try {
    const handle = Buffer.alloc(8);
    handle.writeBigUInt64LE(12345n);
    env.setWindow({
      isDestroyed: () => false,
      getNativeWindowHandle: () => handle,
      getMediaSourceId: () => "window:12345:0",
    });
    for (const id of ["window:12345:0", "window:54321:0", "screen:12345:0"]) {
      env.sourceFixtures.push({
        id,
        name: "Swoop Studio",
        thumbnail: { isEmpty: () => true },
        appIcon: null,
      });
    }
    const result = await env.getSources();
    assert.equal(result[0].isSelf, true);
    assert.equal(result[1].isSelf, false);
    assert.equal(result[2].isSelf, false);
    assert.equal(
      env.isSelfSource("window:0012345:1"),
      process.platform === "win32",
    );
    const handle32 = Buffer.alloc(4);
    handle32.writeUInt32LE(54321);
    env.setWindow({
      isDestroyed: () => false,
      getNativeWindowHandle: () => handle32,
      getMediaSourceId: () => "window:54321:0",
    });
    assert.equal(env.isSelfSource("window:54321:0"), true);
  } finally {
    await env.cleanup();
  }
});

test("privileged IPC accepts only the trusted top frame of the app", async () => {
  const env = await sandbox();
  try {
    const frame = {
      url: new URL(
        `file:///${path.join(__dirname, "..", "dist", "index.html").replace(/\\/g, "/")}`,
      ).href,
    };
    const contents = { mainFrame: frame };
    env.setWindow({ webContents: contents, isDestroyed: () => false });
    assert.doesNotThrow(() =>
      env.trustedEvent({ sender: contents, senderFrame: frame }),
    );
    assert.throws(
      () => env.trustedEvent({ sender: {}, senderFrame: frame }),
      /only available inside/,
    );
    assert.throws(
      () => env.trustedEvent({ sender: contents, senderFrame: { ...frame } }),
      /only available inside/,
    );
    frame.url = "https://example.com/";
    assert.throws(
      () => env.trustedEvent({ sender: contents, senderFrame: frame }),
      /only available inside/,
    );
  } finally {
    await env.cleanup();
  }
});

test("unsaved editor unload stays canceled until the user explicitly chooses to close", async () => {
  const env = await sandbox();
  try {
    let allowed = 0;
    env.dialogs.syncResponses.push(0, 1);
    env.confirmUnload({
      preventDefault() {
        allowed++;
      },
    });
    assert.equal(allowed, 0);
    env.confirmUnload({
      preventDefault() {
        allowed++;
      },
    });
    assert.equal(allowed, 1);
    assert.equal(env.dialogs.syncCalls, 2);
    env.confirmUnload({
      preventDefault() {
        allowed++;
      },
    });
    assert.equal(allowed, 2);
    assert.equal(
      env.dialogs.syncCalls,
      2,
      "an already-approved close must not prompt twice",
    );
  } finally {
    await env.cleanup();
  }
});

test("display capture rejects requests before an explicit source selection", async () => {
  const env = await sandbox();
  try {
    const frame = { url: "https://example.com/" };
    env.setWindow({
      webContents: { mainFrame: frame },
      isDestroyed: () => false,
    });
    env.setupMediaPermissions();
    let result = "not called";
    await env.permissions.display({ frame, videoRequested: true }, (value) => {
      result = value;
    });
    assert.equal(result, null);
  } finally {
    await env.cleanup();
  }
});

test("WebM export commits original bytes and leaves no staging files", async () => {
  const env = await sandbox();
  try {
    const destination = path.join(env.directory, "A clip.webm");
    env.dialogs.saves.push({ canceled: false, filePath: destination });
    const bytes = Buffer.from("synthetic fixture bytes");
    const result = await env.saveVideo({
      bytes,
      name: "A clip",
      format: "webm",
    });
    assert.equal(result.path, destination);
    assert.deepEqual(await fsp.readFile(destination), bytes);
    assert.equal(
      (await fsp.readdir(env.directory)).filter((name) =>
        name.startsWith(".swoop"),
      ).length,
      0,
    );
  } finally {
    await env.cleanup();
  }
});

test("a canceled video dialog never writes output", async () => {
  const env = await sandbox();
  try {
    const initialEntries = await fsp.readdir(env.directory);
    env.dialogs.saves.push({ canceled: true });
    const result = await env.saveVideo({
      bytes: Buffer.from("clip"),
      name: "Clip",
      format: "webm",
    });
    assert.equal(result.canceled, true);
    assert.deepEqual(await fsp.readdir(env.directory), initialEntries);
  } finally {
    await env.cleanup();
  }
});

test("invalid or empty video data is rejected before opening a save dialog", async () => {
  const env = await sandbox();
  try {
    assert.match(
      (await env.saveVideo({ bytes: [], format: "webm" })).error,
      /video data/,
    );
    assert.match(
      (await env.saveVideo({ bytes: Buffer.alloc(0), format: "webm" })).error,
      /no video/,
    );
    assert.match(
      (await env.saveVideo({ bytes: Buffer.from("x"), format: "exe" })).error,
      /WebM or MP4/,
    );
    assert.equal(env.dialogs.calls, 0);
  } finally {
    await env.cleanup();
  }
});

test("an appended extension cannot overwrite an existing file without confirmation", async () => {
  const env = await sandbox();
  try {
    const destination = path.join(env.directory, "Existing.webm");
    await fsp.writeFile(destination, "keep me");
    env.dialogs.saves.push({
      canceled: false,
      filePath: path.join(env.directory, "Existing"),
    });
    env.dialogs.messages.push({ response: 0 });
    const result = await env.saveVideo({
      bytes: Buffer.from("new data"),
      format: "webm",
    });
    assert.equal(result.canceled, true);
    assert.equal(await fsp.readFile(destination, "utf8"), "keep me");
    assert.equal(
      (await fsp.readdir(env.directory)).filter((name) =>
        name.startsWith(".swoop"),
      ).length,
      0,
    );
  } finally {
    await env.cleanup();
  }
});

test("embedded projects round-trip JSON, while malformed files return an error", async () => {
  const env = await sandbox();
  try {
    const destination = path.join(env.directory, "My project.swoop");
    const data = {
      schemaVersion: 1,
      name: "My project",
      settings: { cursor: "comet" },
      mediaBase64: "aGVsbG8=",
    };
    env.dialogs.saves.push({ canceled: false, filePath: destination });
    assert.equal((await env.saveProject(data)).path, destination);
    env.dialogs.opens.push({ canceled: false, filePaths: [destination] });
    const opened = await env.openProject();
    assert.equal(JSON.stringify(opened.data), JSON.stringify(data));
    await fsp.writeFile(destination, "{ broken");
    env.dialogs.opens.push({ canceled: false, filePaths: [destination] });
    assert.equal(typeof (await env.openProject()).error, "string");
  } finally {
    await env.cleanup();
  }
});

test("FFmpeg export produces a real H.264/AAC MP4 from a synthetic WebM", async (t) => {
  let ffmpeg;
  try {
    ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    execFileSync(ffmpeg, ["-version"], { windowsHide: true, stdio: "ignore" });
  } catch {
    t.skip("FFmpeg is not installed in this test environment.");
    return;
  }
  const env = await sandbox();
  try {
    const input = path.join(env.directory, "fixture.webm");
    const output = path.join(env.directory, "render.mp4");
    execFileSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=160x90:rate=10",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        "0.4",
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "realtime",
        "-c:a",
        "libopus",
        input,
      ],
      { windowsHide: true, timeout: 15000 },
    );
    env.dialogs.saves.push({ canceled: false, filePath: output });
    const result = await env.saveVideo({
      bytes: await fsp.readFile(input),
      name: "Fixture",
      format: "mp4",
    });
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.path, output);
    const ffprobe =
      ffmpeg === "ffmpeg"
        ? "ffprobe"
        : path.join(
            path.dirname(ffmpeg),
            process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
          );
    const probe = JSON.parse(
      execFileSync(
        ffprobe,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
        { windowsHide: true, encoding: "utf8" },
      ),
    );
    assert.ok(
      probe.streams.some(
        (stream) =>
          stream.codec_name === "h264" &&
          stream.width === 160 &&
          stream.height === 90,
      ),
    );
    assert.ok(probe.streams.some((stream) => stream.codec_name === "aac"));
    assert.ok(Number(probe.format.duration) >= 0.4);
  } finally {
    await env.cleanup();
  }
});
