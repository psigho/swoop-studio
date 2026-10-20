import test from "node:test";
import assert from "node:assert/strict";
import { clicksAt, dragAt, sampleTrail } from "../src/studio/effects";
import { samplePointer } from "../src/studio/motion";
import type { PointerSample } from "../src/studio/types";

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("trail samples time rather than event density and stays deterministic on seek", () => {
  const sparse = [
    { t: 0, x: 0, y: 0 },
    { t: 2, x: 1, y: 0.5 },
  ];
  const dense = Array.from({ length: 201 }, (_, i) => ({
    t: i / 100,
    x: i / 200,
    y: i / 400,
  }));
  const first = sampleTrail(sparse, 1, 0.6, 0);
  const second = sampleTrail(dense, 1, 0.6, 0);
  assert.equal(first.length, 33);
  assert.equal(second.length, first.length);
  first.forEach((point, i) => {
    close(point.t, second[i].t);
    close(point.x, second[i].x);
    close(point.y, second[i].y);
    close(point.age, second[i].age);
  });
  close(first[0].age, 0.6);
  close(first.at(-1)!.age, 0);
  close(first.at(-1)!.strength, 1);
  sampleTrail(sparse, 1.8, 0.6, 0);
  assert.deepEqual(sampleTrail(sparse, 1, 0.6, 0), first);
});

test("trail has no history before recording and disappears while pointer is outside", () => {
  assert.deepEqual(sampleTrail([], 1), []);
  assert.deepEqual(sampleTrail([{ t: 1, x: 0.1, y: 0.2 }], 0.5), []);
  const samples = [
    { t: 0, x: 0.1, y: 0.2, visible: true },
    { t: 0.4, x: 0.2, y: 0.3, visible: false },
    { t: 0.405, x: 0.8, y: 0.3, visible: true },
    { t: 1, x: 0.9, y: 0.4, visible: true },
  ];
  assert.deepEqual(sampleTrail(samples, 0.402), []);
  const reentered = sampleTrail(samples, 0.45, 0.45, 0, 8);
  assert.ok(reentered.length >= 2);
  assert.ok(reentered.every((point) => point.t >= 0.405));
  close(reentered[0].t, 0.405);
  assert.ok(reentered.every((point) => point.x >= 0.8));
});

test("trail rounds a captured corner without overshooting or moving its head", () => {
  const samples: PointerSample[] = [
    { t: 0, x: 0.1, y: 0.1 },
    { t: 0.25, x: 0.5, y: 0.1 },
    { t: 0.5, x: 0.5, y: 0.5 },
  ];
  const turns = (points: ReturnType<typeof sampleTrail>) => {
    let largest = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const a = {
        x: points[i].x - points[i - 1].x,
        y: points[i].y - points[i - 1].y,
      };
      const b = {
        x: points[i + 1].x - points[i].x,
        y: points[i + 1].y - points[i].y,
      };
      const length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
      if (length > 1e-12)
        largest = Math.max(
          largest,
          Math.acos(
            Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / length)),
          ),
        );
    }
    return largest;
  };
  const raw = sampleTrail(samples, 0.5, 0.5, 0);
  const smooth = sampleTrail(samples, 0.5, 0.5, 100);
  assert.ok(turns(smooth) < turns(raw) * 0.6);
  assert.ok(
    smooth.every((p) => p.x >= 0.1 && p.x <= 0.5 && p.y >= 0.1 && p.y <= 0.5),
  );
  close(smooth.at(-1)!.x, 0.5);
  close(smooth.at(-1)!.y, 0.5);
  close(smooth.at(-1)!.t, 0.5);
  close(smooth.at(-1)!.age, 0);
  sampleTrail(samples, 0.8, 0.5, 100);
  assert.deepEqual(sampleTrail(samples, 0.5, 0.5, 100), smooth);
});

test("a short captured turn is retained between uniform trail sample times", () => {
  const samples = [
    { t: 0, x: 0.1, y: 0.1 },
    { t: 0.2, x: 0.1, y: 0.1 },
    { t: 0.201, x: 0.5, y: 0.6 },
    { t: 0.202, x: 0.9, y: 0.1 },
    { t: 0.3, x: 0.9, y: 0.1 },
  ];
  const smooth = sampleTrail(samples, 0.3, 0.3, 100);
  assert.ok(Math.max(...smooth.map((p) => p.y)) > 0.3);
  assert.ok(smooth.every((p) => p.y <= 0.6));
  close(smooth.at(-1)!.x, 0.9);
});

test("click animations preserve legacy data, handle down events once, and expire", () => {
  const samples: PointerSample[] = [
    { t: 0, x: 0.1, y: 0.2, click: true },
    { t: 0.2, x: 0.5, y: 0.4, click: true, event: "down", pressed: true },
    { t: 0.3, x: 0.5, y: 0.4, event: "up", pressed: false },
    { t: 0.4, x: 0.5, y: 0.4, event: "down", visible: false },
  ];
  assert.equal(clicksAt(samples, 0.3).length, 2);
  close(clicksAt(samples, 0.3)[1].age, 0.1);
  assert.equal(clicksAt(samples, 0.8).length, 1);
  assert.deepEqual(clicksAt(samples, 1), []);
  assert.deepEqual(clicksAt(samples, -1), []);
});

test("legacy clicks never produce persistent drags", () => {
  const samples = [
    { t: 0, x: 0.1, y: 0.2, click: true },
    { t: 0.5, x: 0.8, y: 0.4 },
    { t: 1, x: 0.9, y: 0.5, click: true },
  ];
  assert.equal(dragAt(samples, 0.5), null);
  assert.equal(dragAt(samples, 5), null);
});

test("explicit drags remain active, fade on release, and seek reproducibly", () => {
  const samples: PointerSample[] = [
    { t: 0, x: 0.1, y: 0.2, pressed: false },
    { t: 1, x: 0.1, y: 0.2, event: "down", pressed: true },
    { t: 2, x: 0.5, y: 0.4, event: "move", pressed: true },
    { t: 3, x: 0.8, y: 0.6, event: "up", pressed: false },
    { t: 3.05, x: 0.9, y: 0.6, event: "move", pressed: false },
    { t: 3.15, x: 0.95, y: 0.6, event: "move", pressed: false },
  ];
  const active = dragAt(samples, 2.5, 0)!;
  assert.equal(active.active, true);
  assert.equal(active.start.t, 1);
  close(active.head.x, 0.65);
  const released = dragAt(samples, 3.2, 0)!;
  assert.equal(released.active, false);
  close(released.releaseProgress, 0.5);
  close(released.head.x, 0.8);
  assert.equal(dragAt(samples, 3.5), null);
  assert.deepEqual(dragAt(samples, 2.5, 0), active);
});

test("pressed-only tracking supports drags and hides gestures after display exit", () => {
  const samples: PointerSample[] = [
    { t: 0, x: 0.1, y: 0.2, pressed: false },
    { t: 1, x: 0.1, y: 0.2, pressed: true },
    { t: 2, x: 0.8, y: 0.6, pressed: true },
    { t: 2.1, x: 0.8, y: 0.6, pressed: true, visible: false },
    { t: 2.2, x: 0.2, y: 0.6, pressed: true, visible: true },
  ];
  assert.equal(dragAt(samples, 1.5)?.active, true);
  assert.equal(dragAt(samples, 2.15), null);
  assert.equal(dragAt(samples, 2.2), null);
});

test("click jitter stays a click while a drag loop still has a visible path", () => {
  const jitter: PointerSample[] = [
    { t: 0, x: 0.5, y: 0.5, event: "down" },
    { t: 0.2, x: 0.501, y: 0.502, event: "up" },
  ];
  assert.equal(dragAt(jitter, 0.2), null);
  const loop: PointerSample[] = [
    { t: 0, x: 0.5, y: 0.5, event: "down" },
    { t: 0.5, x: 0.9, y: 0.8 },
    { t: 1, x: 0.5, y: 0.5, event: "up" },
  ];
  assert.ok(dragAt(loop, 1)?.path.length);
});

test("sampled pointer keeps held state without replaying click or down events", () => {
  const samples: PointerSample[] = [
    {
      t: 0,
      x: 0.1,
      y: 0.2,
      event: "down",
      click: true,
      pressed: true,
      button: 1,
    },
    { t: 1, x: 0.5, y: 0.6, event: "up", pressed: false, button: 1 },
  ];
  const middle = samplePointer(samples, 0.5)!;
  assert.equal(middle.pressed, true);
  assert.equal(middle.button, 1);
  assert.equal(middle.event, undefined);
  assert.equal(middle.click, undefined);
  assert.equal(samplePointer(samples, 1)?.pressed, false);
});

test("releasing a secondary button preserves the primary held drag and its origin", () => {
  const samples: PointerSample[] = [
    { t: 0, x: 0.1, y: 0.2, pressed: false },
    { t: 1, x: 0.1, y: 0.2, event: "down", pressed: true, button: 1 },
    { t: 1.5, x: 0.4, y: 0.3, event: "down", pressed: true, button: 2 },
    { t: 2, x: 0.6, y: 0.4, event: "up", pressed: true, button: 2 },
    { t: 2.5, x: 0.7, y: 0.5, event: "move", pressed: true, button: 1 },
    { t: 3, x: 0.8, y: 0.6, event: "up", pressed: false, button: 1 },
  ];
  const active = dragAt(samples, 2.1, 0)!;
  assert.equal(active.active, true);
  assert.equal(active.start.t, 1);
  assert.equal(active.start.button, 1);
  const released = dragAt(samples, 3.1, 0)!;
  assert.equal(released.active, false);
  assert.equal(released.start.t, 1);
  close(released.releaseProgress, 0.25);
});

test("a 19ms native drag keeps its full path and release fade at every smoothing level", () => {
  // Coordinates and event spacing from a real 870px Windows drag capture.
  const samples: PointerSample[] = [
    { t: 18.4, x: 0.136505, y: 0.668516, pressed: false },
    {
      t: 18.4221,
      x: 0.136505,
      y: 0.668516,
      event: "down",
      pressed: true,
      button: 1,
      visible: true,
    },
    {
      t: 18.4344,
      x: 0.815133,
      y: 0.668516,
      event: "move",
      pressed: true,
      button: 1,
      visible: true,
    },
    {
      t: 18.441,
      x: 0.815133,
      y: 0.668516,
      event: "up",
      pressed: false,
      button: 1,
      visible: true,
    },
    { t: 18.46, x: 0.9, y: 0.7, event: "move", pressed: false, visible: true },
  ];
  for (const smoothing of [0, 65, 100]) {
    const active = dragAt(samples, 18.43, smoothing)!;
    assert.equal(active.active, true);
    assert.ok(active.head.x > active.start.x && active.head.x < 0.815133);
    const released = dragAt(samples, 18.641, smoothing)!;
    assert.equal(released.active, false);
    close(released.elapsed, 0.0189);
    close(released.releaseProgress, 0.5);
    close(released.head.x, 0.815133);
    close(released.head.y, 0.668516);
    close(released.path[0].x, 0.136505);
    close(released.path.at(-1)!.x, 0.815133);
    close(released.path.at(-1)!.t, 18.441);
    assert.equal(dragAt(samples, 18.842, smoothing), null);
    assert.deepEqual(dragAt(samples, 18.641, smoothing), released);
  }
});

test("fast stationary clicks and tiny jitter still do not become drags", () => {
  for (const jitter of [0, 0.003]) {
    const samples: PointerSample[] = [
      { t: 1, x: 0.5, y: 0.5, event: "down", pressed: true },
      { t: 1.019, x: 0.5 + jitter, y: 0.5, event: "up", pressed: false },
    ];
    assert.equal(dragAt(samples, 1.01), null);
    assert.equal(dragAt(samples, 1.1), null);
  }
});
