import test from "node:test";
import assert from "node:assert/strict";
import { PreviewEngine } from "../dist/js/preview-engine.js";
import { LIBRARY } from "../dist/js/designer.js";

function play(engine, blocks) {
  const l = new Float32Array(128), r = new Float32Array(128);
  let peak = 0;
  for (let b = 0; b < blocks; b++) {
    engine.render([l, r]);
    for (const x of l) peak = Math.max(peak, Math.abs(x));
  }
  return peak;
}

test("the preview engine sounds a note, stays within full scale, and releases", () => {
  const engine = new PreviewEngine(48000);
  engine.message({ type: "voice", voice: LIBRARY.find((e) => e.voice.name === "TINE EP").voice });
  engine.message({ type: "on", note: 60, velocity: 100 });
  const peak = play(engine, 100);
  assert.ok(peak > 0.05 && peak <= 1, `peak ${peak}`);
  engine.message({ type: "off", note: 60 });
  play(engine, 2000);
  assert.equal(engine.notes.length, 0);
});
