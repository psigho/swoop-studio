import type {
  PointerSample,
  StudioSettings,
  ZoomRegion,
  TypingBurst,
} from "./types";

export const clamp = (n: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, n));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const smoothstep = (p: number) => {
  const t = clamp(p);
  return t * t * (3 - 2 * t);
};

/** Monotone camera curves avoid overshooting the chosen frame. */
export function ease(
  p: number,
  motion: StudioSettings["motion"] = "smooth",
): number {
  const t = clamp(p);
  if (motion === "snappy") return 1 - Math.pow(1 - t, 4);
  if (motion === "float") return t * t * t * (t * (t * 6 - 15) + 10);
  return smoothstep(t);
}

/** Pure time sampling makes a seek and a real-time export produce identical motion. */
export function samplePointer(
  samples: PointerSample[],
  time: number,
  smoothing = 65,
): PointerSample | null {
  if (!samples.length) return null;
  if (time <= samples[0].t) return { ...samples[0] };
  if (time >= samples[samples.length - 1].t)
    return { ...samples[samples.length - 1] };
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= time) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const linear = clamp((time - a.t) / Math.max(0.001, b.t - a.t));
  // Densely sampled native pointer movement is already smooth. Ease only gaps
  // large enough to represent an intentional movement rather than every poll.
  // Keep the cursor head on the captured clock. Easing between fast samples
  // makes it visibly fall behind; reserve easing for slow, sparse movements.
  const speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.001, b.t - a.t);
  const strength =
    clamp(smoothing / 100) *
    clamp((b.t - a.t - 1 / 30) / 0.18) *
    (1 - clamp(speed / 0.5));
  const p = lerp(linear, smoothstep(linear), strength);
  return {
    t: time,
    x: clamp(lerp(a.x, b.x, p)),
    y: clamp(lerp(a.y, b.y, p)),
    ...(a.visible === undefined ? {} : { visible: a.visible }),
    ...(a.pressed === undefined ? {} : { pressed: a.pressed }),
    ...(a.button === undefined ? {} : { button: a.button }),
  };
}

export function cameraAt(
  zooms: ZoomRegion[],
  time: number,
  motion: StudioSettings["motion"] = "smooth",
) {
  const active = zooms.find(
    (z) => time >= z.start && time <= z.end && z.end > z.start,
  );
  if (!active) return { x: 0.5, y: 0.5, scale: 1, strength: 0 };
  const transition = Math.min(
    (active.end - active.start) * 0.32,
    motion === "snappy" ? 0.4 : motion === "float" ? 0.95 : 0.7,
  );
  const enter = ease((time - active.start) / transition, motion);
  const leave = ease((active.end - time) / transition, motion);
  const strength = Math.min(enter, leave);
  const scale = lerp(1, clamp(active.scale, 1, 4), strength);
  const half = 0.5 / scale;
  return {
    x: clamp(lerp(0.5, clamp(active.x), strength), half, 1 - half),
    y: clamp(lerp(0.5, clamp(active.y), strength), half, 1 - half),
    scale,
    strength,
  };
}

/** Click clusters become deterministic, editable regions with quiet gaps. */
export function autoZoom(
  pointers: PointerSample[],
  duration: number,
  typing: TypingBurst[] = [],
): ZoomRegion[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const clicks = pointers
    .filter(
      (p) =>
        p.click &&
        p.visible !== false &&
        Number.isFinite(p.t) &&
        p.t >= 0 &&
        p.t <= duration,
    )
    .sort((a, b) => a.t - b.t);
  const groups: PointerSample[][] = [];
  for (const p of clicks) {
    const g = groups[groups.length - 1];
    if (
      g &&
      p.t - g[g.length - 1].t < 1.45 &&
      Math.hypot(p.x - g[0].x, p.y - g[0].y) < 0.26
    )
      g.push(p);
    else groups.push([p]);
  }
  const regions = groups.map((group, index): ZoomRegion => ({
    id: `auto-${index}-${Math.round(group[0].t * 1000)}`,
    start: Math.max(0, group[0].t - 0.8),
    end: Math.min(duration, group[group.length - 1].t + 1.75),
    x: clamp(group.reduce((sum, p) => sum + p.x, 0) / group.length),
    y: clamp(group.reduce((sum, p) => sum + p.y, 0) / group.length),
    scale: 1.75,
  }));
  for (let i = 1; i < regions.length; i++) {
    if (regions[i - 1].end > regions[i].start) {
      const boundary =
        (groups[i - 1][groups[i - 1].length - 1].t + groups[i][0].t) / 2;
      regions[i - 1].end = boundary;
      regions[i].start = boundary;
    }
  }
  const combined = [
    ...regions,
    ...typing
      .filter(
        (b) =>
          [b.start, b.end, b.x, b.y].every(Number.isFinite) &&
          b.end > b.start &&
          b.start < duration &&
          b.end >= 0,
      )
      .map((b, i) => ({
        id: `typing-${i}-${Math.round(b.start * 1000)}`,
        start: Math.max(0, b.start - 0.55),
        end: Math.min(duration, b.end + 1.5),
        x: clamp(b.x),
        y: clamp(b.y),
        scale: 1.85,
      })),
  ].sort((a, b) => a.start - b.start);
  const merged: ZoomRegion[] = [];
  for (const region of combined) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.end >= region.start &&
      Math.hypot(previous.x - region.x, previous.y - region.y) < 0.2
    ) {
      // Clicking into a field and typing is one steady camera hold.
      previous.end = Math.max(previous.end, region.end);
      if (region.id.startsWith("typing-"))
        Object.assign(previous, {
          x: region.x,
          y: region.y,
          scale: region.scale,
        });
    } else {
      if (previous && previous.end > region.start) {
        const boundary =
          (region.start + Math.min(previous.end, region.end)) / 2;
        previous.end = boundary;
        region.start = boundary;
      }
      merged.push(region);
    }
  }
  return merged.filter((z) => z.end - z.start >= 0.2);
}

export function outputDimensions(
  aspect: StudioSettings["aspect"],
  width = 1920,
) {
  const [a, b] = aspect.split(":").map(Number);
  const safeWidth = Math.max(320, Math.round(width / 2) * 2);
  return { width: safeWidth, height: Math.round((safeWidth * b) / a / 2) * 2 };
}
