"use strict";
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");

/** Bounded parser: one PCM packet in flight, at most 100 ms waiting for its ACK. */
class SystemAudio {
  constructor({ executable, deviceId, onPacket, spawnProcess = spawn }) {
    this.id = randomUUID();
    this.onPacket = onPacket;
    this.buffer = Buffer.alloc(0);
    this.header = false;
    this.inFlight = false;
    this.pending = [];
    this.pendingBytes = 0;
    this.closed = false;
    this.errorText = "";
    this.ready = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.timer = setTimeout(
      () => this.fail("The selected audio output did not start."),
      10000,
    );
    this.child = spawnProcess(
      executable,
      ["--loopback", deviceId, "--parent", String(process.pid)],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    this.child.stdout.on("data", (bytes) => this.read(bytes));
    this.child.stderr.on("data", (bytes) => {
      this.errorText = (this.errorText + bytes.toString()).slice(-2000);
    });
    this.child.on("error", (error) => this.fail(error.message));
    this.child.on("exit", () => {
      if (!this.closed)
        this.fail(
          this.errorText ||
            "The selected audio output stopped. Check its connection.",
        );
    });
  }
  read(bytes) {
    if (this.closed) return;
    if (this.buffer.length + bytes.length > 1024 * 1024)
      return this.fail("System audio exceeded its buffer limit.");
    this.buffer = Buffer.concat([this.buffer, bytes]);
    if (!this.header) {
      if (this.buffer.length < 12) return;
      if (
        this.buffer.toString("ascii", 0, 4) !== "SA01" ||
        this.buffer.readUInt32LE(4) !== 48000 ||
        this.buffer.readUInt32LE(8) !== 2
      )
        return this.fail("Unsupported system audio format.");
      this.buffer = this.buffer.subarray(12);
      this.header = true;
      clearTimeout(this.timer);
      this.resolve({ id: this.id, sampleRate: 48000, channels: 2 });
    }
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (!length || length > 131072 || length % 8)
        return this.fail("Invalid system audio packet.");
      if (this.buffer.length < length + 4) break;
      const packet = Buffer.from(this.buffer.subarray(4, length + 4));
      this.buffer = this.buffer.subarray(length + 4);
      if (this.inFlight) {
        this.pending.push(packet);
        this.pendingBytes += length;
        if (this.pendingBytes > 38400)
          return this.fail(
            "The recorder could not keep up with system audio. Close other busy apps and try again.",
          );
      } else this.send(packet);
    }
  }
  send(bytes) {
    this.inFlight = true;
    this.onPacket({ id: this.id, bytes });
  }
  ack() {
    if (this.closed) return;
    this.inFlight = false;
    if (this.pending.length) {
      const bytes = this.pending.shift();
      this.pendingBytes -= bytes.length;
      this.send(bytes);
    }
  }
  fail(error) {
    if (this.closed) return;
    this.reject(new Error(error));
    this.onPacket({ id: this.id, error });
    this.stop();
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.reject(new Error("System audio stopped."));
    this.child?.kill();
    this.buffer = Buffer.alloc(0);
    this.pending = [];
  }
}
module.exports = { SystemAudio };
