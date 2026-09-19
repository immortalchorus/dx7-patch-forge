import test from "node:test";
import assert from "node:assert/strict";
import { dbToGain, sanitizeVolume, volumeText, MUTE_DB, MAX_DB, DEFAULT_DB } from "../dist/js/monitor.js";

test("the monitoring level is a plain dB control", () => {
  assert.equal(dbToGain(0), 1);
  assert.ok(Math.abs(dbToGain(-6) - 0.5) < 0.01, "−6 dB is about half");
  assert.ok(Math.abs(dbToGain(MAX_DB) - 2) < 0.01, "the top of the range is about double");
  assert.equal(dbToGain(MUTE_DB), 0, "the bottom of the range is silence, not a whisper");
  assert.equal(dbToGain(-100), 0);
  assert.ok(dbToGain(DEFAULT_DB) < 1, "it opens with some headroom rather than full tilt");
});

test("whatever comes out of storage becomes a usable level", () => {
  assert.equal(sanitizeVolume("-12"), -12);
  assert.equal(sanitizeVolume(999), MAX_DB);
  assert.equal(sanitizeVolume(-999), MUTE_DB);
  assert.equal(sanitizeVolume("nonsense"), DEFAULT_DB);
  assert.equal(sanitizeVolume(null), DEFAULT_DB);
  assert.equal(volumeText(MUTE_DB), "muted");
  assert.equal(volumeText(-6), "-6 dB");
  assert.equal(volumeText(3), "+3 dB");
});
