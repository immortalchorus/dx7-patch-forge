import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dbToGain, sanitizeVolume, volumeText, MUTE_DB, MAX_DB, DEFAULT_DB } from "../dist/js/monitor.js";

test("the monitoring level is a plain dB control", () => {
  assert.equal(dbToGain(0), 1);
  assert.ok(Math.abs(dbToGain(-6) - 0.5) < 0.01, "−6 dB is about half");
  assert.ok(Math.abs(dbToGain(MAX_DB) - 2) < 0.01, "the top of the range is about double");
  assert.equal(dbToGain(MUTE_DB), 0, "the bottom of the range is silence, not a whisper");
  assert.equal(dbToGain(-100), 0);
  assert.ok(dbToGain(DEFAULT_DB) < 1, "it opens with some headroom rather than full tilt");
});

test("whatever the control is handed becomes a usable level", () => {
  assert.equal(sanitizeVolume("-12"), -12);
  assert.equal(sanitizeVolume(999), MAX_DB);
  assert.equal(sanitizeVolume(-999), MUTE_DB);
  assert.equal(sanitizeVolume("nonsense"), DEFAULT_DB);
  assert.equal(sanitizeVolume(null), DEFAULT_DB);
  assert.equal(volumeText(MUTE_DB), "muted");
  assert.equal(volumeText(-6), "-6 dB");
  assert.equal(volumeText(3), "+3 dB");
});

test("the monitoring level opens at a known place every time", () => {
  // Unlike the octave, the reverb and the loop, this one is deliberately not remembered between
  // visits: a level set quiet for headphones late one night should not still be set that way on
  // speakers the next morning, and the reverse is worse. So the app must neither read nor write a
  // stored level. Re-adding that is a one-line change, which is why it is pinned here.
  const app = readFileSync(new URL("../dist/js/app.js", import.meta.url), "utf8");
  assert.equal(DEFAULT_DB, -6, "the level OWL opens at");
  assert.match(app, /let volumeDb = DEFAULT_DB;/, "the level should start from the default, not from storage");
  assert.ok(!/setItem\(\s*"owl\.volume"/.test(app), "app.js stores a monitoring level again; it is meant to open at the default every time");
  assert.ok(!/getItem\(\s*"owl\.volume"/.test(app), "app.js reads a stored monitoring level again");
});
