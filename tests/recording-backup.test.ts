import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecordingBackup,
  recordingTakeName,
  TAKE_IPC_CHUNK_BYTES,
  type RecordingBackupStatus,
  type TakeBackupBridge,
} from "../src/recording-backup";

const initial = {
  name: "A test take",
  mimeType: "video/webm;codecs=vp9",
  width: 1920,
  height: 1080,
};
const final = { duration: 2.5, pointers: [], warnings: [] };
const take = { id: "take-1", path: "K:\\Recordings\\take-1" };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(overrides: Partial<TakeBackupBridge> = {}) {
  const chunks: Uint8Array[] = [];
  const completions: unknown[] = [];
  const statuses: RecordingBackupStatus[] = [];
  const interruptions: string[] = [];
  const bridge: TakeBackupBridge = {
    async beginTake(metadata) {
      assert.deepEqual(metadata, initial);
      return take;
    },
    async appendTakeChunk(id, bytes) {
      assert.equal(id, take.id);
      chunks.push(new Uint8Array(bytes instanceof Uint8Array ? bytes : bytes));
    },
    async completeTake(id, metadata) {
      assert.equal(id, take.id);
      completions.push(metadata);
    },
    async interruptTake(id) {
      interruptions.push(id);
    },
    ...overrides,
  };
  return { bridge, chunks, completions, statuses, interruptions };
}

test("saved take names use UTC seconds without an extension or milliseconds", () => {
  assert.equal(
    recordingTakeName(new Date("2026-10-20T12:34:56.789Z")),
    "Take 2026-10-20 12-34-56",
  );
});

test("recording backup serializes delayed writes and drains the final recorder chunk", async () => {
  const firstStarted = deferred();
  const releaseFirst = deferred();
  const written: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const { bridge, statuses, completions } = fixture({
    async appendTakeChunk(_id, bytes) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const value = new Uint8Array(bytes as ArrayBuffer)[0];
      if (calls++ === 0) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      written.push(value);
      inFlight--;
    },
  });
  const backup = await createRecordingBackup(bridge, initial, (status) =>
    statuses.push(status),
  );
  backup.enqueue(new Blob([new Uint8Array([1])]));
  await firstStarted.promise;
  backup.enqueue(new Blob([new Uint8Array([2])]));
  // Represents MediaRecorder's last dataavailable, immediately before stop.
  backup.enqueue(new Blob([new Uint8Array([3])]));
  const completion = backup.complete(final);
  assert.equal(
    statuses.some((status) => status.state === "saved"),
    false,
  );
  assert.equal(completions.length, 0);
  releaseFirst.resolve();
  assert.equal(await completion, take.path);
  assert.deepEqual(written, [1, 2, 3]);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(completions, [final]);
  assert.deepEqual(statuses.at(-1), { state: "saved", path: take.path });
  assert.equal(await backup.complete(final), take.path);
  assert.equal(completions.length, 1);
});

test("recording backup never lets blob reads reorder appended bytes", async () => {
  const readingFirst = deferred();
  const releaseFirst = deferred();
  const original = new Blob([new Uint8Array([7])]);
  const delayed = {
    size: 1,
    slice: () => ({
      async arrayBuffer() {
        readingFirst.resolve();
        await releaseFirst.promise;
        return original.arrayBuffer();
      },
    }),
  } as Blob;
  const { bridge, chunks } = fixture();
  const backup = await createRecordingBackup(bridge, initial);
  backup.enqueue(delayed);
  await readingFirst.promise;
  backup.enqueue(new Blob([new Uint8Array([8])]));
  const completion = backup.complete(final);
  releaseFirst.resolve();
  await completion;
  assert.deepEqual(
    chunks.map((chunk) => [...chunk]),
    [[7], [8]],
  );
});

test("recording backup slices large recorder blobs into IPC messages of at most 4 MiB", async () => {
  const bytes = new Uint8Array(TAKE_IPC_CHUNK_BYTES * 2 + 17);
  bytes.fill(11);
  bytes[TAKE_IPC_CHUNK_BYTES - 1] = 12;
  bytes[TAKE_IPC_CHUNK_BYTES] = 13;
  bytes[bytes.length - 1] = 14;
  const { bridge, chunks } = fixture();
  const backup = await createRecordingBackup(bridge, initial);
  backup.enqueue(new Blob([bytes]));
  assert.equal(await backup.complete(final), take.path);
  assert.deepEqual(
    chunks.map((chunk) => chunk.byteLength),
    [TAKE_IPC_CHUNK_BYTES, TAKE_IPC_CHUNK_BYTES, 17],
  );
  assert.equal(chunks[0].at(-1), 12);
  assert.equal(chunks[1][0], 13);
  assert.equal(chunks[2].at(-1), 14);
});

test("a failed append preserves the partial take and cannot report successful completion", async () => {
  const written: number[] = [];
  const { bridge, statuses, completions, interruptions } = fixture({
    async appendTakeChunk(_id, bytes) {
      const value = new Uint8Array(bytes as ArrayBuffer)[0];
      if (value === 2) throw new Error("Disk full");
      written.push(value);
    },
  });
  const backup = await createRecordingBackup(bridge, initial, (status) =>
    statuses.push(status),
  );
  for (const value of [1, 2, 3])
    backup.enqueue(new Blob([new Uint8Array([value])]));
  assert.equal(await backup.complete(final), undefined);
  assert.deepEqual(written, [1]);
  assert.equal(completions.length, 0);
  assert.equal(
    statuses.some((status) => status.state === "saved"),
    false,
  );
  assert.match(statuses.at(-1)?.error || "", /Disk full/);
  assert.match(statuses.at(-1)?.error || "", /Keep the editor open/);
  assert.match(statuses.at(-1)?.error || "", /Save project or Export/);
  assert.match(statuses.at(-1)?.error || "", /partial backup has been kept/);
  assert.deepEqual(interruptions, [take.id]);
});

test("a failed blob read is handled without a false saved status", async () => {
  const { bridge, statuses, completions, chunks, interruptions } = fixture();
  const backup = await createRecordingBackup(bridge, initial, (status) =>
    statuses.push(status),
  );
  backup.enqueue({
    size: 1,
    slice: () => ({
      arrayBuffer: async () => {
        throw new Error("Read failed");
      },
    }),
  } as Blob);
  assert.equal(await backup.complete(final), undefined);
  assert.equal(chunks.length, 0);
  assert.equal(completions.length, 0);
  assert.equal(statuses.at(-1)?.state, "error");
  assert.deepEqual(interruptions, [take.id]);
});

test("a failed metadata finalization never reports the take as saved", async () => {
  const { bridge, statuses, chunks, interruptions } = fixture({
    async completeTake() {
      throw new Error("Metadata rename failed");
    },
  });
  const backup = await createRecordingBackup(bridge, initial, (status) =>
    statuses.push(status),
  );
  backup.enqueue(new Blob([new Uint8Array([1])]));
  assert.equal(await backup.complete(final), undefined);
  assert.equal(chunks.length, 1);
  assert.equal(statuses.at(-1)?.state, "error");
  assert.match(statuses.at(-1)?.error || "", /Metadata rename failed/);
  assert.deepEqual(interruptions, [take.id]);
});

test("an unavailable backup folder rejects initialization before recording can start", async () => {
  const { bridge, statuses } = fixture({
    async beginTake() {
      throw new Error("Access denied");
    },
  });
  await assert.rejects(
    createRecordingBackup(bridge, initial, (status) => statuses.push(status)),
    /Automatic recording backup could not start: Access denied/,
  );
  assert.equal(statuses.at(-1)?.state, "error");
  assert.match(statuses.at(-1)?.error || "", /try New video again/);
});

test("a throwing status observer cannot interrupt preserving the recording", async () => {
  const { bridge, completions } = fixture();
  const backup = await createRecordingBackup(bridge, initial, () => {
    throw new Error("UI failed");
  });
  backup.enqueue(new Blob([new Uint8Array([1])]));
  assert.equal(await backup.complete(final), take.path);
  assert.equal(completions.length, 1);
});

test("interrupt drains already accepted chunks and releases the partial take exactly once", async () => {
  const firstStarted = deferred();
  const releaseFirst = deferred();
  const events: string[] = [];
  const { bridge, statuses, completions } = fixture({
    async appendTakeChunk(_id, bytes) {
      const value = new Uint8Array(bytes as ArrayBuffer)[0];
      if (value === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      events.push(`chunk ${value}`);
    },
    async interruptTake(id) {
      assert.equal(id, take.id);
      events.push("interrupt");
    },
  });
  const backup = await createRecordingBackup(bridge, initial, (status) =>
    statuses.push(status),
  );
  backup.enqueue(new Blob([new Uint8Array([1])]));
  backup.enqueue(new Blob([new Uint8Array([2])]));
  await firstStarted.promise;
  const interruption = backup.interrupt();
  assert.equal(backup.interrupt(), interruption);
  // Nothing can be appended after the take has begun closing.
  backup.enqueue(new Blob([new Uint8Array([3])]));
  assert.deepEqual(events, []);
  releaseFirst.resolve();
  await interruption;
  await backup.interrupt();
  assert.deepEqual(events, ["chunk 1", "chunk 2", "interrupt"]);
  assert.equal(await backup.complete(final), undefined);
  assert.equal(completions.length, 0);
  assert.equal(
    statuses.some((status) => status.state === "saved"),
    false,
  );
});

test("failed partial cleanup remains nonthrowing and never produces a saved status", async () => {
  let interruptions = 0;
  const { bridge, statuses } = fixture({
    async interruptTake() {
      interruptions++;
      throw new Error("Cleanup unavailable");
    },
  });
  const backup = await createRecordingBackup(bridge, initial, (status) =>
    statuses.push(status),
  );
  backup.enqueue(new Blob([new Uint8Array([1])]));
  await assert.doesNotReject(backup.interrupt());
  await backup.interrupt();
  assert.equal(interruptions, 1);
  assert.equal(await backup.complete(final), undefined);
  assert.equal(statuses.at(-1)?.state, "error");
  assert.match(statuses.at(-1)?.error || "", /Cleanup unavailable/);
  assert.match(statuses.at(-1)?.error || "", /backup files have been kept/);
  assert.equal(
    statuses.some((status) => status.state === "saved"),
    false,
  );
});

test("stop cleanup after successful completion calls the idempotent backend once", async () => {
  const { bridge, statuses, interruptions } = fixture();
  const backup = await createRecordingBackup(bridge, initial, (status) =>
    statuses.push(status),
  );
  backup.enqueue(new Blob([new Uint8Array([1])]));
  assert.equal(await backup.complete(final), take.path);
  await backup.interrupt();
  await backup.interrupt();
  assert.deepEqual(interruptions, [take.id]);
  assert.deepEqual(statuses.at(-1), { state: "saved", path: take.path });
});
