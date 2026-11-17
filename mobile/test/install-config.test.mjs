import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const configure = require("../app.config.js");
const config = JSON.parse(
  readFileSync(new URL("../app.json", import.meta.url)),
).expo;
test("phone launch icons are real 1024px PNGs and the native app has an identity", () => {
  assert.ok(config.android.package);
  assert.ok(config.ios.bundleIdentifier);
  for (const file of [
    "icon.png",
    "android-icon-foreground.png",
    "android-icon-monochrome.png",
  ]) {
    const png = readFileSync(new URL(`../assets/${file}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
  }
});
test("Android preview has a separate icon identity and denies Internet, location, messaging, and calls", () => {
  const previous = process.env.EXPO_PUBLIC_PREVIEW_MODE;
  try {
    process.env.EXPO_PUBLIC_PREVIEW_MODE = "true";
    const preview = configure({ config });
    assert.notEqual(preview.android.package, config.android.package);
    assert.equal(preview.name, "SOS Preview");
    for (const permission of [
      "INTERNET",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "SEND_SMS",
      "CALL_PHONE",
      "RECORD_AUDIO",
    ])
      assert.ok(
        preview.android.blockedPermissions.includes(
          `android.permission.${permission}`,
        ),
      );
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_PREVIEW_MODE;
    else process.env.EXPO_PUBLIC_PREVIEW_MODE = previous;
  }
});
test("ordinary builds retain the configured identity rather than the preview identity", () => {
  const previous = process.env.EXPO_PUBLIC_PREVIEW_MODE;
  try {
    delete process.env.EXPO_PUBLIC_PREVIEW_MODE;
    assert.equal(configure({ config }).name, config.name);
  } finally {
    if (previous !== undefined) process.env.EXPO_PUBLIC_PREVIEW_MODE = previous;
  }
});
