import test from "node:test";
import assert from "node:assert/strict";
import { enableEvidenceAccess } from "../src/safety/permissions.ts";
const allow = { granted: true, canAskAgain: true };
const deny = { granted: false, canAskAgain: false };
test("offline preview never requests camera/microphone or saves access", async () => {
  const forbidden = () => {
    throw new Error("Native access attempted");
  };
  const result = await enableEvidenceAccess({
    preview: true,
    camera: forbidden,
    microphone: forbidden,
    save: forbidden,
  });
  assert.match(result.label, /Simulated/);
});
test("camera denial stops before microphone and leaves evidence disabled", async () => {
  const saved = [];
  const result = await enableEvidenceAccess({
    preview: false,
    camera: async () => deny,
    microphone: () => {
      throw new Error("Should not prompt");
    },
    save: async (v) => saved.push(v),
  });
  assert.deepEqual(saved, [false]);
  assert.equal(result.needsSettings, true);
});
test("microphone denial never enables evidence", async () => {
  const saved = [];
  await enableEvidenceAccess({
    preview: false,
    camera: async () => allow,
    microphone: async () => deny,
    save: async (v) => saved.push(v),
  });
  assert.deepEqual(saved, [false]);
});
test("both grants enable optional evidence in order without starting recording", async () => {
  const calls = [];
  await enableEvidenceAccess({
    preview: false,
    camera: async () => {
      calls.push("camera");
      return allow;
    },
    microphone: async () => {
      calls.push("mic");
      return allow;
    },
    save: async (v) => calls.push(v),
  });
  assert.deepEqual(calls, [false, "camera", "mic", true]);
});
