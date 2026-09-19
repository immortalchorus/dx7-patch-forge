// Real-time polyphonic preview of the current voice using the same renderer as the designer.
import { FmNote } from "./render.js";
import { ALGORITHMS } from "./dx7.js";

const MAX_NOTES = 12;

class FmPreview extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voice = null;
    this.gain = 0.2;
    this.notes = [];
    this.mix = new Float64Array(128);
    this.port.onmessage = ({ data }) => {
      if (data.type === "voice") {
        this.voice = data.voice;
        this.gain = 0.22 / Math.sqrt(ALGORITHMS[data.voice.algorithm].carriers.length);
      } else if (data.type === "on" && this.voice) {
        for (const n of this.notes) if (n.key === data.note && n.fm.releasedAt < 0) n.fm.release();
        this.notes.push({ key: data.note, fm: new FmNote(this.voice, data.note, data.velocity, sampleRate, Math.random() * 2 ** 32) });
        while (this.notes.length > MAX_NOTES) this.notes.shift();
      } else if (data.type === "off") {
        for (const n of this.notes) if (n.key === data.note) n.fm.release();
      } else if (data.type === "panic") {
        this.notes = [];
      }
    };
  }
  process(_, outputs) {
    const out = outputs[0];
    const frames = out[0].length;
    if (this.mix.length !== frames) this.mix = new Float64Array(frames);
    this.mix.fill(0);
    for (const n of this.notes) n.fm.renderInto(this.mix, 0, frames, this.gain);
    this.notes = this.notes.filter((n) => !n.fm.finished && n.fm.t < sampleRate * 60);
    for (const ch of out) for (let i = 0; i < frames; i++) ch[i] = Math.tanh(this.mix[i]);
    return true;
  }
}

registerProcessor("fm-preview", FmPreview);
