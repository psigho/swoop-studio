import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProject } from "../src/project";
import { DEFAULT_SETTINGS } from "../src/studio";

const fixture = () => ({
  schemaVersion: 1,
  name: "A good take",
  isDemo: true,
  duration: 10,
  settings: { ...DEFAULT_SETTINGS },
  zooms: [{ id: "zoom1", start: 1, end: 4, x: 0.5, y: 0.5, scale: 1.7 }],
  pointers: [
    { t: 0, x: 0.5, y: 0.5 },
    { t: 2, x: 0.8, y: 0.6, click: true, visible: false },
  ],
  trimStart: 0,
  trimEnd: 10,
});

test("complete project round-trips with cursor visibility preserved", () => {
  assert.deepEqual(parseProject(fixture()), fixture());
});

test("older partial settings receive defaults without mutating input", () => {
  const input = { ...fixture(), settings: { background: "candy" } };
  const parsed = parseProject(input);
  assert.deepEqual(parsed.settings, {
    ...DEFAULT_SETTINGS,
    background: "candy",
  });
  assert.deepEqual(input.settings, { background: "candy" });
});

test("rejects malformed and unsupported project headers", () => {
  for (const input of [
    null,
    [],
    "text",
    { ...fixture(), schemaVersion: 2 },
    { ...fixture(), isDemo: "yes" },
  ]) {
    assert.throws(() => parseProject(input));
  }
  for (const name of ["", "   ", "x".repeat(81), "bad\nname"])
    assert.throws(() => parseProject({ ...fixture(), name }), /Project name/);
  for (const duration of [0, -1, Infinity, NaN, 86401, "10"])
    assert.throws(() => parseProject({ ...fixture(), duration }), /duration/);
});

test("rejects invalid numeric settings before controls and canvas see them", () => {
  for (const padding of ["bad", null, NaN, Infinity, -1, 101]) {
    assert.throws(
      () => parseProject({ ...fixture(), settings: { padding } }),
      /padding/,
    );
  }
  assert.throws(
    () => parseProject({ ...fixture(), settings: { cursorSize: 0 } }),
    /cursorSize/,
  );
  assert.throws(
    () => parseProject({ ...fixture(), settings: { roundness: -10 } }),
    /roundness/,
  );
});

test("rejects unknown styles, invalid booleans, and invalid color values", () => {
  for (const settings of [
    { aspect: "4:0" },
    { cursorStyle: "mystery" },
    { background: "unknown" },
    { intro: false },
    { motion: "jitter" },
    { cameraFrame: "windows" },
    { grain: "false" },
    { cursorTrail: 1 },
    { showCursor: "no" },
    { cursorColor: "red" },
    { cursorColor: "#fff" },
  ]) {
    assert.throws(() => parseProject({ ...fixture(), settings }));
  }
});

test("orders cursor samples and zooms by time, while validating coordinates and ids", () => {
  const input = fixture();
  input.pointers.reverse();
  input.zooms.push({
    id: "earlier",
    start: 0,
    end: 0.5,
    x: 0,
    y: 1,
    scale: 1.2,
  });
  const parsed = parseProject(input);
  assert.equal(parsed.pointers[0].t, 0);
  assert.equal(parsed.zooms[0].id, "earlier");
  assert.throws(
    () => parseProject({ ...fixture(), pointers: [{ t: 0, x: 2, y: 0 }] }),
    /position/,
  );
  assert.throws(
    () => parseProject({ ...fixture(), pointers: [{ t: 11, x: 0, y: 0 }] }),
    /time/,
  );
  assert.throws(
    () =>
      parseProject({
        ...fixture(),
        pointers: [{ t: 1, x: 0, y: 0, visible: "no" }],
      }),
    /visibility/,
  );
  assert.throws(
    () =>
      parseProject({
        ...fixture(),
        zooms: [fixture().zooms[0], fixture().zooms[0]],
      }),
    /unique/,
  );
  assert.throws(
    () =>
      parseProject({
        ...fixture(),
        zooms: [{ ...fixture().zooms[0], end: 1 }],
      }),
    /end after/,
  );
});

test("bounds trim ranges and fills absent trim with the complete clip", () => {
  const { trimStart: _start, trimEnd: _end, ...legacy } = fixture();
  assert.equal(parseProject(legacy).trimEnd, 10);
  for (const [trimStart, trimEnd] of [
    [2, 2],
    [-1, 5],
    [0, 11],
    [8, 7],
  ]) {
    assert.throws(() => parseProject({ ...fixture(), trimStart, trimEnd }));
  }
});

test("rejects oversized sample or zoom collections before mapping them", () => {
  assert.throws(
    () => parseProject({ ...fixture(), pointers: new Array(2_000_001) }),
    /2,000,000/,
  );
  assert.throws(
    () => parseProject({ ...fixture(), zooms: new Array(10_001) }),
    /10,000/,
  );
});

test("embedded WebM, MP4, and codec-bearing MIME types are supported", () => {
  for (const mediaType of [
    "video/webm",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
  ]) {
    const parsed = parseProject({
      ...fixture(),
      isDemo: false,
      mediaBase64: "aGVsbG8=",
      mediaType,
    });
    assert.equal(parsed.mediaBase64, "aGVsbG8=");
    assert.equal(parsed.mediaType, mediaType);
  }
  assert.equal(
    parseProject({
      ...fixture(),
      isDemo: false,
      mediaBase64: "aGVsbG8=",
      mediaType: "",
    }).mediaType,
    "video/webm",
  );
});

test("rejects missing recording, invalid base64 padding, and non-video MIME types", () => {
  for (const mediaBase64 of [
    undefined,
    "",
    "abc",
    "a===",
    "aGV=sbG8",
    "data:video/webm;base64,aGVsbG8=",
    "aGVsbG8?",
  ]) {
    assert.throws(
      () =>
        parseProject({
          ...fixture(),
          isDemo: false,
          mediaBase64,
          mediaType: "video/webm",
        }),
      /recording/,
    );
  }
  for (const mediaType of [
    "text/html",
    "video/unknown",
    "video/webm; codecs=vp9;evil=1",
  ]) {
    assert.throws(
      () =>
        parseProject({
          ...fixture(),
          isDemo: false,
          mediaBase64: "aGVsbG8=",
          mediaType,
        }),
      /video format/,
    );
  }
});

test("cursor effect settings and drag gestures survive project round-trip", () => {
  const input = fixture();
  Object.assign(input.settings, {
    cursorStyle: "presenter",
    trailStyle: "comet",
    trailDuration: 0.65,
    trailOpacity: 85,
    clickStyle: "burst",
    clickColor: "#ffaa66",
    clickSize: 96,
    dragEffect: true,
    dragStyle: "selection",
    dragColor: "#99ccff",
  });
  input.pointers = [
    {
      t: 1,
      x: 0.2,
      y: 0.3,
      event: "down",
      pressed: true,
      button: 1,
      click: true,
    },
    { t: 2, x: 0.7, y: 0.6, event: "up", pressed: false, button: 1 },
  ] as any;
  const output = parseProject(input);
  assert.deepEqual(output.settings, input.settings);
  assert.deepEqual(output.pointers, input.pointers);
});

test("new cursor controls reject invalid values before drawing", () => {
  for (const settings of [
    { trailStyle: "unknown" },
    { trailDuration: 0 },
    { trailOpacity: 101 },
    { clickStyle: "unknown" },
    { clickColor: "red" },
    { clickSize: 200 },
    { dragStyle: "unknown" },
    { dragColor: "#fff" },
    { dragEffect: "yes" },
  ])
    assert.throws(() => parseProject({ ...fixture(), settings }));
  for (const point of [
    { t: 1, x: 0.5, y: 0.5, event: "keydown" },
    { t: 1, x: 0.5, y: 0.5, pressed: "yes" },
  ])
    assert.throws(() => parseProject({ ...fixture(), pointers: [point] }));
});
