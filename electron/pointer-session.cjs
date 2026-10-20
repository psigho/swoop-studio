"use strict";

const { performance } = require("node:perf_hooks");

/** A recording clock whose timeline stops when the video recorder pauses. */
class PointerSession {
  constructor({
    bounds,
    getPoint,
    now = () => performance.now(),
    period = 1000 / 30,
    maxSamples = 648000,
  }) {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0)
      throw new Error("Invalid capture bounds.");
    this.bounds = { ...bounds };
    this.getPoint = getPoint;
    this.now = now;
    this.period = period;
    this.maxSamples = maxSamples;
    this.points = [];
    this.started = now();
    this.pausedAt = null;
    this.pausedDuration = 0;
    this.stopped = false;
    this.timer = null;
    this.pressedButtons = new Set();
    this.pausedReleases = new Set();
  }

  start() {
    this.sample();
    this.timer = setInterval(() => this.sample(), this.period);
    this.timer.unref?.();
    return this;
  }

  sample(event = "move", button) {
    if (this.stopped) return;
    // Keep the legacy boolean call compatible with older integrations.
    event = event === true ? "down" : event === false ? "move" : event;
    if (!["move", "down", "up"].includes(event)) event = "move";
    const trackedButton = Number.isInteger(button) ? button : 0;
    if (event === "down") this.pressedButtons.add(trackedButton);
    else if (event === "up") {
      if (Number.isInteger(button)) this.pressedButtons.delete(button);
      else this.pressedButtons.clear();
      // A release must still update state when the recording clock is paused.
      if (this.pausedAt !== null) this.pausedReleases.add(trackedButton);
    }
    this.appendSample(event, button);
  }

  appendSample(event = "move", button, terminal = false) {
    if (
      this.stopped ||
      this.pausedAt !== null ||
      (!terminal && this.points.length >= this.maxSamples)
    )
      return;
    let point;
    try {
      point = this.getPoint();
    } catch {
      return;
    }
    const { x, y, width, height } = this.bounds;
    const px = (point.x - x) / width;
    const py = (point.y - y) / height;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const sample = {
      t: Math.max(
        0,
        Math.round((this.now() - this.started - this.pausedDuration) * 10) /
          10000,
      ),
      x: Math.round(Math.max(0, Math.min(1, px)) * 1000000) / 1000000,
      y: Math.round(Math.max(0, Math.min(1, py)) * 1000000) / 1000000,
      visible: px >= 0 && px <= 1 && py >= 0 && py <= 1,
      event,
      pressed: this.pressedButtons.size > 0,
    };
    const activeButton = Number.isInteger(button)
      ? button
      : this.pressedButtons.values().next().value;
    if (Number.isInteger(activeButton)) sample.button = activeButton;
    if (event === "down") {
      sample.click = true;
    }
    if (terminal && this.points.length >= this.maxSamples)
      this.points[this.points.length - 1] = sample;
    else this.points.push(sample);
  }

  pause(paused) {
    if (this.stopped) return;
    if (paused && this.pausedAt === null) this.pausedAt = this.now();
    else if (!paused && this.pausedAt !== null) {
      this.pausedDuration += this.now() - this.pausedAt;
      this.pausedAt = null;
      for (const button of this.pausedReleases) {
        if (!this.pressedButtons.has(button)) this.appendSample("up", button);
      }
      this.pausedReleases.clear();
      this.sample();
    }
  }

  stop() {
    if (!this.stopped) {
      // Close a drag on the final recorded frame, including a stop while paused.
      const wasPressed = this.pressedButtons.size > 0;
      const button = this.pressedButtons.values().next().value;
      this.pressedButtons.clear();
      if (this.pausedAt !== null) {
        this.pausedDuration += this.now() - this.pausedAt;
        this.pausedAt = null;
      }
      if (wasPressed || this.pausedReleases.size)
        this.appendSample("up", button, true);
      else this.sample();
      this.pausedReleases.clear();
    }
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = null;
    return this.points;
  }
}

module.exports = { PointerSession };
