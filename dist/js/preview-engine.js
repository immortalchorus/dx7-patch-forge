// Polyphonic preview engine shared by the AudioWorklet and the main-thread fallback.
// The output stage copies SpaceAge (and Dexed): each voice's carrier sum is scaled by 0.5
// and hard-clipped at full scale, so a patch that clips there clips audibly here too.
import { FmNote } from "./render.js";

const MAX_NOTES = 12;
const MASTER = 0.35; // headroom for chords

export class PreviewEngine {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.voice = null;
    this.notes = [];
    this.buf = new Float64Array(128);
    this.mix = new Float64Array(128);
  }
  message(data) {
    if (data.type === "voice") {
      this.voice = data.voice;
    } else if (data.type === "on" && this.voice) {
      for (const n of this.notes) if (n.key === data.note && n.fm.releasedAt < 0) n.fm.release();
      this.notes.push({ key: data.note, fm: new FmNote(this.voice, data.note, data.velocity, this.sampleRate, Math.random() * 2 ** 32) });
      while (this.notes.length > MAX_NOTES) this.notes.shift();
    } else if (data.type === "off") {
      for (const n of this.notes) if (n.key === data.note) n.fm.release();
    } else if (data.type === "panic") {
      this.notes = [];
    }
  }
  /** Fill each channel array with the next block of output. */
  render(channels) {
    const frames = channels[0].length;
    if (this.mix.length !== frames) (this.mix = new Float64Array(frames)), (this.buf = new Float64Array(frames));
    this.mix.fill(0);
    for (const n of this.notes) {
      this.buf.fill(0);
      n.fm.renderInto(this.buf, 0, frames, 0.5);
      for (let i = 0; i < frames; i++) this.mix[i] += Math.max(-1, Math.min(1, this.buf[i]));
    }
    this.notes = this.notes.filter((n) => !n.fm.finished && n.fm.t < this.sampleRate * 60);
    for (const ch of channels) for (let i = 0; i < frames; i++) ch[i] = Math.max(-1, Math.min(1, this.mix[i] * MASTER));
  }
}
