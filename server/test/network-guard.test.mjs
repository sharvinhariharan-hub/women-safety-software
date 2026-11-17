import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("an unexpected external request is blocked before fetch and fails the test process", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "./server/test/network-guard.mjs",
      "--input-type=module",
      "-e",
      "try { await fetch('https://example.invalid/never-contact'); } catch {}",
    ],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 1);
});
