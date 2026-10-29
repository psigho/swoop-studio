import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoZoom,
  cameraAt,
  samplePointer,
  DEFAULT_SETTINGS,
} from "../src/studio";
import { parseProject, embeddedBase64 } from "../src/project";
test("fast cursor head stays on its recorded time at every smoothing level", () => {
  const points = [
    { t: 0, x: 0.1, y: 0.1 },
    { t: 0.01, x: 0.9, y: 0.8 },
    { t: 0.02, x: 0.2, y: 0.3 },
  ];
  for (const smoothing of [0, 65, 100])
    for (const t of [0.0025, 0.005, 0.0075, 0.015])
      assert.deepEqual(
        samplePointer(points, t, smoothing),
        samplePointer(points, t, 0),
      );
});
test("typing makes one sustained zoom, merges a nearby field click and remains editable", () => {
  const zooms = autoZoom([{ t: 1, x: 0.3, y: 0.4, click: true }], 10, [
    { start: 1.3, end: 5, x: 0.31, y: 0.41 },
  ]);
  assert.equal(zooms.length, 1);
  assert.equal(zooms[0].end, 6.5);
  assert.equal(zooms[0].scale, 1.85);
  assert.equal(cameraAt(zooms, 4).scale, 1.85);
  assert.equal(cameraAt(zooms, 7).scale, 1);
});
test("typing and distant clicks never create overlapping camera holds", () => {
  const zooms = autoZoom([{ t: 2, x: 0.9, y: 0.8, click: true }], 8, [
    { start: 1, end: 4, x: 0.1, y: 0.2 },
  ]);
  for (let i = 1; i < zooms.length; i++)
    assert.ok(zooms[i].start >= zooms[i - 1].end);
});
test("typing timing round-trips in old project format, strips extra data and rejects invalid ranges", () => {
  const project = {
    schemaVersion: 1,
    name: "Typing",
    isDemo: true,
    duration: 8,
    settings: DEFAULT_SETTINGS,
    pointers: [],
    zooms: [],
    typing: [{ start: 1, end: 3, x: 0.2, y: 0.3, keycode: 30, text: "SECRET" }],
  };
  assert.deepEqual(parseProject(project).typing, [
    { start: 1, end: 3, x: 0.2, y: 0.3 },
  ]);
  assert.throws(() =>
    parseProject({
      ...project,
      typing: [{ start: 4, end: 3, x: 0.2, y: 0.3 }],
    }),
  );
  assert.equal(
    parseProject({ ...project, typing: undefined }).typing,
    undefined,
  );
});

test("audio recording codec commas cannot corrupt embedded video bytes", () => {
  const original = Buffer.from("owned WebM bytes");
  for (const mime of [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]) {
    assert.deepEqual(
      Buffer.from(
        embeddedBase64(`data:${mime};base64,${original.toString("base64")}`),
        "base64",
      ),
      original,
    );
  }
});
