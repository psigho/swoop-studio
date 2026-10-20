export type TrailCenter = {
  x: number;
  y: number;
  age: number;
  strength: number;
};

type Point = { x: number; y: number };
export type TrailGeometry = {
  centers: TrailCenter[];
  disks: (Point & { radius: number })[];
  quads: [Point, Point, Point, Point][];
  length: number;
};

/** Keep a short spatial tail even when a fast poll spans most of the screen. */
export function limitTrailLength(
  points: TrailCenter[],
  maxLength: number,
): TrailCenter[] {
  if (!Number.isFinite(maxLength) || maxLength <= 0) return [];
  const centers: TrailCenter[] = [];
  for (const point of points) {
    if (![point.x, point.y, point.age, point.strength].every(Number.isFinite))
      continue;
    const previous = centers.at(-1);
    if (
      previous &&
      Math.hypot(point.x - previous.x, point.y - previous.y) < 0.001
    )
      centers[centers.length - 1] = point;
    else centers.push(point);
  }
  if (centers.length < 2) return centers;
  const result = [centers.at(-1)!];
  let remaining = maxLength;
  for (let i = centers.length - 2; i >= 0; i--) {
    const a = centers[i];
    const b = centers[i + 1];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance > remaining) {
      const fraction = 1 - remaining / distance;
      result.unshift({
        x: a.x + (b.x - a.x) * fraction,
        y: a.y + (b.y - a.y) * fraction,
        age: a.age + (b.age - a.age) * fraction,
        strength: a.strength + (b.strength - a.strength) * fraction,
      });
      break;
    }
    result.unshift(a);
    remaining -= distance;
    if (remaining <= 0.001) break;
  }
  return result;
}

/**
 * A swept set of disks has bounded round joins, including exact U-turns. Every
 * disk and tangent quad winds in the same direction so a single canvas fill
 * takes their union without accumulating opacity at overlaps. The taper follows
 * arc length rather than a screen-space gradient, so loops retain their color.
 */
export function buildTrailGeometry(
  points: TrailCenter[],
  maxLength: number,
  maxRadius: number,
): TrailGeometry {
  const centers = limitTrailLength(points, maxLength);
  const result: TrailGeometry = { centers, disks: [], quads: [], length: 0 };
  if (centers.length < 2 || !Number.isFinite(maxRadius) || maxRadius <= 0)
    return result;
  const distances = centers.map((point, i) =>
    i ? Math.hypot(point.x - centers[i - 1].x, point.y - centers[i - 1].y) : 0,
  );
  result.length = distances.reduce((sum, distance) => sum + distance, 0);
  if (result.length < 0.001) return result;
  let traveled = 0;
  const radii = centers.map((point, i) => {
    traveled += distances[i];
    const strength = Math.max(0, Math.min(1, point.strength));
    const radius =
      maxRadius *
      strength *
      Math.sin((traveled / result.length) * Math.PI * 0.5);
    if (radius > 0.001) result.disks.push({ x: point.x, y: point.y, radius });
    return radius;
  });
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1];
    const b = centers[i];
    const ra = radii[i - 1];
    const rb = radii[i];
    const distance = distances[i];
    // A containing disk already covers this segment. This also avoids unstable
    // tangent calculations when stationary samples have different strengths.
    if (distance <= Math.abs(ra - rb) + 0.001) continue;
    const dx = (b.x - a.x) / distance;
    const dy = (b.y - a.y) / distance;
    const slope = (ra - rb) / distance;
    const side = Math.sqrt(Math.max(0, 1 - slope * slope));
    const upper = { x: dx * slope - dy * side, y: dy * slope + dx * side };
    const lower = { x: dx * slope + dy * side, y: dy * slope - dx * side };
    result.quads.push([
      { x: a.x + lower.x * ra, y: a.y + lower.y * ra },
      { x: b.x + lower.x * rb, y: b.y + lower.y * rb },
      { x: b.x + upper.x * rb, y: b.y + upper.y * rb },
      { x: a.x + upper.x * ra, y: a.y + upper.y * ra },
    ]);
  }
  return result;
}
