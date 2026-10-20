"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PointerSession } = require("./pointer-session.cjs");

test("normalizes a secondary display with a negative desktop origin", () => {
  let clock = 1000;
  const session = new PointerSession({
    bounds: { x: -1920, y: 200, width: 1920, height: 1080 },
    getPoint: () => ({ x: -960, y: 470 }),
    now: () => clock,
  });
  clock += 250;
  session.sample(true, 1);
  const [point] = session.stop();
  assert.deepEqual(point, {
    t: 0.25,
    x: 0.5,
    y: 0.25,
    visible: true,
    click: true,
    button: 1,
    event: "down",
    pressed: true,
  });
});

test("omits paused time and suppresses pointer and click samples while paused", () => {
  let clock = 0;
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => ({ x: 25, y: 75 }),
    now: () => clock,
  });
  session.sample();
  clock = 1000;
  session.pause(true);
  clock = 6000;
  session.sample(true);
  assert.equal(session.points.length, 1);
  session.pause(false);
  assert.equal(session.points.at(-1).t, 1);
  clock = 7000;
  const points = session.stop();
  assert.equal(points.at(-1).t, 2);
  assert.equal(
    points.some((point) => point.click),
    false,
  );
});

test("marks out-of-window pointers invisible while keeping coordinates bounded", () => {
  const session = new PointerSession({
    bounds: { x: 100, y: 100, width: 400, height: 200 },
    getPoint: () => ({ x: 80, y: 800 }),
    now: () => 0,
  });
  const [point] = session.stop();
  assert.deepEqual(point, {
    t: 0,
    x: 0,
    y: 1,
    visible: false,
    event: "move",
    pressed: false,
  });
});

test("bounds sample memory and ignores samples after stop", () => {
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => ({ x: 50, y: 50 }),
    now: () => 0,
    maxSamples: 3,
  });
  for (let i = 0; i < 10; i++) session.sample();
  session.stop();
  session.sample(true);
  assert.equal(session.points.length, 3);
});

test("repeated pause calls do not corrupt the recording clock", () => {
  let clock = 0;
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => ({ x: 0, y: 0 }),
    now: () => clock,
  });
  clock = 500;
  session.pause(true);
  clock = 1000;
  session.pause(true);
  clock = 1500;
  session.pause(false);
  session.pause(false);
  clock = 1750;
  assert.equal(session.stop().at(-1).t, 0.75);
});

test("captures down, held movement, and up as distinct drag states", () => {
  let clock = 0;
  let point = { x: 10, y: 20 };
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => point,
    now: () => clock,
  });
  session.sample("down", 1);
  clock = 100;
  point = { x: 60, y: 50 };
  session.sample();
  clock = 200;
  session.sample("up", 1);
  const points = session.stop();
  assert.equal(points[0].event, "down");
  assert.equal(points[0].click, true);
  assert.equal(points[1].event, "move");
  assert.equal(points[1].pressed, true);
  assert.equal(points[1].button, 1);
  assert.equal(points[1].x, 0.6);
  assert.equal(points[2].event, "up");
  assert.equal(points[2].pressed, false);
  assert.equal(points[2].click, undefined);
});

test("a release while paused closes the drag at resume without replaying a click", () => {
  let clock = 0;
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => ({ x: 25, y: 50 }),
    now: () => clock,
  });
  session.sample("down", 1);
  clock = 100;
  session.pause(true);
  clock = 1000;
  session.sample("up", 1);
  assert.equal(session.points.length, 1);
  clock = 2000;
  session.pause(false);
  assert.equal(session.points[1].event, "up");
  assert.equal(session.points[1].t, 0.1);
  assert.equal(session.points[1].pressed, false);
  assert.equal(session.points.at(-1).pressed, false);
  assert.equal(session.stop().filter((p) => p.click).length, 1);
});

test("stop while paused closes an active drag and permanently clears held buttons", () => {
  let clock = 0;
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => ({ x: 25, y: 50 }),
    now: () => clock,
  });
  session.sample("down", 1);
  clock = 100;
  session.pause(true);
  clock = 2000;
  const points = session.stop();
  assert.equal(points.at(-1).event, "up");
  assert.equal(points.at(-1).pressed, false);
  assert.equal(points.at(-1).t, 0.1);
  assert.equal(session.pressedButtons.size, 0);
  session.sample("down", 1);
  assert.equal(session.pressedButtons.size, 0);
  assert.equal(session.stop(), points);
});

test("terminal release respects the memory limit and out-of-source visibility", () => {
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => ({ x: 200, y: 50 }),
    now: () => 0,
    maxSamples: 2,
  });
  session.sample("down", 1);
  session.sample();
  const points = session.stop();
  assert.equal(points.length, 2);
  assert.equal(points.at(-1).event, "up");
  assert.equal(points.at(-1).pressed, false);
  assert.equal(points.at(-1).visible, false);
});

test("releasing one button leaves another button held", () => {
  const session = new PointerSession({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    getPoint: () => ({ x: 50, y: 50 }),
    now: () => 0,
  });
  session.sample("down", 1);
  session.sample("down", 2);
  session.sample("up", 1);
  assert.equal(session.points.at(-1).pressed, true);
  session.sample();
  assert.equal(session.points.at(-1).button, 2);
  assert.equal(session.stop().at(-1).pressed, false);
});
