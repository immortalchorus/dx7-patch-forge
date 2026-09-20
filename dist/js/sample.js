// Reading a recording: decode it, find its pitch, and measure it with the same ruler the
// synthesis side uses (features.js).
//
// The decoder is written out by hand rather than handed to the browser's decodeAudioData,
// because this has to run in a worker and in the tests, and because a .wav with a known
// sample rate should not be silently resampled underneath the analysis.

const MIN_HZ = 27.5; // A0
const MAX_HZ = 4186; // C8

const ascii = (view, at) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

/**
 * Decode a RIFF/WAVE file: 8, 16, 24 or 32-bit PCM, or 32/64-bit float, any channel count.
 * Channels are summed to mono, because FM matching has nothing to say about a stereo image.
 * Returns { samples, sampleRate, channels, seconds }.
 */
export function decodeWav(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const view = new DataView(bytes);
  if (view.byteLength < 44 || ascii(view, 0) !== "RIFF" || ascii(view, 8) !== "WAVE") throw new Error("Not a WAV file");
  let fmt = null, dataAt = 0, dataLength = 0;
  for (let at = 12; at + 8 <= view.byteLength; ) {
    const id = ascii(view, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
      // WAVE_FORMAT_EXTENSIBLE keeps the real format in a sub-chunk at the end.
      if (fmt.format === 0xfffe && size >= 40) fmt.format = view.getUint16(body + 24, true);
    } else if (id === "data") {
      dataAt = body;
      dataLength = Math.min(size, view.byteLength - body);
    }
    at = body + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt || !dataAt) throw new Error("WAV file has no format or data chunk");
  const { channels, sampleRate, bits, format } = fmt;
  if (format !== 1 && format !== 3) throw new Error(`Unsupported WAV encoding (format ${format}); save as PCM or float`);
  const bytesPer = bits >> 3;
  const frames = Math.floor(dataLength / (bytesPer * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = dataAt + (i * channels + c) * bytesPer;
      if (format === 3) sum += bits === 64 ? view.getFloat64(at, true) : view.getFloat32(at, true);
      else if (bits === 8) sum += (view.getUint8(at) - 128) / 128; // 8-bit PCM is unsigned
      else if (bits === 16) sum += view.getInt16(at, true) / 32768;
      else if (bits === 24) sum += ((view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)) << 0) / 8388608;
      else if (bits === 32) sum += view.getInt32(at, true) / 2147483648;
      else throw new Error(`Unsupported WAV bit depth: ${bits}`);
    }
    samples[i] = sum / channels;
  }
  return { samples, sampleRate, channels, seconds: frames / sampleRate };
}

/**
 * Fundamental frequency, by the normalised square difference of McLeod and Wyvill: the same
 * family as autocorrelation, but normalised so a quiet tail does not read as a louder low
 * octave. Returns { hz, clarity } with clarity 0..1; below about 0.6, treat it as unpitched.
 */
export function detectF0(samples, sampleRate, { at = 0, window = 4096 } = {}) {
  const n = Math.min(window, samples.length - at);
  if (n < 512) return { hz: 0, clarity: 0 };
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / MIN_HZ));
  if (maxLag <= minLag) return { hz: 0, clarity: 0 };
  const nsdf = new Float64Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0, energy = 0;
    for (let i = 0; i + lag < n; i++) {
      const a = samples[at + i], b = samples[at + i + lag];
      correlation += a * b;
      energy += a * a + b * b;
    }
    nsdf[lag] = energy > 0 ? (2 * correlation) / energy : 0;
  }
  // The first peak above most of the maximum, not the highest peak: that picks the
  // fundamental rather than an octave above it.
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (nsdf[lag] > best) best = nsdf[lag];
  if (best <= 0) return { hz: 0, clarity: 0 };
  const threshold = best * 0.9;
  let chosen = 0;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] >= threshold) {
      chosen = lag;
      break;
    }
  }
  if (!chosen) return { hz: 0, clarity: 0 };
  // Parabolic interpolation between the samples either side of the peak.
  const y0 = nsdf[chosen - 1], y1 = nsdf[chosen], y2 = nsdf[chosen + 1];
  const shift = (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2 || 1);
  return { hz: sampleRate / (chosen + shift), clarity: Math.max(0, Math.min(1, y1)) };
}

/** Where the sound starts and stops, ignoring silence at either end (-60 dB of the peak). */
export function trimSilence(samples, { floorDb = -60 } = {}) {
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  if (!peak) return { start: 0, end: samples.length, peak: 0 };
  const floor = peak * Math.pow(10, floorDb / 20);
  let start = 0, end = samples.length;
  while (start < samples.length && Math.abs(samples[start]) < floor) start++;
  while (end > start && Math.abs(samples[end - 1]) < floor) end--;
  return { start, end, peak };
}

/**
 * A recording, ready to be matched: trimmed, normalised, pitched, and measured.
 * `notes` lists anything the analysis could not do, in plain words, so the app can say what
 * it is unsure about rather than quietly matching nonsense.
 */
export function analyseRecording(samples, sampleRate, { analyse } = {}) {
  const { start, end, peak } = trimSilence(samples);
  const notes = [];
  if (!peak) throw new Error("This file is silent");
  const trimmed = samples.slice(start, end);
  // Normalise, so loudness never influences the match.
  const audio = new Float32Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) audio[i] = trimmed[i] / peak;
  const seconds = audio.length / sampleRate;
  if (seconds < 0.15) notes.push("very short: there may not be enough of a note to measure");
  if (seconds > 12) notes.push("long: only the first few seconds shape the match");

  // Pitch from just after the onset, where a note is most stable.
  const at = Math.min(audio.length - 1024, Math.round(0.08 * sampleRate));
  const pitched = detectF0(audio, sampleRate, { at: Math.max(0, at) });
  const f0 = pitched.hz;
  if (!f0) notes.push("no pitch found: FM matching needs one clear note");
  else if (pitched.clarity < 0.6) notes.push("the pitch is unclear, so the match will be rough");

  const features = f0 && analyse ? analyse({ samples: audio, sampleRate, f0, fRef: f0, releaseAt: audio.length }) : null;
  return { samples: audio, sampleRate, seconds, f0, clarity: pitched.clarity, peak, features, notes };
}

/** The MIDI note a frequency is closest to, and how far off it is in cents. */
export function nearestNote(hz) {
  if (!hz) return { note: 60, cents: 0 };
  const exact = 69 + 12 * Math.log2(hz / 440);
  const note = Math.round(exact);
  return { note, cents: Math.round((exact - note) * 100) };
}
