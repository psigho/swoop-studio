"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  CleanCapture,
  JpegFrames,
  captureArguments,
  MAX_FRAME_BYTES,
} = require("./clean-capture.cjs");
const jpeg = (value) => Buffer.from([0xff, 0xd8, value, 0xff, 0xd9]);

test("JPEG framing handles split markers and multiple frames without retaining old frames", () => {
  const result = [],
    parser = new JpegFrames((bytes) => result.push(bytes));
  const bytes = Buffer.concat([Buffer.from([0, 4]), jpeg(10), jpeg(20)]);
  for (const byte of bytes) parser.push(Buffer.from([byte]));
  assert.deepEqual(result, [jpeg(10), jpeg(20)]);
  assert.ok(parser.buffer.length < 2);
  assert.throws(
    () => new JpegFrames(() => {}).push(Buffer.alloc(MAX_FRAME_BYTES + 1)),
    /size limit/,
  );
});

test("cursor-free capture uses an exact numeric window handle or validated display rectangle", () => {
  const args = captureArguments({ windowHandle: "12345" });
  assert.deepEqual(args, ["--window", "12345"]);
  assert.ok(!args.includes("--cursor-control"));
  assert.ok(!args.includes("title="));
  for (const windowHandle of ["1 -i desktop", "", "123:4", "-1"])
    assert.throws(() => captureArguments({ windowHandle, bounds: {} }));
  assert.ok(
    captureArguments({
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    }).includes("-1920"),
  );
  assert.throws(() =>
    captureArguments({ bounds: { x: 0, y: 0, width: Infinity, height: 1 } }),
  );
});

function fixture() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = 0;
  child.kill = () => {
    child.kills++;
  };
  const frames = [];
  const capture = new CleanCapture({
    executable: "owned-encoder",
    target: { windowHandle: "123" },
    onFrame: (frame) => frames.push(frame),
    spawnProcess: () => child,
  });
  return { child, frames, capture };
}

test("slow frame consumers have one in-flight frame and receive only the latest pending frame", async () => {
  const { child, frames, capture } = fixture();
  child.stdout.emit("data", jpeg(1));
  assert.equal(await capture.ready, capture.id);
  assert.equal(frames.length, 0);
  capture.acknowledge("wrong-session");
  assert.equal(frames.length, 0);
  capture.acknowledge(capture.id);
  assert.deepEqual(frames[0].bytes, jpeg(1));
  child.stdout.emit("data", Buffer.concat([jpeg(2), jpeg(3), jpeg(4)]));
  assert.equal(frames.length, 1);
  capture.acknowledge(capture.id);
  assert.deepEqual(frames[1].bytes, jpeg(4));
  capture.stop();
  capture.stop();
  assert.equal(child.kills, 1);
  child.stdout.emit("data", jpeg(5));
  capture.acknowledge(capture.id);
  assert.equal(frames.length, 2);
});

test("native source failures reject startup and terminate the helper", async () => {
  const { child, capture, frames } = fixture();
  child.stderr.emit("data", Buffer.from("window unavailable"));
  child.emit("exit", 1);
  await assert.rejects(capture.ready, /window unavailable/);
  assert.match(frames[0].error, /window unavailable/);
  assert.equal(child.kills, 1);
});

test("cancelling before the first frame rejects startup and releases the helper", async () => {
  const { child, capture } = fixture();
  const stopped = assert.rejects(capture.ready, /stopped/);
  capture.stop();
  await stopped;
  assert.equal(child.kills, 1);
});
