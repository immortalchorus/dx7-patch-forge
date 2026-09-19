// Web MIDI, both directions.
//
// Out: only the single-voice dump is sent. It lands in the synth's edit buffer, so nothing
// stored is overwritten. A 32-voice cartridge dump would replace the synth's internal memory,
// so the cartridge stays a download.
//
// In: notes, velocity and the sustain pedal play the preview, and a voice or cartridge dump
// sent from the instrument is read straight into the app.

import { singleVoiceSysex, parseSysex, readDx7File } from "./dx7.js";

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

const NOTE_OFF = 0x80, NOTE_ON = 0x90, CONTROL = 0xb0;
const SUSTAIN = 64, ALL_SOUND_OFF = 120, ALL_NOTES_OFF = 123;

export class MidiLink {
  /**
   * onChange: the port list or the connection changed.
   * handlers: { note({note, velocity, on}), panic(), voices({voices, source}) }
   */
  constructor(onChange, handlers = {}) {
    this.onChange = onChange;
    this.handlers = handlers;
    this.access = null;
    const prefs = remembered();
    this.outputId = prefs.outputId || null;
    this.inputId = prefs.inputId ?? "all";
    this.channel = prefs.channel ?? 0;
    this.auto = !!prefs.auto;
    this.listen = prefs.listen ?? true;
    // Notes the pedal is holding up, so they release together when it lifts.
    this.sustained = new Set();
    this.pedal = false;
  }

  get supported() {
    return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess;
  }

  /** Ask for MIDI access with SysEx. Call from a user gesture: browsers show a permission prompt. */
  async connect() {
    this.access = await navigator.requestMIDIAccess({ sysex: true });
    this.access.onstatechange = () => {
      this.bindInputs();
      this.onChange();
    };
    this.bindInputs();
    this.onChange();
  }

  ports(kind) {
    const map = this.access?.[kind];
    return map ? [...map.values()].filter((p) => p.state !== "disconnected") : [];
  }
  outputs() {
    return this.ports("outputs");
  }
  inputs() {
    return this.ports("inputs");
  }

  /** The chosen output, or the first one available. */
  output() {
    const outs = this.outputs();
    return outs.find((o) => o.id === this.outputId) || outs[0] || null;
  }

  /** Inputs currently being listened to: all of them, or the chosen one. */
  listening() {
    if (!this.listen) return [];
    const ins = this.inputs();
    return this.inputId === "all" ? ins : ins.filter((i) => i.id === this.inputId);
  }

  /** Attach to the inputs we listen to, and detach from the rest. */
  bindInputs() {
    const wanted = new Set(this.listening().map((i) => i.id));
    for (const input of this.inputs()) {
      const on = wanted.has(input.id);
      input.onmidimessage = on ? (e) => this.receive(e.data, input.name) : null;
      if (!on) this.releaseAll();
    }
  }

  set(prefs) {
    Object.assign(this, prefs);
    remember({ outputId: this.outputId, inputId: this.inputId, channel: this.channel, auto: this.auto, listen: this.listen });
    if ("inputId" in prefs || "listen" in prefs) this.bindInputs();
  }

  releaseAll() {
    this.sustained.clear();
    this.pedal = false;
    this.handlers.panic?.();
  }

  /**
   * Handle one incoming message. Returns a short description of what it did, which is what
   * the tests check and what the status line shows.
   */
  receive(data, from = "MIDI") {
    const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
    if (bytes[0] === 0xf0) return this.receiveSysex(bytes, from);
    const status = bytes[0] & 0xf0;
    const a = bytes[1], b = bytes[2] ?? 0;
    if (status === NOTE_ON && b > 0) {
      this.sustained.delete(a);
      this.handlers.note?.({ note: a, velocity: b, on: true });
      return "on";
    }
    if (status === NOTE_OFF || (status === NOTE_ON && b === 0)) {
      // The pedal holds the note until it lifts, as it does on the instrument.
      if (this.pedal) return this.sustained.add(a), "held";
      this.handlers.note?.({ note: a, velocity: 0, on: false });
      return "off";
    }
    if (status === CONTROL && a === SUSTAIN) {
      this.pedal = b >= 64;
      if (!this.pedal) {
        for (const note of this.sustained) this.handlers.note?.({ note, velocity: 0, on: false });
        this.sustained.clear();
      }
      return this.pedal ? "pedal down" : "pedal up";
    }
    if (status === CONTROL && (a === ALL_NOTES_OFF || a === ALL_SOUND_OFF)) {
      this.releaseAll();
      return "all notes off";
    }
    return null;
  }

  /** A voice or cartridge dump from the instrument: read it and hand it to the app. */
  receiveSysex(bytes, from) {
    try {
      const voices = bytes.length === 4104 || bytes.length === 163 ? parseSysex(bytes) : readDx7File(bytes).voices;
      if (!voices.length) return null;
      this.handlers.voices?.({ voices, source: from });
      return voices.length === 1 ? "voice received" : `${voices.length} voices received`;
    } catch {
      // Some other manufacturer's SysEx, or a dump this app does not read: ignore it quietly.
      return null;
    }
  }

  /** Send a voice as a 163-byte single-voice dump. Returns the output's name. */
  send(voice) {
    const out = this.output();
    if (!out) throw new Error("No MIDI output available");
    out.send(singleVoiceSysex(voice, this.channel));
    return out.name;
  }
}
