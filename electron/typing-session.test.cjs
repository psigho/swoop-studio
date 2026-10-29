"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TypingSession } = require("./typing-session.cjs");
function setup(extra = {}) {
  let time = 0;
  const clock = { pausedAt: null, elapsed: () => time };
  const session = new TypingSession({
    clock,
    bounds: { x: -100, y: 0, width: 1000, height: 500 },
    windowHandle: "42",
    getFallback: () => ({ x: 0.3, y: 0.4, visible: true }),
    getFocus: async () => ({
      window: "42",
      found: true,
      password: false,
      x: 100,
      y: 100,
    }),
    isTypingKey: (e) => !e.ctrlKey && e.keycode === 30,
    ...extra,
  });
  return {
    session,
    clock,
    key: (t, event = { keycode: 30 }) => {
      time = t;
      session.key(event);
    },
  };
}
test("typing stores only burst timing and focus geometry, never key or text data", async () => {
  const { session, key } = setup();
  key(1);
  key(1.2, { keycode: 30, text: "SECRET" });
  key(1.6);
  await Promise.resolve();
  assert.deepEqual(session.stop(), [{ start: 1, end: 1.6, x: 0.2, y: 0.2 }]);
});
test("isolated shortcuts and one key do not create zooms; quiet gaps create separate holds", async () => {
  const { session, key } = setup();
  key(0.1, { keycode: 30, ctrlKey: true });
  key(1);
  key(3);
  key(3.1);
  await Promise.resolve();
  assert.deepEqual(session.stop(), [{ start: 3, end: 3.1, x: 0.2, y: 0.2 }]);
});
test("password fields, another window and focus outside the source cannot create zooms", async () => {
  for (const focus of [
    { window: "42", password: true, found: true, x: 100, y: 100 },
    { window: "7", found: true, x: 100, y: 100 },
    { window: "42", found: true, x: 2000, y: 100 },
  ]) {
    const { session, key } = setup({ getFocus: async () => focus });
    key(1);
    key(1.3);
    await Promise.resolve();
    assert.deepEqual(session.stop(), []);
  }
});
test("pause ends the current burst, suppresses activity and invalidates a pending focus query", async () => {
  let resolve;
  const { session, key, clock } = setup({
    getFocus: () => new Promise((r) => (resolve = r)),
  });
  key(1);
  key(1.1);
  session.pause();
  clock.pausedAt = 2000;
  key(2);
  resolve({ window: "42", found: true, x: 100, y: 100 });
  await Promise.resolve();
  assert.deepEqual(session.stop(), []);
});
test("a missing caret falls back to an in-source click and stopped sessions ignore late results", async () => {
  const { session, key } = setup({
    getFocus: async () => ({ window: "42", found: false }),
  });
  key(1);
  key(1.3);
  await Promise.resolve();
  assert.deepEqual(session.stop(), [{ start: 1, end: 1.3, x: 0.3, y: 0.4 }]);
  key(2);
  assert.equal(session.bursts.length, 1);
});
