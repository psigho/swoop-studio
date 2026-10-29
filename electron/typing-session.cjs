"use strict";

// Only aggregate times and normalized focus coordinates survive this session.
// Hook event objects and key codes are never retained or returned to the page.
class TypingSession {
  constructor({
    clock,
    getFocus,
    getFallback,
    bounds,
    windowHandle,
    isTypingKey,
  }) {
    Object.assign(this, {
      clock,
      getFocus,
      getFallback,
      bounds,
      windowHandle,
      isTypingKey,
    });
    this.bursts = [];
    this.current = null;
    this.stopped = false;
    this.generation = 0;
  }
  key(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) this.pause();
    if (
      this.stopped ||
      this.clock.pausedAt !== null ||
      !this.isTypingKey(event)
    )
      return;
    const t = this.clock.elapsed();
    if (this.current && t - this.current.end < 1.1) {
      this.current.end = t;
      this.current.count++;
      return;
    }
    if (this.bursts.length >= 10000) return;
    const fallback = this.getFallback();
    const burst = {
      start: t,
      end: t,
      x: fallback.x,
      y: fallback.y,
      count: 1,
      valid: false,
    };
    this.bursts.push(burst);
    this.current = burst;
    const generation = this.generation;
    // Query once per burst, on a separate process. Never block a native input event.
    void this.getFocus()
      .then((focus) => {
        if (
          this.stopped ||
          generation !== this.generation ||
          focus.password ||
          (this.windowHandle && focus.window !== this.windowHandle)
        )
          return;
        const { x, y, width, height } = this.bounds;
        if (focus.found) {
          const px = (focus.x - x) / width,
            py = (focus.y - y) / height;
          if (
            ![px, py].every(Number.isFinite) ||
            px < 0 ||
            px > 1 ||
            py < 0 ||
            py > 1
          )
            return;
          burst.x = px;
          burst.y = py;
          burst.valid = true;
        }
        // Without caret geometry, only use an actual click inside the source.
        else if (
          fallback.visible &&
          (this.windowHandle
            ? focus.window === this.windowHandle
            : focus.inBounds === true)
        )
          burst.valid = true;
      })
      .catch(() => {});
  }
  pause() {
    this.current = null;
    this.generation++;
  }
  stop() {
    this.stopped = true;
    return this.bursts
      .filter((b) => b.valid && b.count >= 2 && b.end > b.start)
      .map(({ start, end, x, y }) => ({ start, end, x, y }));
  }
}
module.exports = { TypingSession };
