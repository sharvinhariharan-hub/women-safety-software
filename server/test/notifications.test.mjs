import test from "node:test";
import assert from "node:assert/strict";
import { notification, reverseGeocode } from "../src/notifications.mjs";
const incident = {
  name: "Demo",
  shareToken: "a".repeat(64),
  expiresAt: Date.now() + 86400000,
  location: {
    latitude: 12.97,
    longitude: 77.59,
    accuracy: 15,
    timestamp: Date.now(),
  },
};

test("both text formats include the same coordinate snapshot, map URL, time, and private URL", () => {
  const result = notification(
    incident,
    "https://example.test",
    "location",
    "Test Road\nTest Area",
  );
  assert.equal(result.variables["4"], "Test Road Test Area");
  assert.equal(result.variables["3"], "12.970000, 77.590000");
  assert.ok(result.message.includes(result.variables["6"]));
  assert.ok(result.message.includes(result.variables["7"]));
  assert.ok(result.variables["5"].includes("accuracy approximately 15m"));
  assert.equal(Object.keys(result.variables).length, 8);
});

test("unknown GPS and place names stay explicitly unknown, not invented", async () => {
  const result = notification(
    { ...incident, location: null },
    "https://example.test",
  );
  assert.equal(result.containsLocation, false);
  assert.equal(result.variables["3"], "Not available yet");
  assert.equal(result.variables["4"], "Place name unavailable");
  assert.equal(await reverseGeocode(incident.location, undefined), null);
});

test("optional geocoder uses actual coordinates and safely falls back if unavailable", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url) => {
    assert.equal(url.searchParams.get("lat"), "12.97");
    assert.equal(url.searchParams.get("lon"), "77.59");
    return new Response(
      JSON.stringify({ display_name: "Example Road, Test City" }),
    );
  };
  assert.equal(
    await reverseGeocode(
      incident.location,
      "https://geocoder.example.test/reverse",
    ),
    "Example Road, Test City",
  );
  globalThis.fetch = async () => {
    throw new Error("Offline");
  };
  assert.equal(
    await reverseGeocode(
      incident.location,
      "https://geocoder.example.test/reverse",
    ),
    null,
  );
});

test("invalid optional geocoder configuration cannot block emergency messages", async () => {
  assert.equal(await reverseGeocode(incident.location, "not a URL"), null);
  assert.equal(
    await reverseGeocode(incident.location, "file:///private/example"),
    null,
  );
});
