"use strict";

const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const MAX_FRAME_BYTES = 32 * 1024 * 1024;

/** Bounded framing for our native JPEG stream; incomplete frames may span reads. */
class JpegFrames {
  constructor(onFrame) {
    this.buffer = Buffer.alloc(0);
    this.onFrame = onFrame;
  }
  push(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    if (this.buffer.length > MAX_FRAME_BYTES)
      throw new Error("Screen capture frame exceeded its size limit.");
    while (this.buffer.length > 1) {
      const start = this.buffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) {
        this.buffer = this.buffer.subarray(-1);
        return;
      }
      if (start) this.buffer = this.buffer.subarray(start);
      const end = this.buffer.indexOf(Buffer.from([0xff, 0xd9]), 2);
      if (end < 0) return;
      this.onFrame(Buffer.from(this.buffer.subarray(0, end + 2)));
      this.buffer = this.buffer.subarray(end + 2);
    }
  }
}

function captureArguments(target) {
  if (target.windowHandle) {
    if (!/^[1-9]\d*$/.test(target.windowHandle))
      throw new Error("Invalid capture window.");
    return ["--window", target.windowHandle];
  } else {
    const { x, y, width, height } = target.bounds || {};
    if (
      ![x, y, width, height].every(Number.isSafeInteger) ||
      width < 1 ||
      height < 1 ||
      width > 16384 ||
      height > 16384
    )
      throw new Error("Invalid capture display bounds.");
    return ["--display", String(x), String(y), String(width), String(height)];
  }
}

/** Only one frame may be in IPC at a time. Slow consumers drop old frames, never queue them. */
class CleanCapture {
  constructor({ executable, target, onFrame, spawnProcess = spawn }) {
    this.id = randomUUID();
    this.onFrame = onFrame;
    this.closed = false;
    this.latest = null;
    this.inFlight = false;
    this.started = false;
    let readyResolve, readyReject;
    this.ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    this.rejectReady = readyReject;
    this.child = spawnProcess(executable, [...captureArguments(target), "--parent", String(process.pid)], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let diagnostic = "";
    this.child.stderr.on("data", (bytes) => {
      diagnostic = (diagnostic + bytes.toString()).slice(-2000);
    });
    const fail = (error) => {
      if (this.closed) return;
      const detail = error.message || String(error);
      readyReject(new Error(detail));
      this.onFrame({ id: this.id, error: detail });
      this.stop();
    };
    const frames = new JpegFrames((bytes) => {
      this.latest = bytes;
      if (!this.started) {
        this.started = true;
        clearTimeout(this.timeout);
        readyResolve(this.id);
      }
      this.deliver();
    });
    this.child.stdout.on("data", (bytes) => {
      if (!this.closed) {
        try {
          frames.push(bytes);
        } catch (error) {
          fail(error);
        }
      }
    });
    this.child.on("error", fail);
    this.child.on("exit", () =>
      fail(
        new Error(
          `Screen capture stopped. Keep the selected window open and visible. ${diagnostic.trim()}`,
        ),
      ),
    );
    this.timeout = setTimeout(
      () =>
        fail(
          new Error(
            "The selected source did not produce a frame. Restore its window or choose a full display.",
          ),
        ),
      15000,
    );
    // The renderer arms delivery only after receiving this session's ID.
    this.inFlight = true;
  }
  deliver() {
    if (this.closed || this.inFlight || !this.latest) return;
    const bytes = this.latest;
    this.latest = null;
    this.inFlight = true;
    this.onFrame({ id: this.id, bytes });
  }
  acknowledge(id) {
    if (id === this.id && !this.closed) {
      this.inFlight = false;
      this.deliver();
    }
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timeout);
    this.latest = null;
    this.rejectReady(new Error("Screen capture was stopped."));
    this.child.kill();
  }
}

module.exports = {
  CleanCapture,
  JpegFrames,
  captureArguments,
  MAX_FRAME_BYTES,
};
