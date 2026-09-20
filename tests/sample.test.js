import test from "node:test";
import assert from "node:assert/strict";
import { decodeWav, detectF0, trimSilence, analyseRecording, nearestNote } from "../dist/js/sample.js";
import { analyseSamples, measure } from "../dist/js/features.js";
import { renderNote } from "../dist/js/render.js";
import { LIBRARY } from "../dist/js/designer.js";

/** Build a WAV file in memory, so the decoder is tested against real bytes. */
function makeWav(samples, { sampleRate = 44100, bits = 16, channels = 1, float = false } = {}) {
  const bytesPer = bits >> 3;
  const dataLength = samples.length * bytesPer * channels;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const str = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, float ? 3 : 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPer, true);
  view.setUint16(32, channels * bytesPer, true);
  view.setUint16(34, bits, true);
  str(36, "data");
  view.setUint32(40, dataLength, true);
  let at = 44;
  for (const x of samples)
    for (let c = 0; c < channels; c++, at += bytesPer) {
      if (float) view.setFloat32(at, x, true);
      else if (bits === 8) view.setUint8(at, Math.round(x * 127) + 128);
      else if (bits === 16) view.setInt16(at, Math.round(x * 32767), true);
      else if (bits === 32) view.setInt32(at, Math.round(x * 2147483647), true);
    }
  return buffer;
}

const tone = (hz, seconds, sampleRate = 44100, harmonics = 1) =>
  Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, i) => {
    let x = 0;
    for (let k = 1; k <= harmonics; k++) x += Math.sin((2 * Math.PI * hz * k * i) / sampleRate) / k;
    return x * 0.5;
  });

test("WAV files are decoded, whatever depth and channel count they arrive in", () => {
  const source = tone(220, 0.2);
  for (const opts of [{ bits: 16 }, { bits: 8 }, { bits: 32 }, { bits: 32, float: true }, { bits: 16, channels: 2 }]) {
    const { samples, sampleRate, channels } = decodeWav(makeWav(source, opts));
    assert.equal(sampleRate, 44100, JSON.stringify(opts));
    assert.equal(channels, opts.channels || 1);
    assert.equal(samples.length, source.length);
    // 8-bit is coarse; everything else should be close to the original.
    const tolerance = opts.bits === 8 ? 0.02 : 0.001;
    for (let i = 0; i < source.length; i += 97) assert.ok(Math.abs(samples[i] - source[i]) < tolerance, `${JSON.stringify(opts)} at ${i}`);
  }
});

test("something that is not a WAV file is refused, not misread", () => {
  assert.throws(() => decodeWav(new ArrayBuffer(8)), /Not a WAV file/);
  const notPcm = makeWav(tone(220, 0.1), { bits: 16 });
  new DataView(notPcm).setUint16(20, 0x11, true); // IMA ADPCM
  assert.throws(() => decodeWav(notPcm), /Unsupported WAV encoding/);
});

test("pitch is found on plain tones, and on a rendered patch", () => {
  for (const hz of [55, 110, 261.63, 440, 1318.5]) {
    const { hz: found, clarity } = detectF0(tone(hz, 0.3, 44100, 6), 44100);
    const cents = 1200 * Math.log2(found / hz);
    assert.ok(Math.abs(cents) < 10, `${hz} Hz read as ${found.toFixed(1)} Hz (${cents.toFixed(1)} cents)`);
    assert.ok(clarity > 0.8, `${hz} Hz clarity ${clarity}`);
  }
  // The real test: a voice from the library, which is what the matcher will meet.
  const voice = LIBRARY.find((e) => e.voice.name === "TINE EP").voice;
  const { samples, sampleRate, f0 } = renderNote(voice, { note: 60, velocity: 100, hold: 1.5, tail: 0.2, sampleRate: 44100 });
  const found = detectF0(samples, sampleRate, { at: Math.round(0.1 * sampleRate) });
  assert.ok(Math.abs(1200 * Math.log2(found.hz / f0)) < 15, `tine EP at ${f0.toFixed(1)} Hz read as ${found.hz.toFixed(1)} Hz`);
});

test("noise has no pitch, and says so rather than inventing one", () => {
  let seed = 7;
  const noise = Float32Array.from({ length: 22050 }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x3fffffff - 1) * 0.5;
  });
  assert.ok(detectF0(noise, 44100).clarity < 0.6, "noise should not read as clearly pitched");
});

test("silence at either end is trimmed away before anything is measured", () => {
  const body = tone(220, 0.3);
  const padded = new Float32Array(body.length + 20000);
  padded.set(body, 10000);
  const { start, end } = trimSilence(padded);
  assert.ok(Math.abs(start - 10000) < 200, `start ${start}`);
  assert.ok(Math.abs(end - (10000 + body.length)) < 200, `end ${end}`);
});

test("a recording is measured by the same ruler as a patch", () => {
  const voice = LIBRARY.find((e) => e.voice.name === "TINE EP").voice;
  const rendered = renderNote(voice, { note: 60, velocity: 100, hold: 2, tail: 1.5, sampleRate: 22050 });
  // Pretend the rendered note arrived as a recording, and see whether it measures the same.
  const heard = analyseRecording(rendered.samples, rendered.sampleRate, { analyse: analyseSamples });
  const known = measure(voice);
  assert.ok(Math.abs(1200 * Math.log2(heard.f0 / rendered.f0)) < 20, `pitch ${heard.f0.toFixed(1)} vs ${rendered.f0.toFixed(1)}`);
  assert.ok(Math.abs(heard.features.centroid - known.centroid) < known.centroid * 0.25,
    `brightness heard ${heard.features.centroid.toFixed(2)} vs known ${known.centroid.toFixed(2)}`);
  assert.ok(Math.abs(heard.features.attack - known.attack) < 0.03, `attack ${heard.features.attack} vs ${known.attack}`);
  assert.ok(heard.features.inharm < 0.2, `a tine EP should read as harmonic, got ${heard.features.inharm}`);
  assert.equal(nearestNote(heard.f0).note, 60);
});

test("what cannot be analysed is reported, not hidden", () => {
  let seed = 11;
  const noise = Float32Array.from({ length: 22050 }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x3fffffff - 1) * 0.5;
  });
  const r = analyseRecording(noise, 22050, { analyse: analyseSamples });
  assert.ok(r.notes.some((n) => /pitch/.test(n)), r.notes.join("; "));
  assert.throws(() => analyseRecording(new Float32Array(1000), 22050, {}), /silent/);
  const short = analyseRecording(tone(440, 0.05), 44100, { analyse: analyseSamples });
  assert.ok(short.notes.some((n) => /short/.test(n)), short.notes.join("; "));
});
