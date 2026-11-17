import test from "node:test";
import assert from "node:assert/strict";
import { evidenceFormat } from "../src/safety/evidence.ts";
test("iOS QuickTime recordings retain MOV and QuickTime export metadata", () => {
  assert.deepEqual(evidenceFormat("file:///private/Camera/evidence.mov"), {
    extension: "mov",
    mimeType: "video/quicktime",
    UTI: "com.apple.quicktime-movie",
  });
});
test("Android recordings retain MP4 and MPEG4 export metadata", () => {
  assert.deepEqual(evidenceFormat("file:///data/user/Camera/evidence.mp4"), {
    extension: "mp4",
    mimeType: "video/mp4",
    UTI: "public.mpeg-4",
  });
});
test("query strings do not determine the recording container and unknown types fail explicitly", () => {
  assert.equal(
    evidenceFormat("file:///recording.MOV?label=.mp4").extension,
    "mov",
  );
  assert.throws(
    () => evidenceFormat("file:///recording.unknown"),
    /Unsupported recording format/,
  );
});
