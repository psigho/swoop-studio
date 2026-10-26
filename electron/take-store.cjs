"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1536 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024 * 1024;
const MAX_DURATION = 24 * 60 * 60;
const MAX_POINTERS = 2_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WEBM = /^video\/webm(?:\s*;\s*codecs=(?:"[a-z0-9., _-]+"|[a-z0-9., _-]+))?$/i;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value;
}

function number(value, label, min, max, integer = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`${label} must be ${integer ? "a whole number" : "a number"} between ${min} and ${max}.`);
  return value;
}

function captureOptions(value) {
  const input = object(value, "Recording details");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 80 ||
    /[\u0000-\u001f]/.test(input.name)
  )
    throw new Error("Recording name must contain between 1 and 80 characters.");
  if (
    typeof input.mimeType !== "string" ||
    input.mimeType.length > 160 ||
    !WEBM.test(input.mimeType)
  )
    throw new Error("Automatic recording backup requires WebM video.");
  return {
    name: input.name.trim(),
    mimeType: input.mimeType,
    width: number(input.width, "Recording width", 1, 32768, true),
    height: number(input.height, "Recording height", 1, 32768, true),
  };
}

function completionOptions(value) {
  const input = object(value, "Completed recording details");
  const duration = number(input.duration, "Recording duration", 0, MAX_DURATION);
  if (!duration) throw new Error("Recording duration must be greater than zero.");
  if (!Array.isArray(input.pointers) || input.pointers.length > MAX_POINTERS)
    throw new Error("A recording must contain no more than 2,000,000 cursor samples.");
  const pointers = input.pointers.map((value, index) => {
    const input = object(value, `Cursor sample ${index + 1}`);
    const point = {
      t: number(input.t, `Cursor sample ${index + 1} time`, 0, duration),
      x: number(input.x, `Cursor sample ${index + 1} horizontal position`, 0, 1),
      y: number(input.y, `Cursor sample ${index + 1} vertical position`, 0, 1),
    };
    for (const key of ["click", "visible", "pressed"]) {
      if (Object.hasOwn(input, key)) {
        if (typeof input[key] !== "boolean")
          throw new Error(`Cursor sample ${index + 1} ${key} must be true or false.`);
        point[key] = input[key];
      }
    }
    if (Object.hasOwn(input, "event")) {
      if (!["move", "down", "up"].includes(input.event))
        throw new Error(`Cursor sample ${index + 1} has an unsupported event.`);
      point.event = input.event;
    }
    if (Object.hasOwn(input, "button"))
      point.button = number(input.button, `Cursor sample ${index + 1} button`, 0, 8, true);
    return point;
  }).sort((a, b) => a.t - b.t);
  const warnings = input.warnings === undefined ? [] : input.warnings;
  if (
    !Array.isArray(warnings) ||
    warnings.length > 100 ||
    warnings.some((warning) => typeof warning !== "string" || warning.length > 2000 || /[\u0000-\u0008\u000b-\u001f]/.test(warning))
  )
    throw new Error("Recording warnings must be a short list of text messages.");
  return { duration, pointers, warnings: [...warnings] };
}

function normalized(file) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertId(id) {
  if (typeof id !== "string" || !UUID.test(id))
    throw new Error("Choose a recording from Swoop's recordings list.");
  return id;
}

/** Raw takes are durable before chunk acknowledgements; nothing expires or deletes them. */
class TakeStore {
  constructor({ directory, maxVideoBytes = MAX_VIDEO_BYTES, fileSystem = fsp }) {
    if (typeof directory !== "string" || !path.isAbsolute(directory))
      throw new Error("Recordings need an absolute app data directory.");
    this.directory = path.resolve(directory);
    this.maxVideoBytes = maxVideoBytes;
    this.fs = fileSystem;
    this.active = new Map();
  }

  async _directory(directory, create = false) {
    if (create) await this.fs.mkdir(directory, { recursive: true });
    const stat = await this.fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("Recording folders must be regular folders, not links.");
    if (normalized(await this.fs.realpath(directory)) !== normalized(directory)) {
      // Windows expands 8.3 names (for example RUNNER~1) in realpath. A
      // different spelling is safe only after every ancestor is checked for
      // links/junctions; comparing path strings alone rejects valid folders.
      let ancestor = path.resolve(directory);
      for (;;) {
        const entry = await this.fs.lstat(ancestor);
        if (entry.isSymbolicLink() || !entry.isDirectory())
          throw new Error("Recording folders cannot pass through a symbolic link.");
        const parent = path.dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
    }
  }

  async ensureDirectory() {
    await this._directory(this.directory, true);
    return this.directory;
  }

  _paths(id) {
    const directory = path.join(this.directory, assertId(id));
    return {
      directory,
      video: path.join(directory, "recording.webm"),
      manifest: path.join(directory, "manifest.json"),
    };
  }

  async _file(file, flags) {
    const before = await this.fs.lstat(file);
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1)
      throw new Error("Recording files must be ordinary files, not links.");
    const handle = await this.fs.open(file, flags | (fs.constants.O_NOFOLLOW || 0));
    try {
      const after = await handle.stat();
      if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || after.nlink !== 1)
        throw new Error("The recording file changed while it was being opened.");
      if (normalized(await this.fs.realpath(file)) !== normalized(file)) {
        await this._directory(path.dirname(file));
        const current = await this.fs.lstat(file);
        if (current.isSymbolicLink() || !current.isFile() || current.nlink !== 1 || current.dev !== after.dev || current.ino !== after.ino)
          throw new Error("The recording file changed while it was being opened.");
      }
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async _checkPaths(paths) {
    await this._directory(this.directory);
    await this._directory(paths.directory);
  }

  async _syncDirectory(directory) {
    // Windows flushes file data with FileHandle.sync but does not support opening
    // a directory for fsync. On POSIX also flush the directory entry changes.
    if (process.platform === "win32") return;
    const handle = await this.fs.open(directory, fs.constants.O_RDONLY);
    try { await handle.sync(); } finally { await handle.close(); }
  }

  async _writeManifest(paths, manifest) {
    await this._checkPaths(paths);
    try {
      const current = await this.fs.lstat(paths.manifest);
      if (current.isSymbolicLink() || !current.isFile() || current.nlink !== 1)
        throw new Error("The recording manifest must be an ordinary file.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const json = JSON.stringify(manifest);
    if (Buffer.byteLength(json) > MAX_MANIFEST_BYTES)
      throw new Error("The recording's cursor metadata is too large to save.");
    const staged = path.join(paths.directory, `.manifest-${randomUUID()}.tmp`);
    const handle = await this.fs.open(staged, "wx");
    try {
      await handle.writeFile(json, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await this.fs.rename(staged, paths.manifest);
    await this._syncDirectory(paths.directory);
  }

  _failure(error, video) {
    return new Error(`Swoop could not finish the recording backup. Any saved video remains at ${video}. ${error.message || String(error)}`);
  }

  async beginTake(options) {
    const details = captureOptions(options);
    const id = randomUUID();
    const paths = this._paths(id);
    try {
      await this.ensureDirectory();
      await this.fs.mkdir(paths.directory);
      await this._checkPaths(paths);
      const handle = await this.fs.open(paths.video, "wx");
      try { await handle.sync(); } finally { await handle.close(); }
      const manifest = {
        schemaVersion: 1,
        id,
        ...details,
        createdAt: new Date().toISOString(),
        state: "recording",
        pointers: [],
        warnings: [],
      };
      await this._writeManifest(paths, manifest);
      await this._syncDirectory(this.directory);
      this.active.set(id, { paths, manifest, tail: Promise.resolve(), failure: null, completing: false });
      return { id, path: paths.video };
    } catch (error) {
      throw this._failure(error, paths.video);
    }
  }

  _entry(id) {
    assertId(id);
    const entry = this.active.get(id);
    if (!entry) throw new Error("This recording is no longer active. Its saved video is kept in Recordings.");
    return entry;
  }

  _enqueue(id, entry, operation) {
    const result = entry.tail.then(async () => {
      if (entry.failure) throw entry.failure;
      try { return await operation(); }
      catch (error) {
        entry.failure = this._failure(error, entry.paths.video);
        this.active.delete(id);
        throw entry.failure;
      }
    });
    entry.tail = result.catch(() => {});
    return result;
  }

  appendTakeChunk(id, bytes) {
    try {
      const entry = this._entry(id);
      if (entry.completing) throw new Error("This recording is already being finalized.");
      if (!(bytes instanceof ArrayBuffer) && !(bytes instanceof Uint8Array))
        throw new Error("A recording chunk must contain video bytes.");
      const source = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
      if (!source.byteLength || source.byteLength > MAX_CHUNK_BYTES)
        throw new Error("Recording chunks must contain between 1 byte and 16 MB.");
      // Copy before queuing: a caller cannot mutate bytes while an earlier chunk flushes.
      const buffer = Buffer.from(source);
      return this._enqueue(id, entry, async () => {
        await this._checkPaths(entry.paths);
        const handle = await this._file(entry.paths.video, fs.constants.O_WRONLY | fs.constants.O_APPEND);
        try {
          let offset = 0;
          while (offset < buffer.length) {
            const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, null);
            if (!bytesWritten) throw new Error("The recording drive stopped accepting video data.");
            offset += bytesWritten;
          }
          await handle.sync();
        } catch (error) {
          await handle.sync().catch(() => {});
          throw error;
        } finally { await handle.close(); }
      });
    } catch (error) { return Promise.reject(error); }
  }

  completeTake(id, details) {
    try {
      const entry = this._entry(id);
      if (entry.completing) throw new Error("This recording is already being finalized.");
      const completion = completionOptions(details);
      entry.completing = true;
      return this._enqueue(id, entry, async () => {
        await this._checkPaths(entry.paths);
        // FlushFileBuffers on Windows requires write access, even though this
        // final flush does not append or modify any video bytes.
        const handle = await this._file(entry.paths.video, fs.constants.O_RDWR);
        try {
          if (!(await handle.stat()).size) throw new Error("No video bytes arrived for this recording.");
          await handle.sync();
        } finally { await handle.close(); }
        await this._writeManifest(entry.paths, { ...entry.manifest, ...completion, state: "ready" });
        this.active.delete(id);
      });
    } catch (error) { return Promise.reject(error); }
  }

  async interruptTake(id) {
    assertId(id);
    const entry = this.active.get(id);
    if (!entry) return;
    entry.completing = true;
    // Finish only writes already accepted. The recording manifest deliberately
    // remains unfinished, so recovery never claims the encoder completed it.
    await entry.tail;
    if (this.active.get(id) === entry) this.active.delete(id);
  }

  async interruptAll() {
    await Promise.all([...this.active.keys()].map((id) => this.interruptTake(id)));
  }

  async _readManifest(paths, id, stat) {
    try {
      const handle = await this._file(paths.manifest, fs.constants.O_RDONLY);
      let manifest;
      try {
        if ((await handle.stat()).size > MAX_MANIFEST_BYTES)
          throw new Error("The recording manifest is too large.");
        manifest = JSON.parse(await handle.readFile("utf8"));
      } finally { await handle.close(); }
      if (manifest.schemaVersion !== 1 || manifest.id !== id || !["recording", "ready"].includes(manifest.state))
        throw new Error("Unsupported recording manifest.");
      const details = captureOptions(manifest);
      if (typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt)))
        throw new Error("Invalid recording date.");
      const completion = manifest.state === "ready" ? completionOptions(manifest) : { pointers: [], warnings: [] };
      return { ...details, ...completion, createdAt: new Date(manifest.createdAt).toISOString(), state: manifest.state === "ready" ? "ready" : "interrupted" };
    } catch {
      // A crash during initial setup or damaged metadata must not hide raw bytes.
      return { name: "Recovered recording", mimeType: "video/webm", width: 0, height: 0, createdAt: stat.birthtime.toISOString(), state: "interrupted", pointers: [], warnings: [] };
    }
  }

  async _stored(id) {
    const paths = this._paths(id);
    await this._checkPaths(paths);
    const handle = await this._file(paths.video, fs.constants.O_RDONLY);
    let stat;
    try { stat = await handle.stat(); } finally { await handle.close(); }
    const manifest = await this._readManifest(paths, id, stat);
    const { pointers, warnings, mimeType, ...details } = manifest;
    return {
      take: { id, ...details, bytes: stat.size, path: paths.video, hasCursorData: pointers.length > 0 },
      pointers,
      warnings,
      mimeType,
      paths,
    };
  }

  async listTakes() {
    await this.ensureDirectory();
    const entries = await this.fs.readdir(this.directory, { withFileTypes: true });
    const takes = [];
    for (const entry of entries) {
      if (!UUID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink() || this.active.has(entry.name)) continue;
      try { takes.push((await this._stored(entry.name)).take); }
      catch (error) {
        // Incomplete initial folders and externally linked files are not opened.
        if (error.code === "ENOENT" || /link|ordinary|changed/.test(error.message)) continue;
        throw error;
      }
    }
    takes.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return { directory: this.directory, takes };
  }

  async openTake(id) {
    assertId(id);
    if (this.active.has(id)) throw new Error("Stop this recording before opening its backup.");
    const stored = await this._stored(id);
    const handle = await this._file(stored.paths.video, fs.constants.O_RDONLY);
    let bytes;
    try {
      const size = (await handle.stat()).size;
      if (size > this.maxVideoBytes)
        throw new Error(`This recording is over 1.5 GB and cannot be reopened in the studio. Your video is retained at ${stored.paths.video}. Open it from the Recordings folder.`);
      // Allocate a bounded buffer rather than readFile: a growing external file
      // must not bypass the memory limit between stat and the read.
      bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
        if (!bytesRead) throw new Error(`The recording changed while reading. Your video remains at ${stored.paths.video}.`);
        offset += bytesRead;
      }
    } finally { await handle.close(); }
    return { take: stored.take, bytes, pointers: stored.pointers, mimeType: stored.mimeType };
  }
}

module.exports = { TakeStore, MAX_CHUNK_BYTES, MAX_VIDEO_BYTES };
