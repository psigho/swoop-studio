import { clamp, samplePointer } from "./motion";
import type { PointerSample } from "./types";

export type TrailPoint = PointerSample & { age: number; strength: number };
export type ClickEffect = PointerSample & { age: number; progress: number };
export type DragGesture = {
  start: PointerSample;
  head: PointerSample;
  path: PointerSample[];
  active: boolean;
  releaseProgress: number;
  elapsed: number;
};

function between(a: TrailPoint, b: TrailPoint, amount: number): TrailPoint {
  return {
    ...a,
    t: a.t + (b.t - a.t) * amount,
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    age: a.age + (b.age - a.age) * amount,
    strength: a.strength + (b.strength - a.strength) * amount,
  };
}

/** Corner cutting stays inside the captured path's hull, without spline overshoot. */
function roundTrail(points: TrailPoint[], smoothing: number): TrailPoint[] {
  const cut = clamp(smoothing / 100) * 0.25;
  if (!cut || points.length < 3) return points;
  let rounded = points;
  for (let pass = 0; pass < 2; pass++) {
    const next = [rounded[0]];
    for (let i = 0; i < rounded.length - 1; i++) {
      next.push(between(rounded[i], rounded[i + 1], cut));
      next.push(between(rounded[i], rounded[i + 1], 1 - cut));
    }
    next.push(rounded[rounded.length - 1]);
    rounded = next;
  }
  return rounded;
}

function atOrBefore(samples: PointerSample[], time: number) {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (samples[middle].t <= time) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

/** Fixed time intervals make sparse recordings and backwards seeks render alike. */
export function sampleTrail(
  samples: PointerSample[],
  time: number,
  duration = 0.45,
  smoothing = 65,
  steps = 32,
): TrailPoint[] {
  if (!samples.length || time < samples[0].t) return [];
  const current = samplePointer(samples, time, smoothing);
  if (!current || current.visible === false) return [];
  const span = clamp(duration, 0.12, 1.2);
  let start = Math.max(samples[0].t, time - span);
  // Never bridge a trip outside the recorded display, even one shorter than a
  // sampling interval. The first visible event after it starts a fresh trail.
  const lastIndex = atOrBefore(samples, time);
  for (let i = lastIndex; i >= 0 && samples[i].t >= start; i--) {
    if (samples[i].visible === false) {
      start = Math.max(start, samples[i + 1]?.t ?? time);
      break;
    }
  }
  const count = Math.round(clamp(steps, 2, 96));
  const points: TrailPoint[] = [];
  for (let i = 0; i <= count; i++) {
    const t = time - span + (span * i) / count;
    if (t < start - 1e-9) continue;
    const point = samplePointer(samples, t, smoothing);
    if (point && point.visible !== false)
      points.push({ ...point, t, age: time - t, strength: i / count });
  }
  // The exact re-entry boundary prevents a tiny gap after the pointer returns.
  if (points.length && points[0].t > start + 1e-9) {
    const point = samplePointer(samples, start, smoothing)!;
    points.unshift({
      ...point,
      t: start,
      age: time - start,
      strength: clamp(1 - (time - start) / span),
    });
  }
  if (smoothing <= 0 || points.length < 2) return points;
  // A fixed time grid alone can skip a complete turn between two mouse polls.
  // Retain a bounded set of captured knots before rounding the centerline.
  const knots: TrailPoint[] = [];
  for (let i = lastIndex; i >= 0 && samples[i].t >= start; i--) {
    const point = samples[i];
    if (point.visible === false) break;
    knots.push({
      ...point,
      age: time - point.t,
      strength: clamp(1 - (time - point.t) / span),
    });
  }
  const stride = Math.max(1, Math.ceil(knots.length / 64));
  const combined = [...points, ...knots.filter((_, i) => i % stride === 0)]
    .sort((a, b) => a.t - b.t)
    .filter(
      (point, i, all) => i === all.length - 1 || all[i + 1].t - point.t > 1e-9,
    );
  return roundTrail(combined, smoothing);
}

/** Legacy click-only projects and new mouse-down events share one animation. */
export function clicksAt(
  samples: PointerSample[],
  time: number,
  lifetime = 0.72,
): ClickEffect[] {
  if (lifetime <= 0) return [];
  const result: ClickEffect[] = [];
  for (let i = atOrBefore(samples, time); i >= 0; i--) {
    const sample = samples[i];
    const age = time - sample.t;
    if (age > lifetime) break;
    if ((sample.click || sample.event === "down") && sample.visible !== false)
      result.push({ ...sample, age, progress: clamp(age / lifetime) });
  }
  return result.reverse();
}

/** A drag requires explicit held state; old click events never imply a hold. */
export function dragAt(
  samples: PointerSample[],
  time: number,
  smoothing = 65,
): DragGesture | null {
  const index = atOrBefore(samples, time);
  if (index < 0 || samplePointer(samples, time, smoothing)?.visible === false)
    return null;
  let stateIndex = index;
  while (stateIndex >= 0) {
    const sample = samples[stateIndex];
    if (sample.visible === false) return null;
    if (
      sample.event === "down" ||
      sample.event === "up" ||
      sample.pressed !== undefined
    )
      break;
    stateIndex--;
  }
  if (stateIndex < 0) return null;
  const state = samples[stateIndex];
  // pressed describes all held buttons. Releasing a secondary button must not
  // end a gesture while the primary button remains held.
  const active = state.pressed ?? state.event === "down";
  let releaseIndex = stateIndex;
  if (!active) {
    // Native tracking repeats pressed:false while idle. Keep the actual release
    // boundary so its short fade does not disappear at the next mouse poll.
    for (let i = stateIndex - 1; i >= 0; i--) {
      const sample = samples[i];
      if (sample.visible === false) return null;
      if (sample.event === "down" || sample.pressed === true) break;
      if (sample.event === "up" || sample.pressed === false) releaseIndex = i;
      if (time - samples[releaseIndex].t >= 0.4) return null;
    }
  }
  const release = samples[releaseIndex];
  const releaseProgress = active ? 0 : clamp((time - release.t) / 0.4);
  if (!active && releaseProgress >= 1) return null;
  const startIndex = active ? stateIndex : releaseIndex - 1;
  let foundHeldState = active;
  let foundStart = -1;
  for (let i = startIndex; i >= 0; i--) {
    const sample = samples[i];
    if (
      sample.visible === false ||
      (sample.event === "up" && sample.pressed !== true) ||
      sample.pressed === false
    )
      break;
    if (sample.event === "down") {
      foundHeldState = true;
      foundStart = i;
      // New recordings carry aggregate held state, so walk past secondary
      // presses to the beginning of this continuous hold. Event-only tracks
      // have no such state and their down event is the gesture boundary.
      if (sample.pressed === undefined) break;
    }
    if (sample.pressed === true) {
      foundHeldState = true;
      foundStart = i;
    }
  }
  if (!foundHeldState || foundStart < 0) return null;
  const start = samples[foundStart];
  const end = active ? time : release.t;
  const head = samplePointer(samples, end, smoothing)!;
  const path: PointerSample[] = [];
  const steps = Math.round(clamp((end - start.t) * 30, 2, 90));
  for (let i = 0; i <= steps; i++) {
    const t = start.t + ((end - start.t) * i) / steps;
    const point = samplePointer(samples, t, smoothing)!;
    path.push({ ...point, t });
  }
  // Distance, rather than a minimum duration, separates a drag from click
  // jitter. Fast native gestures can cross a screen between two video frames.
  // Measure the complete path so a loop returning to its start remains a drag.
  if (
    !path.some(
      (point) => Math.hypot(point.x - start.x, point.y - start.y) >= 0.008,
    )
  )
    return null;
  return { start, head, path, active, releaseProgress, elapsed: end - start.t };
}
