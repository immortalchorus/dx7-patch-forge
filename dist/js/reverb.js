// Monitoring reverb: a synthesized impulse response for the browser's ConvolverNode.
//
// It exists because an FM decay judged dry tells you very little — a bell's tail is half of
// what makes it good. It is strictly listening equipment: nothing here reaches a patch file,
// a MIDI dump or the measurements, and the clip meter stays on the dry signal, because
// SpaceAge and Dexed clip before any reverb of their own.
//
// The impulse is decaying noise, low-passed more and more as it decays, so the tail darkens
// the way a real room does. Left and right are generated separately, which turns the engine's
// mono output into something with width.

/** damping: 1 keeps the tail bright, 0 makes it dark quickly. */
export const REVERB_PRESETS = [
  { id: "room", label: "Small room", seconds: 0.9, damping: 0.45, predelay: 0.008 },
  { id: "plate", label: "Plate", seconds: 1.9, damping: 0.8, predelay: 0.004 },
  { id: "hall", label: "Hall", seconds: 3.4, damping: 0.3, predelay: 0.026 },
];
export const presetById = (id) => REVERB_PRESETS.find((p) => p.id === id) || REVERB_PRESETS[0];

export const MIN_SECONDS = 0.25;
export const MAX_SECONDS = 5;

export function defaultReverb() {
  return { on: true, preset: "room", mix: 0.18, seconds: REVERB_PRESETS[0].seconds };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function sanitizeReverb(r) {
  const base = defaultReverb();
  const preset = presetById(r?.preset).id;
  return {
    on: r?.on ?? base.on,
    preset,
    mix: clamp(Number(r?.mix ?? base.mix) || 0, 0, 1),
    seconds: clamp(Number(r?.seconds ?? presetById(preset).seconds) || base.seconds, MIN_SECONDS, MAX_SECONDS),
  };
}

// A small deterministic noise source, so the same settings always give the same space.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * Two channels of impulse response, as plain Float32Arrays.
 * The level falls by 60 dB over `seconds`, and the low-pass closes as it goes, by `damping`.
 */
export function impulseResponse(sampleRate, { seconds = 1.2, damping = 0.5, seed = 20260919 } = {}) {
  const length = Math.max(1, Math.round(clamp(seconds, MIN_SECONDS, MAX_SECONDS) * sampleRate));
  const bright = clamp(damping, 0, 1);
  const openAt = 0.85, closeAt = 0.04 + 0.5 * bright; // one-pole coefficient, start and end
  const buildUp = Math.max(1, Math.round(0.004 * sampleRate)); // a few ms, so the front is not a click
  return [0, 1].map((ch) => {
    const noise = rng(seed + ch * 7919);
    const out = new Float32Array(length);
    let lp = 0;
    let energy = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const alpha = openAt + (closeAt - openAt) * t;
      lp += alpha * (noise() - lp);
      const decay = Math.exp((-6.9078 * i) / (seconds * sampleRate));
      const front = i < buildUp ? i / buildUp : 1;
      out[i] = lp * decay * front;
      energy += out[i] * out[i];
    }
    // Normalise so the mix control means the same thing whatever the size.
    const gain = energy > 0 ? 0.5 / Math.sqrt(energy / sampleRate) : 1;
    for (let i = 0; i < length; i++) out[i] *= gain;
    return out;
  });
}
