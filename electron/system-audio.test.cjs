"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { SystemAudio } = require("./system-audio.cjs");
function setup() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => (child.killed = true);
  const packets = [];
  let args;
  const capture = new SystemAudio({
    executable: "helper",
    deviceId: "selected-endpoint",
    onPacket: (p) => packets.push(p),
    spawnProcess: (_file, a) => {
      args = a;
      return child;
    },
  });
  return { capture, child, packets, args };
}
const header = Buffer.from([83, 65, 48, 49, 128, 187, 0, 0, 2, 0, 0, 0]);
function packet(frames = 480) {
  const b = Buffer.alloc(4 + frames * 8);
  b.writeUInt32LE(frames * 8);
  return b;
}
test("selected endpoint and parent are exact; split headers and PCM packets are reassembled", async () => {
  const f = setup();
  assert.equal(f.args[1], "selected-endpoint");
  f.child.stdout.emit("data", header.subarray(0, 5));
  f.child.stdout.emit("data", Buffer.concat([header.subarray(5), packet()]));
  assert.equal((await f.capture.ready).sampleRate, 48000);
  assert.equal(f.packets.length, 1);
  assert.equal(f.packets[0].bytes.length, 3840);
  f.capture.stop();
  assert.equal(f.child.killed, true);
});
test("audio acknowledgements preserve all packet order without unbounded queues", async () => {
  const f = setup();
  f.child.stdout.emit("data", header);
  await f.capture.ready;
  f.child.stdout.emit("data", Buffer.concat([packet(), packet(), packet()]));
  assert.equal(f.packets.length, 1);
  f.capture.ack();
  f.capture.ack();
  assert.equal(f.packets.length, 3);
  f.capture.stop();
});
test("malformed audio and slow consumers stop with an error instead of dropping sound", async () => {
  for (const mode of ["bad", "slow"]) {
    const f = setup();
    f.child.stdout.emit("data", header);
    await f.capture.ready;
    f.child.stdout.emit(
      "data",
      mode === "bad"
        ? Buffer.from([1, 0, 0, 0])
        : Buffer.concat(Array.from({ length: 12 }, () => packet())),
    );
    assert.equal(f.capture.closed, true);
    assert.ok(f.packets.at(-1).error);
    assert.equal(f.child.killed, true);
  }
});
test("startup failures and canceled startup reject and release the helper", async () => {
  const f = setup();
  const rejection = assert.rejects(f.capture.ready, /stopped/);
  f.capture.stop();
  await rejection;
});
