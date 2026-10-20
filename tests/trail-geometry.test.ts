import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrailGeometry,
  limitTrailLength,
  type TrailCenter,
} from "../src/studio/trail-geometry";

const center = (x: number, y: number, strength = 1, age = 0): TrailCenter => ({
  x,
  y,
  strength,
  age,
});

test("a screen-spanning jump keeps only a bounded tail and interpolates its age", () => {
  const points = [center(0, 0, 0, 0.6), center(1000, 0, 1, 0)];
  const clipped = limitTrailLength(points, 160);
  assert.equal(clipped.length, 2);
  assert.ok(Math.abs(clipped[0].x - 840) < 1e-9);
  assert.ok(Math.abs(clipped[0].strength - 0.84) < 1e-9);
  assert.ok(Math.abs(clipped[0].age - 0.096) < 1e-9);
  assert.deepEqual(clipped[1], points[1]);
  assert.deepEqual(points[0], center(0, 0, 0, 0.6));
});

test("tight reversals have round bounded joins without spikes or reversed winding", () => {
  const points = [
    center(0, 0, 0),
    center(60, 0, 0.3),
    center(0.01, 0, 0.6),
    center(60, 0, 0.8),
    center(30, 0, 1),
  ];
  const geometry = buildTrailGeometry(points, 240, 8);
  assert.ok(geometry.disks.length >= 3);
  for (const disk of geometry.disks) {
    assert.ok(Number.isFinite(disk.radius));
    assert.ok(disk.radius <= 8 && disk.radius >= 0);
  }
  for (const quad of geometry.quads) {
    let twiceArea = 0;
    quad.forEach((point, i) => {
      const next = quad[(i + 1) % quad.length];
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= -8 && point.x <= 68);
      assert.ok(Math.abs(point.y) <= 8);
      twiceArea += point.x * next.y - point.y * next.x;
    });
    // Matches the increasing-angle disk paths used in the single canvas fill.
    assert.ok(twiceArea >= -1e-9);
  }
});

test("a loop whose endpoints coincide retains geometry and an arc-length taper", () => {
  const points = [
    center(20, 20, 0),
    center(60, 20, 0.25),
    center(60, 60, 0.5),
    center(20, 60, 0.75),
    center(20, 20, 1),
  ];
  const geometry = buildTrailGeometry(points, 200, 10);
  assert.equal(geometry.length, 160);
  assert.equal(geometry.quads.length, 4);
  assert.equal(geometry.disks.at(-1)!.radius, 10);
  assert.ok(geometry.disks[0].radius < geometry.disks.at(-1)!.radius);
  assert.deepEqual(buildTrailGeometry(points, 200, 10), geometry);
});

test("stationary samples and malformed coordinates cannot create stray shapes", () => {
  assert.deepEqual(
    buildTrailGeometry([center(20, 20, 0), center(20, 20, 1)], 100, 8).disks,
    [],
  );
  const valid = buildTrailGeometry(
    [center(Number.NaN, 0), center(0, 0, 0), center(50, 0, 1)],
    100,
    8,
  );
  assert.equal(valid.centers.length, 2);
  assert.ok(valid.disks.every((disk) => Number.isFinite(disk.radius)));
  assert.deepEqual(limitTrailLength([center(0, 0), center(20, 0)], 0), []);
});
