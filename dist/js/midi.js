// Web MIDI output: send the current voice to a DX7, TX802, Dexed or any compatible synth.
//
// Only the single-voice dump is sent. It lands in the synth's edit buffer, so nothing stored
// is overwritten. A 32-voice cartridge dump would replace the synth's internal memory, so the
// cartridge stays a download.

import { singleVoiceSysex } from "./dx7.js";

const STORE = "owl.midi";

function remembered() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}
function remember(prefs) {
  try {
    localStorage.setItem(STORE, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); preferences just won't persist.
  }
}

export class MidiLink {
  constructor(onChange) {
    this.onChange = onChange;
    this.access = null;
    const prefs = remembered();
    this.outputId = prefs.outputId || null;
    this.channel = prefs.channel ?? 0;
    this.auto = !!prefs.auto;
  }

  get supported() {
    return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess;
  }

  /** Ask for MIDI access with SysEx. Call from a user gesture: browsers show a permission prompt. */
  async connect() {
    this.access = await navigator.requestMIDIAccess({ sysex: true });
    this.access.onstatechange = () => this.onChange();
    this.onChange();
  }

  outputs() {
    return this.access ? [...this.access.outputs.values()].filter((o) => o.state !== "disconnected") : [];
  }

  /** The chosen output, or the first one available. */
  output() {
    const outs = this.outputs();
    return outs.find((o) => o.id === this.outputId) || outs[0] || null;
  }

  set(prefs) {
    Object.assign(this, prefs);
    remember({ outputId: this.outputId, channel: this.channel, auto: this.auto });
  }

  /** Send a voice as a 163-byte single-voice dump. Returns the output's name. */
  send(voice) {
    const out = this.output();
    if (!out) throw new Error("No MIDI output available");
    out.send(singleVoiceSysex(voice, this.channel));
    return out.name;
  }
}
