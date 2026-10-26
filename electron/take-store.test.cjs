"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { TakeStore, MAX_CHUNK_BYTES } = require("./take-store.cjs");

const details = {
  name: "Untitled recording",
  mimeType: "video/webm;codecs=vp9,opus",
  width: 1920,
  height: 1080,
};
const completed = {
  duration: 4,
  pointers: [
    { t: 0.1, x: 0.2, y: 0.5, visible: true, event: "down", click: true, pressed: true, button: 1 },
    { t: 2, x: 0.8, y: 0.1, event: "up", pressed: false, button: 1 },
  ],
  warnings: ["Keep the captured window in place."],
};

async function fixture(t, options = {}) {
  const temporary = process.platform === "win32" && fs.existsSync("K:\\")
    ? "K:\\_data\\swoop-studio-tests" : os.tmpdir();
  await fsp.mkdir(temporary, { recursive: true });
  const base = await fsp.mkdtemp(path.join(temporary, "swoop-takes-"));
  const directory = path.join(base, "Recordings");
  t.after(() => fsp.rm(base, { recursive: true, force: true }));
  const store = new TakeStore({ directory, ...options });
  return { base, directory, store };
}

test("completed raw take and cursor metadata survive a new store instance", async (t) => {
  const { directory, store } = await fixture(t);
  const take = await store.beginTake(details);
  assert.match(take.id, /^[0-9a-f-]{36}$/);
  assert.equal(take.path, path.join(directory, take.id, "recording.webm"));
  assert.deepEqual((await store.listTakes()).takes, []);
  await assert.rejects(store.openTake(take.id), /Stop this recording/);
  await store.appendTakeChunk(take.id, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
  await store.appendTakeChunk(take.id, Uint8Array.from([4, 5, 6]).buffer);
  await store.completeTake(take.id, completed);
  const reopened = new TakeStore({ directory });
  const result = await reopened.listTakes();
  assert.equal(result.directory, directory);
  assert.equal(result.takes.length, 1);
  assert.equal(result.takes[0].state, "ready");
  assert.equal(result.takes[0].name, details.name);
  assert.equal(result.takes[0].bytes, 7);
  assert.equal(result.takes[0].duration, completed.duration);
  assert.equal(result.takes[0].hasCursorData, true);
  assert.ok(Number.isFinite(Date.parse(result.takes[0].createdAt)));
  const opened = await reopened.openTake(take.id);
  assert.deepEqual([...opened.bytes], [0x1a, 0x45, 0xdf, 0xa3, 4, 5, 6]);
  assert.deepEqual(opened.pointers, completed.pointers);
  assert.equal(opened.mimeType, details.mimeType);
  const manifest = JSON.parse(await fsp.readFile(path.join(directory, take.id, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.warnings, completed.warnings);
  assert.equal(manifest.state, "ready");
});

test("canonical path aliases are accepted without weakening ancestor link checks", async (t) => {
  const fileSystem = { ...fsp, realpath: async (file) => path.join(path.parse(path.resolve(file)).root, "canonical-long-name", path.basename(file)) };
  const { directory, store } = await fixture(t, { fileSystem });
  const take = await store.beginTake(details);
  await store.appendTakeChunk(take.id, new Uint8Array([1, 2, 3]));
  await store.completeTake(take.id, completed);
  assert.deepEqual([...((await store.openTake(take.id)).bytes)], [1, 2, 3]);
  const original = fileSystem.lstat;
  fileSystem.lstat = async (file) => {
    const stat = await original(file);
    if (file === path.dirname(directory)) return { ...stat, isSymbolicLink: () => true, isDirectory: () => true };
    return stat;
  };
  await assert.rejects(store.ensureDirectory(), /symbolic link/);
});

test("an interrupted recording remains on disk and is listed after restart", async (t) => {
  const { directory, store } = await fixture(t);
  const take = await store.beginTake(details);
  await store.appendTakeChunk(take.id, new Uint8Array([10, 20, 30]));
  assert.equal((await store.listTakes()).takes.length, 0);
  const reopened = new TakeStore({ directory });
  const result = await reopened.listTakes();
  assert.equal(result.takes[0].state, "interrupted");
  assert.equal(result.takes[0].bytes, 3);
  assert.equal(result.takes[0].duration, undefined);
  assert.deepEqual([...((await reopened.openTake(take.id)).bytes)], [10, 20, 30]);
  assert.equal(JSON.parse(await fsp.readFile(path.join(directory, take.id, "manifest.json"), "utf8")).state, "recording");
  assert.deepEqual(await fsp.readdir(path.join(directory, take.id)), ["manifest.json", "recording.webm"]);
});

test("concurrent chunks are serialized and fsynced before acknowledgement", async (t) => {
  const events = [];
  let gated = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fileSystem = {
    ...fsp,
    async open(file, flags) {
      const handle = await fsp.open(file, flags);
      if (path.basename(file) !== "recording.webm" || typeof flags !== "number") return handle;
      return {
        stat: () => handle.stat(),
        close: () => handle.close(),
        read: (...args) => handle.read(...args),
        async write(...args) {
          events.push(`write:${args[0][0]}`);
          if (!gated) { gated = true; await gate; }
          return handle.write(...args);
        },
        async sync() { events.push("sync"); await handle.sync(); },
      };
    },
  };
  const { store } = await fixture(t, { fileSystem });
  const take = await store.beginTake(details);
  const bytes = new Uint8Array([1, 1, 1]);
  let acknowledged = false;
  const first = store.appendTakeChunk(take.id, bytes).then(() => { acknowledged = true; events.push("ack:1"); });
  bytes.fill(9);
  const second = store.appendTakeChunk(take.id, new Uint8Array([2, 2])).then(() => events.push("ack:2"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(acknowledged, false);
  assert.deepEqual(events, ["write:1"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["write:1", "sync", "ack:1", "write:2", "sync", "ack:2"]);
  assert.deepEqual([...await fsp.readFile(take.path)], [1, 1, 1, 2, 2]);
  // Finalization waits for previously enqueued chunks rather than racing them.
  const third = store.appendTakeChunk(take.id, new Uint8Array([3]));
  const final = store.completeTake(take.id, { duration: 1, pointers: [], warnings: [] });
  await Promise.all([third, final]);
  assert.deepEqual([...((await store.openTake(take.id)).bytes)], [1, 1, 1, 2, 2, 3]);
});

test("a write error retains acknowledged and partial bytes without marking the take ready", async (t) => {
  let failWrite = false;
  const fileSystem = {
    ...fsp,
    async open(file, flags) {
      const handle = await fsp.open(file, flags);
      if (path.basename(file) !== "recording.webm" || typeof flags !== "number") return handle;
      return {
        stat: () => handle.stat(), close: () => handle.close(), sync: () => handle.sync(),
        async write(buffer, offset, length, position) {
          if (failWrite) {
            await handle.write(buffer, offset, 1, position);
            const error = new Error("ENOSPC: recording drive is full");
            error.code = "ENOSPC";
            throw error;
          }
          return handle.write(buffer, offset, length, position);
        },
      };
    },
  };
  const { directory, store } = await fixture(t, { fileSystem });
  const take = await store.beginTake(details);
  await store.appendTakeChunk(take.id, new Uint8Array([1, 2]));
  failWrite = true;
  await assert.rejects(store.appendTakeChunk(take.id, new Uint8Array([3, 4])), (error) => error.message.includes(take.path) && error.message.includes("ENOSPC"));
  assert.deepEqual([...await fsp.readFile(take.path)], [1, 2, 3]);
  assert.equal((await store.listTakes()).takes[0].state, "interrupted");
  await assert.rejects(store.completeTake(take.id, completed), /no longer active/);
  assert.equal((await new TakeStore({ directory }).listTakes()).takes[0].bytes, 3);
});

test("interrupting drains accepted writes and immediately exposes partial recovery without restart", async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let writing;
  const entered = new Promise((resolve) => { writing = resolve; });
  const fileSystem = {
    ...fsp,
    async open(file, flags) {
      const handle = await fsp.open(file, flags);
      if (path.basename(file) !== "recording.webm" || flags !== (fs.constants.O_WRONLY | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0))) return handle;
      return {
        stat: () => handle.stat(), close: () => handle.close(), sync: () => handle.sync(),
        async write(...args) { writing(); await gate; return handle.write(...args); },
      };
    },
  };
  const { directory, store } = await fixture(t, { fileSystem });
  const take = await store.beginTake(details);
  const pending = store.appendTakeChunk(take.id, new Uint8Array([1, 2, 3]));
  await entered;
  let interrupted = false;
  const interrupt = store.interruptTake(take.id).then(() => { interrupted = true; });
  await assert.rejects(store.appendTakeChunk(take.id, new Uint8Array([4])), /finalized/);
  assert.equal(interrupted, false);
  assert.equal((await store.listTakes()).takes.length, 0);
  release();
  await Promise.all([pending, interrupt]);
  assert.equal((await store.listTakes()).takes[0].state, "interrupted");
  assert.deepEqual([...((await new TakeStore({ directory }).openTake(take.id)).bytes)], [1, 2, 3]);
  await store.interruptTake(take.id);
  await store.interruptTake(randomUUID());
  await assert.rejects(store.interruptTake("../escape"), /recordings list/);
});

test("empty cursor metadata is valid and finished files never expire or delete", async (t) => {
  const { store, directory } = await fixture(t);
  const take = await store.beginTake(details);
  await store.appendTakeChunk(take.id, new Uint8Array([1]));
  await store.completeTake(take.id, { duration: 1, pointers: [], warnings: [] });
  await store.interruptTake(take.id);
  const manifestPath = path.join(directory, take.id, "manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  manifest.createdAt = "2000-01-01T00:00:00.000Z";
  await fsp.writeFile(manifestPath, JSON.stringify(manifest));
  const reopened = new TakeStore({ directory });
  for (let iteration = 0; iteration < 3; iteration++) {
    const result = await reopened.listTakes();
    assert.equal(result.takes[0].state, "ready");
    assert.equal(result.takes[0].hasCursorData, false);
    assert.deepEqual((await reopened.openTake(take.id)).pointers, []);
  }
  assert.equal(typeof store.deleteTake, "undefined");
  assert.deepEqual([...await fsp.readFile(take.path)], [1]);
});

test("renderer interruption exposes all active takes only after their accepted writes finish", async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let allWriting;
  const entered = new Promise((resolve) => { allWriting = resolve; });
  let writers = 0;
  const fileSystem = {
    ...fsp,
    async open(file, flags) {
      const handle = await fsp.open(file, flags);
      if (path.basename(file) !== "recording.webm" || typeof flags !== "number" || !(flags & fs.constants.O_APPEND)) return handle;
      return {
        stat: () => handle.stat(), close: () => handle.close(), sync: () => handle.sync(),
        async write(...args) { if (++writers === 2) allWriting(); await gate; return handle.write(...args); },
      };
    },
  };
  const { directory, store } = await fixture(t, { fileSystem });
  const first = await store.beginTake({ ...details, name: "First recording" });
  const second = await store.beginTake({ ...details, name: "Second recording" });
  const pending = [
    store.appendTakeChunk(first.id, new Uint8Array([1, 2])),
    store.appendTakeChunk(second.id, new Uint8Array([3, 4, 5])),
  ];
  await entered;
  const interrupted = store.interruptAll();
  await assert.rejects(store.appendTakeChunk(first.id, new Uint8Array([9])), /finalized/);
  await assert.rejects(store.appendTakeChunk(second.id, new Uint8Array([9])), /finalized/);
  assert.equal((await store.listTakes()).takes.length, 0);
  release();
  await Promise.all([...pending, interrupted]);
  const reopened = new TakeStore({ directory });
  const result = await store.listTakes();
  assert.equal(result.takes.length, 2);
  assert.ok(result.takes.every((take) => take.state === "interrupted"));
  assert.deepEqual([...((await reopened.openTake(first.id)).bytes)], [1, 2]);
  assert.deepEqual([...((await reopened.openTake(second.id)).bytes)], [3, 4, 5]);
  await store.interruptAll();
});

test("path traversal, non-byte chunks, large chunks and malformed metadata are rejected", async (t) => {
  const { store, directory } = await fixture(t);
  for (const id of ["../escape", "..", "C:\\outside", randomUUID().toUpperCase(), "not-a-take"])
    await assert.rejects(store.openTake(id), /recordings list/);
  await assert.rejects(store.beginTake({ ...details, name: "" }), /Recording name/);
  await assert.rejects(store.beginTake({ ...details, mimeType: "video/mp4" }), /WebM/);
  await assert.rejects(store.beginTake({ ...details, width: 1.5 }), /whole number/);
  const take = await store.beginTake(details);
  for (const bytes of ["bytes", [1, 2], {}, new Uint8Array(), new Uint8Array(MAX_CHUNK_BYTES + 1)])
    await assert.rejects(store.appendTakeChunk(take.id, bytes), /chunk/);
  await store.appendTakeChunk(take.id, new Uint8Array([1, 2]));
  for (const invalid of [
    { ...completed, duration: 0 },
    { ...completed, duration: Infinity },
    { ...completed, pointers: [{ t: 5, x: 0, y: 0 }] },
    { ...completed, pointers: [{ t: 1, x: -1, y: 0 }] },
    { ...completed, pointers: [{ t: 1, x: 0, y: 0, event: "wheel" }] },
    { ...completed, pointers: [{ t: 1, x: 0, y: 0, pressed: "yes" }] },
    { ...completed, warnings: ["x".repeat(2001)] },
  ]) await assert.rejects(store.completeTake(take.id, invalid));
  await store.completeTake(take.id, completed);
  assert.deepEqual([...await fsp.readFile(take.path)], [1, 2]);
  assert.deepEqual(await fsp.readdir(directory), [take.id]);
});

test("reopening a large take stays bounded and gives its retained path", async (t) => {
  const { directory, store } = await fixture(t, { maxVideoBytes: 2 });
  const take = await store.beginTake(details);
  await store.appendTakeChunk(take.id, new Uint8Array([1, 2, 3]));
  await store.completeTake(take.id, { duration: 1, pointers: [], warnings: [] });
  await assert.rejects(store.openTake(take.id), (error) => error.message.includes("1.5 GB") && error.message.includes(take.path));
  assert.equal((await store.listTakes()).takes[0].bytes, 3);
  assert.deepEqual([...await fsp.readFile(take.path)], [1, 2, 3]);
  assert.equal((await new TakeStore({ directory }).openTake(take.id)).bytes.length, 3);
});

test("corrupt or missing metadata cannot hide an existing interrupted raw recording", async (t) => {
  const { directory, store } = await fixture(t);
  const take = await store.beginTake(details);
  await store.appendTakeChunk(take.id, new Uint8Array([1, 2, 3]));
  await fsp.writeFile(path.join(directory, take.id, "manifest.json"), "{interrupted json");
  const reopened = new TakeStore({ directory });
  const saved = (await reopened.listTakes()).takes[0];
  assert.equal(saved.state, "interrupted");
  assert.equal(saved.name, "Recovered recording");
  assert.equal(saved.bytes, 3);
  assert.deepEqual([...((await reopened.openTake(take.id)).bytes)], [1, 2, 3]);
  await fsp.unlink(path.join(directory, take.id, "manifest.json"));
  assert.equal((await reopened.listTakes()).takes.length, 1);
});

test("linked directories and linked raw video are refused without touching their targets", async (t) => {
  const { base, directory, store } = await fixture(t);
  const outside = path.join(base, "outside");
  await fsp.mkdir(outside);
  await fsp.writeFile(path.join(outside, "recording.webm"), "outside");
  await store.ensureDirectory();
  const linkedId = randomUUID();
  await fsp.symlink(outside, path.join(directory, linkedId), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await store.listTakes()).takes.length, 0);
  await assert.rejects(store.openTake(linkedId), /link/);
  const take = await store.beginTake(details);
  await fsp.unlink(take.path);
  await fsp.link(path.join(outside, "recording.webm"), take.path);
  await assert.rejects(store.appendTakeChunk(take.id, new Uint8Array([9])), /not links/);
  assert.equal(await fsp.readFile(path.join(outside, "recording.webm"), "utf8"), "outside");
  assert.equal((await store.listTakes()).takes.length, 0);
  const redirected = new TakeStore({ directory: path.join(base, "redirected") });
  await fsp.symlink(outside, redirected.directory, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(redirected.beginTake(details), /link/);
  assert.deepEqual(await fsp.readdir(outside), ["recording.webm"]);
});

test("permission and final manifest failures retain raw video instead of deleting it", async (t) => {
  let denyWrites = false;
  const fileSystem = {
    ...fsp,
    async open(file, flags) {
      if (denyWrites && String(flags) === "wx") {
        const error = new Error("EACCES: folder denied writes"); error.code = "EACCES"; throw error;
      }
      return fsp.open(file, flags);
    },
  };
  const { store, directory } = await fixture(t, { fileSystem });
  const take = await store.beginTake(details);
  await store.appendTakeChunk(take.id, new Uint8Array([1, 2, 3]));
  denyWrites = true;
  await assert.rejects(store.completeTake(take.id, completed), /EACCES/);
  assert.deepEqual([...await fsp.readFile(take.path)], [1, 2, 3]);
  const reopened = new TakeStore({ directory });
  assert.equal((await reopened.listTakes()).takes[0].state, "interrupted");
  assert.deepEqual([...((await reopened.openTake(take.id)).bytes)], [1, 2, 3]);
  await assert.rejects(store.beginTake(details), /EACCES/);
  assert.equal((await reopened.listTakes()).takes[0].bytes, 3);
});
