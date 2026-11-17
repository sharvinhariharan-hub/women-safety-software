import test from "node:test";
import assert from "node:assert/strict";
import { previewApi } from "../src/preview.ts";
test("offline preview runs a complete practice SOS without networking", async () => {
  const original = globalThis.fetch;
  let network = 0;
  globalThis.fetch = () => {
    network++;
    throw new Error("Network forbidden");
  };
  try {
    const before = await previewApi("/api/status", "GET");
    assert.equal(before.mode, "test");
    assert.equal(before.active, null);
    const active = await previewApi("/api/incidents", "POST", {
      requestId: "practice",
    });
    assert.equal(active.jobs.length, 6);
    assert.ok(active.jobs.every((job) => job.status === "test_only"));
    assert.equal(active.location, null);
    await previewApi(`/api/incidents/${active.id}/end`, "POST");
    assert.equal((await previewApi("/api/status", "GET")).active, null);
    await assert.rejects(
      previewApi("https://api.twilio.com/anything", "POST"),
      /unavailable/,
    );
    assert.equal(network, 0);
  } finally {
    globalThis.fetch = original;
  }
});
