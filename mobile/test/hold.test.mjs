import test from "node:test";
import assert from "node:assert/strict";
import { createHold, createRetryAuthorization } from "../src/safety/hold.ts";
function clock() {
  let now = 0,
    serial = 0;
  const tasks = new Map();
  return {
    set(callback, ms) {
      const id = ++serial;
      tasks.set(id, { callback, at: now + ms });
      return id;
    },
    clear(id) {
      tasks.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, task] of tasks)
        if (task.at <= now) {
          tasks.delete(id);
          task.callback();
        }
    },
  };
}
test("opening the app and waiting cannot activate SOS", () => {
  const timer = clock();
  let calls = 0;
  createHold(() => calls++, timer);
  timer.advance(10000);
  assert.equal(calls, 0);
});
test("short taps and repeated taps never activate SOS", () => {
  const timer = clock();
  let calls = 0;
  const hold = createHold(() => calls++, timer);
  for (let i = 0; i < 10; i++) {
    hold.start();
    timer.advance(100);
    hold.cancel();
  }
  timer.advance(10000);
  assert.equal(calls, 0);
});
test("one continuous two-second hold activates exactly once", () => {
  const timer = clock();
  let calls = 0;
  const hold = createHold(() => calls++, timer);
  hold.start();
  timer.advance(1999);
  assert.equal(calls, 0);
  timer.advance(1);
  assert.equal(calls, 1);
  hold.start();
  timer.advance(10000);
  assert.equal(calls, 1);
});
test("release, navigation, disabling, or background cancellation disarms the hold", () => {
  const timer = clock();
  let calls = 0;
  const hold = createHold(() => calls++, timer);
  hold.start();
  timer.advance(1500);
  hold.cancel();
  timer.advance(5000);
  assert.equal(calls, 0);
  hold.start();
  timer.advance(2000);
  assert.equal(calls, 1);
});
test("late timer callbacks cannot fire after cancellation", () => {
  let callback;
  let calls = 0;
  const hold = createHold(() => calls++, {
    set(fn) {
      callback = fn;
      return 1;
    },
    clear() {},
  });
  hold.start();
  hold.cancel();
  callback();
  assert.equal(calls, 0);
});
test("saved requests need fresh authorization after launch or backgrounding", () => {
  const first = createRetryAuthorization();
  assert.equal(first.permitted(), false);
  first.allow();
  assert.equal(first.permitted(), true);
  first.deny();
  assert.equal(first.permitted(), false);
  const relaunched = createRetryAuthorization();
  assert.equal(relaunched.permitted(), false);
});

test("an accepted SOS remains visible after an earlier status connection failure", async () => {
  const { withAcceptedIncident } = await import("../src/safety/state.ts");
  const incident = {
    id: "test",
    mode: "live",
    status: "active",
    expiresAt: Date.now() + 10000,
    location: null,
    jobs: [],
  };
  const state = withAcceptedIncident(null, incident);
  assert.equal(state.active.id, "test");
  assert.equal(state.mode, "live");
  assert.equal(state.smsConfigured, false); // Unknown provider readiness is never invented.
});
