// Polyphonic preview engine shared by the AudioWorklet and the main-thread fallback.
// The output stage copies SpaceAge (and Dexed): each voice's carrier sum is scaled by 0.5
// and hard-clipped at full scale, so a patch that clips there clips audibly here too.
//
// The audition loop runs here rather than on the main thread: designing a voice keeps the
// main thread busy measuring, and a timer-driven sequencer would stutter exactly while the
// sliders are being moved. Steps land on render-block boundaries, within about 3 ms.

import { FmNote } from "./render.js";
import { stepSeconds, stepEvents, sanitizePattern, STEPS } from "./pattern.js";

const MAX_NOTES = 12;
const MASTER = 0.35; // headroom for chords

export class PreviewEngine {
  /** onEvent(message) reports playhead position and peak level back to the app, if given. */
  constructor(sampleRate, onEvent = null) {
    this.sampleRate = sampleRate;
    this.onEvent = onEvent;
    this.voice = null;
    this.notes = [];
    this.buf = new Float64Array(128);
    this.mix = new Float64Array(128);
    // Transport
    this.pattern = null;
    this.playing = false;
    this.step = 0;
    this.playStep = -1; // the step currently sounding, for the playhead
    this.untilStep = 0; // samples left in the current step
    this.pending = []; // scheduled note-offs: { key, at } in samples from now
    this.peak = 0;
    this.sinceReport = 0;
  }
  message(data) {
    if (data.type === "voice") {
      this.voice = data.voice;
    } else if (data.type === "on" && this.voice) {
      this.startNote(data.note, data.velocity);
    } else if (data.type === "off") {
      this.stopNote(data.note);
    } else if (data.type === "panic") {
      this.notes = [];
      this.pending = [];
    } else if (data.type === "pattern") {
      this.pattern = sanitizePattern(data.pattern);
    } else if (data.type === "transport") {
      this.setPlaying(!!data.playing);
    }
  }
  setPlaying(playing) {
    this.playing = playing;
    this.step = 0;
    this.untilStep = 0; // the first step fires on the next block
    this.playStep = -1;
    if (!playing) {
      for (const p of this.pending) this.stopNote(p.key);
      this.pending = [];
      this.report(-1);
    }
  }
  startNote(note, velocity) {
    if (!this.voice) return;
    for (const n of this.notes) if (n.key === note && n.fm.releasedAt < 0) n.fm.release();
    this.notes.push({ key: note, fm: new FmNote(this.voice, note, velocity, this.sampleRate, Math.random() * 2 ** 32) });
    while (this.notes.length > MAX_NOTES) this.notes.shift();
  }
  stopNote(note) {
    for (const n of this.notes) if (n.key === note) n.fm.release();
  }
  report(step) {
    this.onEvent?.({ type: "playhead", step, peak: this.peak });
    this.peak = 0;
  }

  /** Advance the loop by one block, starting and stopping notes as their step boundaries pass. */
  transport(frames) {
    for (const p of this.pending) p.at -= frames;
    for (const p of this.pending) if (p.at <= 0) this.stopNote(p.key);
    this.pending = this.pending.filter((p) => p.at > 0);
    if (!this.playing || !this.pattern || !this.voice) return;
    this.untilStep -= frames;
    while (this.untilStep <= 0) {
      const stepLen = Math.max(1, Math.round(stepSeconds(this.pattern) * this.sampleRate));
      const ev = stepEvents(this.pattern, this.step);
      if (ev) {
        const hold = Math.max(1, Math.round(stepLen * (ev.steps - 1 + this.pattern.gate)));
        for (const note of ev.notes) {
          this.startNote(note, ev.velocity);
          this.pending.push({ key: note, at: hold });
        }
      }
      this.playStep = this.step;
      this.report(this.playStep);
      this.step = (this.step + 1) % STEPS;
      this.untilStep += stepLen;
    }
  }

  /** Fill each channel array with the next block of output. */
  render(channels) {
    const frames = channels[0].length;
    if (this.mix.length !== frames) (this.mix = new Float64Array(frames)), (this.buf = new Float64Array(frames));
    this.transport(frames);
    this.mix.fill(0);
    for (const n of this.notes) {
      this.buf.fill(0);
      n.fm.renderInto(this.buf, 0, frames, 0.5);
      for (let i = 0; i < frames; i++) this.mix[i] += Math.max(-1, Math.min(1, this.buf[i]));
    }
    this.notes = this.notes.filter((n) => !n.fm.finished && n.fm.t < this.sampleRate * 60);
    for (const ch of channels) for (let i = 0; i < frames; i++) ch[i] = Math.max(-1, Math.min(1, this.mix[i] * MASTER));
    // Peak of the mix before the master trim: 1.0 is where SpaceAge and Dexed would clip.
    for (let i = 0; i < frames; i++) this.peak = Math.max(this.peak, Math.abs(this.mix[i]));
    this.sinceReport += frames;
    if (this.sinceReport >= this.sampleRate / 15) {
      this.sinceReport = 0;
      this.report(this.playing ? this.playStep : -1);
    }
  }
}
