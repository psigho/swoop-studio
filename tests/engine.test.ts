import test from "node:test";
import assert from "node:assert/strict";
import {
  autoZoom,
  cameraAt,
  ease,
  outputDimensions,
  samplePointer,
} from "../src/studio/motion";
import { DEMO_POINTERS, DEMO_ZOOMS } from "../src/studio/demo";
import { withWebmDuration } from "../src/studio/webm";
import { DEFAULT_SETTINGS } from "../src/studio/types";
import { getContentRect, sourcePointAt } from "../src/studio/renderer";

test("all motion profiles stay monotone and land on their endpoints", () => {
  for (const profile of ["smooth", "snappy", "float"] as const) {
    assert.equal(ease(-1, profile), 0);
    assert.equal(ease(2, profile), 1);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const next = ease(i / 100, profile);
      assert.ok(next >= previous - 1e-12);
      previous = next;
    }
  }
});
test("sampling survives sparse events and seeking backwards", () => {
  const pointers = [
    { t: 0, x: 0, y: 0 },
    { t: 2, x: 1, y: 0.5 },
  ];
  assert.equal(samplePointer([], 2), null);
  assert.deepEqual(samplePointer(pointers, -1), pointers[0]);
  assert.deepEqual(samplePointer(pointers, 20), pointers[1]);
  assert.deepEqual(samplePointer(pointers, 1), { t: 1, x: 0.5, y: 0.25 });
  const first = samplePointer(pointers, 0.7);
  samplePointer(pointers, 1.8);
  assert.deepEqual(samplePointer(pointers, 0.7), first);
});
test("pointer visibility follows event boundaries rather than interpolating across displays", () => {
  const points = [
    { t: 0, x: 0.1, y: 0.2, visible: true },
    { t: 1, x: 0.9, y: 0.8, visible: false },
    { t: 2, x: 0.5, y: 0.5, visible: true },
  ];
  assert.equal(samplePointer(points, 0.99)?.visible, true);
  assert.equal(samplePointer(points, 1)?.visible, false);
  assert.equal(samplePointer(points, 1.99)?.visible, false);
  assert.equal(samplePointer(points, 2)?.visible, true);
  assert.deepEqual(
    autoZoom([{ t: 1, x: 0.5, y: 0.5, click: true, visible: false }], 5),
    [],
  );
});
test("camera eases to identity at both boundaries and never reveals outside source", () => {
  const regions = [
    { id: "left", start: 1, end: 5, x: 0.01, y: 0.99, scale: 2 },
  ];
  assert.equal(cameraAt(regions, 1).scale, 1);
  assert.equal(cameraAt(regions, 5).scale, 1);
  assert.equal(cameraAt(regions, 0).scale, 1);
  for (let t = 0; t < 6; t += 0.01) {
    const c = cameraAt(regions, t);
    const half = 0.5 / c.scale;
    assert.ok(c.x - half >= -1e-10 && c.x + half <= 1 + 1e-10);
    assert.ok(c.y - half >= -1e-10 && c.y + half <= 1 + 1e-10);
  }
  assert.equal(cameraAt(regions, 3).scale, 2);
});
test("click clustering merges nearby clicks but separates distinct interactions without overlap", () => {
  const result = autoZoom(
    [
      { t: 1, x: 0.2, y: 0.3, click: true },
      { t: 1.4, x: 0.23, y: 0.32, click: true },
      { t: 2, x: 0.8, y: 0.7, click: true },
      { t: 4.8, x: 0.4, y: 0.4, click: true },
    ],
    5,
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].x, 0.21500000000000002);
  assert.ok(result[0].start < 1 && result[0].end > 1.4);
  assert.ok(result[1].start < 2 && result[1].end > 2);
  for (let i = 0; i < result.length; i++) {
    assert.ok(
      result[i].start >= 0 &&
        result[i].end <= 5 &&
        result[i].end > result[i].start,
    );
    if (i) assert.ok(result[i - 1].end <= result[i].start);
  }
  assert.deepEqual(autoZoom([], 8), []);
  assert.deepEqual(autoZoom(DEMO_POINTERS, 0), []);
});
test("export sizes are even and honor each aspect ratio", () => {
  assert.deepEqual(outputDimensions("16:9"), { width: 1920, height: 1080 });
  assert.deepEqual(outputDimensions("9:16", 1080), {
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(outputDimensions("1:1", 1080), {
    width: 1080,
    height: 1080,
  });
  assert.deepEqual(outputDimensions("4:3"), { width: 1920, height: 1440 });
});
test("preview clicks map through source fitting and camera zoom without hitting background", () => {
  const rect = getContentRect(1280, 720, DEFAULT_SETTINGS);
  const options = {
    width: 1280,
    height: 720,
    settings: { ...DEFAULT_SETTINGS, intro: "none" as const },
    isDemo: true,
    time: 2,
    duration: 12,
    zooms: [{ id: "focus", start: 0, end: 5, x: 0.6, y: 0.6, scale: 2 }],
    pointers: [],
  };
  assert.equal(sourcePointAt(0, 0, options), null);
  assert.deepEqual(
    sourcePointAt(rect.x + rect.width / 2, rect.y + rect.height / 2, options),
    { x: 0.6, y: 0.6 },
  );
  const edge = sourcePointAt(rect.x, rect.y, options)!;
  assert.ok(Math.abs(edge.x - 0.35) < 1e-10 && Math.abs(edge.y - 0.35) < 1e-10);
});
test("demo timeline is ordered and sample coordinates are normalized", () => {
  for (let i = 1; i < DEMO_POINTERS.length; i++)
    assert.ok(DEMO_POINTERS[i].t > DEMO_POINTERS[i - 1].t);
  for (const p of DEMO_POINTERS)
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  for (let i = 1; i < DEMO_ZOOMS.length; i++)
    assert.ok(DEMO_ZOOMS[i].start >= DEMO_ZOOMS[i - 1].end);
});
test("streamed WebM gains finite duration without changing media payload", async () => {
  const bytes = new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0x15, 0x49, 0xa9, 0x66, 0x87, 0x2a, 0xd7,
    0xb1, 0x83, 0x0f, 0x42, 0x40, 0x1f, 0x43, 0xb6, 0x75, 0x83, 0x01, 0x02,
    0x03,
  ]);
  const original = new Blob([bytes], { type: "video/webm" });
  const patched = new Uint8Array(
    await (await withWebmDuration(original, 4.5)).arrayBuffer(),
  );
  assert.equal(patched.length, bytes.length + 11);
  assert.deepEqual([...patched.slice(-8)], [...bytes.slice(-8)]);
  assert.equal(patched[21], 0x92);
  assert.deepEqual([...patched.slice(29, 32)], [0x44, 0x89, 0x88]);
  assert.equal(new DataView(patched.buffer).getFloat64(32, false), 4500);
  assert.equal(await withWebmDuration(original, 0), original);
});
