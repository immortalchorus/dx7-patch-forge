import { ALGORITHMS, operatorRoles, opRatio, opFixedHz, cleanName, singleVoiceSysex, cartridgeSysex, readDx7File, defaultVoice, sanitizeVoice } from "./dx7.js";
import { ssynthFile, parseSsynth } from "./ssynth.js";
import { CONTROLS, GROUPS, neutralSliders } from "./controls.js";
import { cartridgeVoices } from "./designer.js";
import { MidiLink } from "./midi.js";
import { algorithmSvg, CHART_HEIGHT, chartHeight, ALGORITHM_LAYOUT } from "./algorithm-chart.js";
import { interchangeableWith } from "./layers.js";
import { createClassicEditor } from "./classic.js";
import { defaultPattern, sanitizePattern, shiftPattern, PRESETS, DIVISIONS, presetById, MAX_CHORDS, stepChordNotes, harmonyKeyRoot, placeChord, stepChord, progressionChords } from "./pattern.js";
import { honeycombSvg, honeycombSize } from "./chord-honeycomb.js";
import { QUALITIES, VOICINGS, SCALES, MODE_MAJOR, defaultChord, sanitizeChord, chordMidiNotes, chordLabel, majorName, keySignature, degreeNumeral, scaleModeNamed } from "./harmony.js";
import { TUTORIAL_STEPS } from "./tutorial.js";
import { progressionMidiFile } from "./midi-file.js";
import { defaultReverb, sanitizeReverb, impulseResponse, REVERB_PRESETS, presetById as verbPreset } from "./reverb.js";
import { dbToGain, sanitizeVolume, volumeText, DEFAULT_DB } from "./monitor.js";
import { noteName } from "./dx7-params.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// response: the last design. edits[i]: the slider-edited version of candidate i, if any.
const state = { response: null, selected: 0, request: 0, lastSignature: "", generatedName: "", variation: 42, edits: {}, group: GROUPS[0], view: "design", manual: null };
const original = () => state.response?.results[state.selected];
// In the classic editor the hand-edited voice is the voice on screen; nothing measures it.
const current = () => state.manual || state.edits[state.selected]?.result || original();
const sliders = () => state.edits[state.selected]?.sliders || original()?.sliders || neutralSliders();

// ---------------------------------------------------------------- design worker
const worker = new Worker(new URL("./design-worker.js", import.meta.url), { type: "module" });
worker.onmessage = ({ data }) => {
  if (data.id !== state.request) return;
  setBusy(false);
  if (data.error) {
    $("#statusText").textContent = "DESIGN FAILED";
    console.error(data.error);
    return;
  }
  if (data.type === "design") {
    state.response = data;
    state.selected = 0;
    state.edits = {};
  } else if (data.type === "load") {
    state.response = { intent: { cues: [], dims: {}, families: {} }, results: [data.result], loadedFrom: state.loading };
    state.selected = 0;
    state.edits = {};
    setNames(data.result.name);
  } else {
    const edit = state.edits[state.selected];
    if (edit) edit.result = data.result;
  }
  show();
};
worker.onerror = (e) => {
  setBusy(false);
  $("#statusText").textContent = "DESIGN FAILED";
  console.error(e);
};

function setBusy(busy, label = "DESIGNING + MEASURING…") {
  $("#generate").disabled = busy;
  document.body.classList.toggle("busy", busy);
  $("#statusText").textContent = busy ? label : "6-OPERATOR FM ENGINE";
}

function forge(autoVary = false) {
  const prompt = $("#prompt").value.trim();
  let variation = +$("#seed").value;
  if (autoVary && prompt + "|" + variation === state.lastSignature) {
    variation = (variation % 99) + 1;
    $("#seed").value = $("#seedOut").value = variation;
  }
  state.lastSignature = prompt + "|" + variation;
  state.variation = variation;
  state.request++;
  setBusy(true);
  worker.postMessage({ type: "design", id: state.request, prompt, variation });
}

let tailorTimer = 0;
/** Rebuild the selected candidate from its starting voice and the current slider set. */
function retailor(values) {
  const base = original();
  if (!base) return;
  state.edits[state.selected] = { sliders: values, result: state.edits[state.selected]?.result || base };
  clearTimeout(tailorTimer);
  tailorTimer = setTimeout(() => {
    state.request++;
    setBusy(true, "RESHAPING + MEASURING…");
    worker.postMessage({ type: "tailor", id: state.request, entryId: base.entryId, sliders: values, variation: state.variation });
  }, 180);
}

// ---------------------------------------------------------------- sliders
const sliderValue = (c, x) => (c.steps ? Math.round(x * (c.steps / 2)) / (c.steps / 2) : x);
function describeValue(c, x) {
  if (c.id === "register") return x ? `${x > 0 ? "+" : ""}${Math.round(x * 2)} oct` : "0";
  if (c.id === "level") return x ? `${x > 0 ? "+" : ""}${(x < 0 ? 24 * x : 6 * x).toFixed(1)} dB` : "auto";
  return x ? `${x > 0 ? "+" : ""}${Math.round(x * 100)}` : "0";
}

function buildTabs() {
  $("#groupTabs").innerHTML = GROUPS.map(
    (g) => `<button role="tab" data-group="${g}" aria-selected="${g === state.group}">${g}</button>`,
  ).join("");
}
$("#groupTabs").onclick = (e) => {
  const b = e.target.closest("[data-group]");
  if (!b) return;
  state.group = b.dataset.group;
  buildTabs();
  drawSliders();
};

/**
 * Update the sliders in place. Rebuilding the panel between the two halves of a double-click
 * replaces the element under the pointer, and the browser then never reports the double-click
 * at all, so resetting a slider by double-clicking it silently did nothing.
 */
function syncSliders() {
  const values = sliders();
  const desc = original()?.sliders || neutralSliders();
  for (const input of document.querySelectorAll("#sliders input[data-id]")) {
    const c = CONTROLS.find((k) => k.id === input.dataset.id);
    const x = values[c.id] || 0;
    // Leave the control alone only while it is being dragged; otherwise the thumb must follow
    // the value, or a reset moves the sound without moving the slider.
    if (!(state.dragging && input === document.activeElement) && +input.value !== x) input.value = x;
    input.style.setProperty("--pos", `${((x + 1) / 2) * 100}%`);
    const out = document.getElementById(`o-${c.id}`);
    if (out) out.value = describeValue(c, x);
    input.closest(".slider").classList.toggle("changed", Math.abs(x - (desc[c.id] || 0)) > 0.005);
  }
  drawSliderCounts(values);
}

function drawSliderCounts(values) {
  const counts = Object.fromEntries(GROUPS.map((g) => [g, CONTROLS.filter((c) => c.group === g && Math.abs(values[c.id]) > 0.005).length]));
  document.querySelectorAll("#groupTabs [data-group]").forEach((b) => (b.dataset.count = counts[b.dataset.group] || ""));
  $("#shaperStatus").textContent = state.edits[state.selected] ? "edited · double-click resets a slider" : "0 = starting voice";
}

function drawSliders() {
  const focusId = document.activeElement?.dataset?.id;
  const values = sliders();
  const desc = original()?.sliders || neutralSliders();
  // Only rebuild when the panel's shape changes; otherwise update what is already there.
  const shape = CONTROLS.filter((c) => c.group === state.group).map((c) => c.id + (current()?.unavailable?.[c.id] ? "!" : "")).join(",");
  if (shape === state.sliderShape) return syncSliders();
  state.sliderShape = shape;
  drawSliderCounts(values);
  $("#sliders").innerHTML = CONTROLS.filter((c) => c.group === state.group)
    .map((c) => {
      const x = values[c.id] || 0;
      const changed = Math.abs(x - (desc[c.id] || 0)) > 0.005;
      const step = c.steps ? 2 / c.steps : 0.01;
      const off = current()?.unavailable?.[c.id];
      if (off)
        return `<div class="slider off" title="${esc(c.hint)}">
        <div class="slider-head"><label>${esc(c.label)}</label><output>n/a</output></div>
        <input type="range" min="-1" max="1" value="0" disabled aria-label="${esc(c.label)} (unavailable)" style="--pos:50%">
        <div class="slider-why">Not available: ${esc(off)}.</div>
      </div>`;
      return `<div class="slider ${changed ? "changed" : ""}" title="${esc(c.hint)}">
        <div class="slider-head"><label for="s-${c.id}">${esc(c.label)}</label><output id="o-${c.id}">${describeValue(c, x)}</output></div>
        <input id="s-${c.id}" data-id="${c.id}" type="range" min="-1" max="1" step="${step}" value="${x}" style="--pos:${((x + 1) / 2) * 100}%">
        <div class="slider-ends"><span>${esc(c.left)}</span><span>${esc(c.right)}</span></div>
      </div>`;
    })
    .join("");
  if (focusId) $(`#s-${focusId}`)?.focus();
}

$("#sliders").addEventListener("input", (e) => {
  const input = e.target.closest("input[data-id]");
  if (!input) return;
  const c = CONTROLS.find((k) => k.id === input.dataset.id);
  const x = sliderValue(c, +input.value);
  input.style.setProperty("--pos", `${((x + 1) / 2) * 100}%`);
  $(`#o-${c.id}`).value = describeValue(c, x);
  input.closest(".slider").classList.add("changed");
  retailor({ ...sliders(), [c.id]: x });
});
$("#sliders").addEventListener("pointerdown", () => (state.dragging = true));
addEventListener("pointerup", () => {
  if (state.dragging) (state.dragging = false), syncSliders();
});
$("#sliders").addEventListener("dblclick", (e) => {
  const input = e.target.closest("input[data-id]");
  if (!input) return;
  const id = input.dataset.id;
  retailor({ ...sliders(), [id]: original()?.sliders?.[id] || 0 });
  drawSliders();
});
$("#resetDescription").onclick = () => {
  if (!original()) return;
  delete state.edits[state.selected];
  show();
};
$("#resetZero").onclick = () => {
  retailor(neutralSliders());
  drawSliders();
};

// ---------------------------------------------------------------- rendering the result
/** The ten-character name a DX7 voice can hold: what goes into .syx, a slot and a MIDI dump. */
function patchName() {
  return cleanName($("#patchName").value.trim() || shortenTitle(patchTitle()) || current()?.name || "FORGE");
}

/** What the patch is called: the file name, and the name stored inside a SpaceAge patch. */
function patchTitle() {
  return $("#patchTitle").value.trim() || current()?.name || "Untitled";
}

/**
 * The ten-character DX7 name a title reduces to. SpaceAge makes a DX7 name by taking the
 * first ten characters of the patch name, so OWL does exactly the same: export the same
 * patch as .syx here and as .ssynth into SpaceAge, and both instruments show the same name.
 * Type into the DX7 name box to override it.
 */
function shortenTitle(title) {
  return cleanName(String(title).toUpperCase()).trim();
}

/** Keep the DX7 name following the title, until someone types their own. */
function syncNames(title) {
  const field = $("#patchName");
  if (field.dataset.edited === "1") return;
  field.value = shortenTitle(title);
}

/** Set both names at once, from a generated, loaded or hand-edited patch. */
function setNames(name) {
  $("#patchTitle").value = name;
  $("#patchName").dataset.edited = "";
  syncNames(name);
}

function show() {
  if (state.manual) return showManual();
  const r = current();
  const { intent, results } = state.response;
  const titleField = $("#patchTitle");
  if (!titleField.value || titleField.value === state.generatedName) setNames(r.name);
  state.generatedName = r.name;
  sendVoice();
  if (midi.auto && midi.access) sendToSynth(true);

  const cues = intent.cues;
  $("#matchCount").textContent = `${cues.length} cue${cues.length === 1 ? "" : "s"} recognised`;
  $("#cueChips").innerHTML = cues
    .map((c) => `<span class="trait-chip${c.family ? " family" : ""}"><b>${esc(c.phrase.toUpperCase())}</b>${c.family ? `<em class="tag">${esc(c.family)}</em>` : ""}</span>`)
    .join("");
  $("#interpretNote").textContent = state.response.loadedFrom
    ? `Loaded ${state.response.loadedFrom}. Sliders start at 0, which is the voice exactly as loaded.`
    : cues.length
    ? "Instrument words chose the starting voice; the others set the sliders below."
    : "No familiar sound words found, so the closest general-purpose voice was used. Try naming an instrument, or shape it with the sliders.";

  const v = r.voice;
  $("#sourceBadge").textContent = `FROM ${r.source.name}`;
  $("#sourceBadge").title = `${r.source.origin} · ${r.source.family}`;
  $("#algoNum").textContent = String(v.algorithm).padStart(2, "0");
  $("#feedback").textContent = `${v.feedback} / 7`;
  const semis = v.transpose - 24;
  $("#transpose").textContent = `${semis >= 0 ? "+" : ""}${semis} st`;
  $("#character").textContent = r.source.family.toUpperCase();
  drawAlgorithm(v);
  drawPicker(v);
  drawOperators(v);
  drawWhy(r);
  drawAlternates(results);
  if (!state.dragging) drawSliders();
  updateFileName();
}

function drawOperators(v) {
  const roles = operatorRoles(v.algorithm);
  $("#operators").innerHTML = v.ops
    .map((o, i) => {
      const c = roles[i].carrier;
      const freq = o.mode ? `${opFixedHz(o).toFixed(opFixedHz(o) < 10 ? 2 : 0)}Hz` : opRatio(o).toFixed(2).replace(/\.?0+$/, "");
      return `<div class="op ${c ? "carrier" : ""} ${o.level ? "" : "silent"}"><span>OP ${i + 1} · ${c ? "C" : "M"}</span><strong>${freq}</strong><small>LVL ${o.level}${o.detune !== 7 ? ` · DET ${o.detune - 7 > 0 ? "+" : ""}${o.detune - 7}` : ""}</small></div>`;
    })
    .join("");
}

function drawAlgorithm(v) {
  // DX7 panel positions and line types, in the app's palette (carriers orange, modulators slate).
  const css = getComputedStyle(document.documentElement);
  const tok = (name) => css.getPropertyValue(name).trim();
  const alg = ALGORITHMS[v.algorithm];
  const silent = new Set(v.ops.map((o, i) => (o.level ? 0 : i + 1)).filter(Boolean));
  const svg = $("#algoSvg");
  svg.setAttribute("viewBox", `0 0 440 ${CHART_HEIGHT}`);
  svg.innerHTML = algorithmSvg(v.algorithm, alg.edges, alg.carriers, {
    width: 440,
    silent,
    colors: { fill: tok("--black"), carrier: tok("--orange-text"), modulator: tok("--label"), line: "#6a6a72", bus: tok("--orange-text"), feedback: tok("--blue"), dim: tok("--line") },
  });
}

/** The 32-algorithm chart: pick one and the voice is remapped onto it. */
function drawPicker(v) {
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const family = new Set(interchangeableWith(state.manual ? v.algorithm : original()?.voice.algorithm ?? v.algorithm));
  const colors = { fill: tok("--black"), carrier: tok("--orange-text"), modulator: tok("--label"), line: "#6a6a72", bus: tok("--orange-text"), feedback: tok("--blue"), dim: tok("--line") };
  $("#algoPicker").innerHTML = Array.from({ length: 32 }, (_, i) => i + 1)
    .map((a) => {
      const rows = Math.max(...Object.values(ALGORITHM_LAYOUT[a].p).map(([, r]) => r)) + 1;
      const scale = 0.42, h = chartHeight({ boxH: 34 * scale, gapY: 16 * scale, rows });
      const alg = ALGORITHMS[a];
      const cls = a === v.algorithm ? "on" : family.has(a) ? "kin" : "";
      const why = a === v.algorithm ? "current algorithm" : family.has(a) ? "interchangeable with this voice's algorithm" : "different structure";
      return `<button class="algo-pick ${cls}" data-alg="${a}" title="Algorithm ${a}: ${why}"><svg viewBox="0 0 104 ${h.toFixed(0)}" aria-hidden="true">${algorithmSvg(a, alg.edges, alg.carriers, { width: 104, colors, scale, rows })}</svg><i>${a}</i></button>`;
    })
    .join("");
}
$("#algoPicker").onclick = (e) => {
  const b = e.target.closest(".algo-pick");
  if (!b || !current()) return;
  const alg = +b.dataset.alg;
  // In the classic editor the algorithm changes exactly as it does on the DX7: the operators
  // stay where they are and take whatever role the new algorithm gives them.
  if (state.manual) return classic.setAlgorithm(alg);
  retailor({ ...sliders(), algorithm: alg === original().voice.algorithm ? 0 : alg });
};
$("#algoToggle").onclick = () => {
  const open = document.querySelector(".algo-chart").classList.toggle("open");
  $("#algoToggle").textContent = open ? "Hide algorithms" : "Change algorithm";
};

// ---------------------------------------------------------------- classic editor
// The classic tab hand-edits the voice: no searching, no measuring. The right-hand column
// keeps working (keyboard, diagram, cartridges, downloads, MIDI) because it reads current().
let classic = null;
let midiTimer = 0;

function ensureClassic() {
  classic ||= createClassicEditor({
    root: $("#classicRoot"),
    onChange: (voice) => {
      state.manual = manualResult(voice);
      showManual();
    },
    onPreview: (voice) => audio?.send({ type: "voice", voice }),
  });
  return classic;
}

const manualResult = (voice) => ({ voice, name: voice.name, manual: true, unavailable: {} });

/** The right-hand column for a hand-edited voice: everything that does not need measurements. */
function showManual() {
  const v = current().voice;
  sendVoice();
  if (midi.auto && midi.access) {
    clearTimeout(midiTimer);
    midiTimer = setTimeout(() => sendToSynth(true), 250);
  }
  $("#sourceBadge").textContent = "HAND EDITED";
  $("#sourceBadge").title = "Edited parameter by parameter in the classic editor";
  $("#algoNum").textContent = String(v.algorithm).padStart(2, "0");
  $("#feedback").textContent = `${v.feedback} / 7`;
  const semis = v.transpose - 24;
  $("#transpose").textContent = `${semis >= 0 ? "+" : ""}${semis} st`;
  $("#character").textContent = "CLASSIC";
  drawAlgorithm(v);
  drawPicker(v);
  drawOperators(v);
  $("#whyText").textContent = "Hand edited. The measurements below are from before these edits; switch to Interactive to measure the voice again.";
  updateFileName();
}

function setView(view) {
  if (view === state.view) return;
  const tabs = document.querySelectorAll("#viewTabs [data-view]");
  tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  document.body.classList.toggle("view-classic", view === "classic");
  $("#composer").hidden = view === "classic";
  $("#classicView").hidden = view !== "classic";
  state.view = view;
  if (view === "classic") {
    // Before the first design has finished there is nothing to edit yet, so start from INIT VOICE.
    const base = current();
    ensureClassic().setVoice(base ? { ...base.voice, name: patchName() } : blankVoice());
    state.manual = manualResult(classic.voice);
    showManual();
  } else {
    const edited = classic?.edited;
    const voice = state.manual?.voice;
    state.manual = null;
    // Hand the edited voice to the designer as its starting voice, so the sliders and the
    // measurements describe what is actually on screen.
    if (edited && voice) editVoice({ ...voice, name: patchName() }, "your classic-editor edits");
    else if (state.response) show();
  }
}
$("#viewTabs").onclick = (e) => {
  const b = e.target.closest("[data-view]");
  if (b) setView(b.dataset.view);
};
addEventListener("keydown", (e) => {
  if (state.view !== "classic" || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  e.preventDefault();
  e.shiftKey ? classic.redo() : classic.undo();
});

const fmtTime = (s) => (s >= 20 ? "sustains" : s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);
function drawWhy(r) {
  const adj = r.applied.length ? r.applied.join(", ") : "no changes needed";
  $("#whyText").textContent = `Started from ${r.source.name} (${r.source.origin}, ${r.source.family}), then: ${adj}.`;
  const rows = [
    ["Brightness", (f) => `${f.centroid.toFixed(1)}×`, r.targets.centroid && `${r.targets.centroid.toFixed(1)}×`],
    ["Attack", (f) => fmtTime(f.attack), r.targets.attack && fmtTime(r.targets.attack)],
    ["Decay (held)", (f) => fmtTime(f.decay), r.targets.decay && fmtTime(r.targets.decay)],
    ["Release", (f) => (f.release ? fmtTime(f.release) : "—"), r.targets.release && fmtTime(r.targets.release)],
    ["Inharmonic", (f) => `${Math.round(f.inharm * 100)}%`, ""],
    ["Late ÷ early brightness", (f) => `${(f.late / f.early).toFixed(2)}×`, r.targets.evolveRatio && `${r.targets.evolveRatio.toFixed(2)}×`],
    ["Peak (0 dB clips)", (f) => (f.peakDb == null ? "—" : `${f.peakDb.toFixed(1)} dB`), "−1.0 dB"],
  ];
  $("#measureTable").innerHTML =
    `<tr><th></th><th>START</th><th>TARGET</th><th>RESULT</th></tr>` +
    rows.map(([label, fmt, target]) => `<tr><td>${label}</td><td>${fmt(r.base)}</td><td>${target || "—"}</td><td>${fmt(r.features)}</td></tr>`).join("");
  $("#measureTable").classList.toggle("clips", r.features.peakDb > 0);
}

function drawAlternates(results) {
  $("#alternates").innerHTML = results
    .map((r, i) => `<button class="alt ${i === state.selected ? "on" : ""}" data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.source.name)} · ${esc(r.source.family)}</small></button>`)
    .join("");
}
$("#alternates").onclick = (e) => {
  const b = e.target.closest(".alt");
  if (!b) return;
  state.selected = +b.dataset.i;
  show();
};

function updateFileName() {
  $("#fileName").textContent = stem() + ".ssynth";
}

// ---------------------------------------------------------------- audition
let audio = null;
// The keyboard and the loop share one octave, remembered between visits.
let octave = Math.min(7, Math.max(1, +localStorage.getItem("owl.octave") || 4));
const KEYS = "awsedftgyhujk";
let audioSetup = null;
/**
 * Start audio on first use. The preview runs in an AudioWorklet; if the browser or host
 * cannot load it, the same engine runs on the main thread instead, so the keyboard always
 * sounds. audio.send() talks to whichever is running.
 */
function ensureAudio() {
  audioSetup ||= (async () => {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    try {
      if (!ctx.audioWorklet) throw new Error("AudioWorklet unavailable");
      await ctx.audioWorklet.addModule(new URL("./preview-worklet.js", import.meta.url));
      const node = new AudioWorkletNode(ctx, "fm-preview", { outputChannelCount: [2] });
      node.port.onmessage = ({ data }) => engineEvent(data);
      connectOutput(ctx, node);
      audio = { ctx, send: (m) => node.port.postMessage(m), mode: "worklet" };
    } catch (err) {
      console.warn("Audio worklet failed to load; using the main-thread preview instead.", err);
      const { PreviewEngine } = await import("./preview-engine.js");
      const engine = new PreviewEngine(ctx.sampleRate, engineEvent);
      const node = ctx.createScriptProcessor(1024, 0, 2);
      node.onaudioprocess = (e) => engine.render([e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1)]);
      connectOutput(ctx, node);
      audio = { ctx, send: (m) => engine.message(m), mode: "main-thread", node };
    }
    sendVoice();
    audio.send({ type: "pattern", pattern: loop.pattern });
    return audio;
  })();
  audioSetup.catch(() => (audioSetup = null));
  return audioSetup;
}
// In the classic editor what you hear also reflects muted operators and compare.
const currentVoice = () => (state.manual ? classic.previewVoice : current()?.voice);
function sendVoice() {
  const voice = currentVoice();
  if (audio && voice) audio.send({ type: "voice", voice });
}
async function noteOn(note, velocity) {
  try {
    const a = await ensureAudio();
    if (a.ctx.state !== "running") await a.ctx.resume();
    a.send({ type: "on", note, velocity: velocity ?? +$("#velocity").value });
    document.querySelector(`[data-note="${note}"]`)?.classList.add("down");
  } catch (err) {
    $("#statusText").textContent = String(err.message || err).toUpperCase();
  }
}
function noteOff(note) {
  audio?.send({ type: "off", note });
  document.querySelector(`[data-note="${note}"]`)?.classList.remove("down");
}

function buildKeyboard() {
  const base = octave * 12 + 12; // octave 4 starts at MIDI 60
  const black = [1, 3, 6, 8, 10];
  let html = "";
  for (let i = 0; i < 25; i++) {
    const n = base - 12 + i;
    html += `<div class="key ${black.includes(i % 12) ? "black" : "white"}" data-note="${n}"></div>`;
  }
  $("#keyboard").innerHTML = html;
  $("#octOut").value = `C${octave - 1}`;
}
const held = new Map();
$("#keyboard").addEventListener("pointerdown", (e) => {
  const k = e.target.closest(".key");
  if (!k) return;
  k.setPointerCapture?.(e.pointerId);
  held.set(e.pointerId, +k.dataset.note);
  noteOn(+k.dataset.note);
});
for (const type of ["pointerup", "pointercancel"])
  $("#keyboard").addEventListener(type, (e) => {
    if (held.has(e.pointerId)) noteOff(held.get(e.pointerId)), held.delete(e.pointerId);
  });
const typing = () => ["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName) && document.activeElement.type !== "range";
const down = new Set();
addEventListener("keydown", (e) => {
  const i = KEYS.indexOf(e.key.toLowerCase());
  if (i < 0 || typing() || e.repeat || e.metaKey || e.ctrlKey) return;
  const n = octave * 12 + i;
  down.add(n);
  noteOn(n);
});
addEventListener("keyup", (e) => {
  const i = KEYS.indexOf(e.key.toLowerCase());
  if (i < 0) return;
  const n = octave * 12 + i;
  if (down.delete(n)) noteOff(n);
});
/** The octave buttons move the keyboard and the loop together, so what you play and what
 * the loop plays stay in the same register. A shift that would push a note off the keyboard
 * is refused rather than squashing the pattern. */
function shiftOctave(delta) {
  const next = Math.min(7, Math.max(1, octave + delta));
  if (next === octave) return;
  const moved = shiftPattern(loop.pattern, delta * 12);
  if (!moved) {
    // A progression can also be what refuses: its chords move by whole octaves and SpaceAge
    // clamps that to three either way, so say which of the two is in the way.
    $("#loopHint").textContent = progressionChords(loop.pattern).length
      ? "The loop cannot move any further: a note or a chord would run off the keyboard."
      : "The pattern cannot move any further without running off the keyboard.";
    return;
  }
  octave = next;
  try {
    localStorage.setItem("owl.octave", String(octave));
  } catch {
    // Storage blocked; the octave just will not be remembered.
  }
  loop.pattern = sanitizePattern(moved);
  buildKeyboard();
  pushPattern();
  drawChordLab();
  drawRoll();
}
$("#octDown").onclick = () => shiftOctave(-1);
$("#octUp").onclick = () => shiftOctave(1);

// ---------------------------------------------------------------- monitoring reverb
// Listening equipment only: it sits after the engine, so nothing it does reaches a patch
// file, a MIDI dump or the measurements, and the clip meter still reads the dry signal.
const VERB_KEY = "owl.reverb";
const verb = { settings: loadReverb(), nodes: null };

// Settings saved before the impulse was corrected had to be dialled down to almost nothing to
// be usable, so a mix from that version would now be inaudible: take the default instead.
const VERB_VERSION = 2;
function loadReverb() {
  try {
    const saved = JSON.parse(localStorage.getItem(VERB_KEY));
    if (!saved) return defaultReverb();
    if (saved.v !== VERB_VERSION) saved.mix = defaultReverb().mix;
    return sanitizeReverb(saved);
  } catch {
    return defaultReverb();
  }
}
function saveReverb() {
  try {
    localStorage.setItem(VERB_KEY, JSON.stringify({ ...verb.settings, v: VERB_VERSION }));
  } catch {
    // Storage blocked; the setting still applies for this session.
  }
}

/** Engine → dry, and engine → pre-delay → convolver → wet. */
function connectOutput(ctx, source) {
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const predelay = ctx.createDelay(0.2);
  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  const master = ctx.createGain();
  source.connect(dry).connect(master);
  source.connect(predelay).connect(convolver).connect(wet).connect(master);
  master.connect(ctx.destination);
  verb.nodes = { ctx, dry, wet, predelay, convolver, master };
  applyReverb();
  applyVolume();
}

/** Rebuild the impulse for the current size and preset, and set the mix. */
function applyReverb({ rebuild = true } = {}) {
  const s = verb.settings;
  const n = verb.nodes;
  if (!n) return;
  const preset = verbPreset(s.preset);
  if (rebuild) {
    const [l, r] = impulseResponse(n.ctx.sampleRate, { seconds: s.seconds, damping: preset.damping });
    const buffer = n.ctx.createBuffer(2, l.length, n.ctx.sampleRate);
    buffer.copyToChannel(l, 0);
    buffer.copyToChannel(r, 1);
    n.convolver.buffer = buffer;
  }
  n.predelay.delayTime.value = preset.predelay;
  const mix = s.on ? s.mix : 0;
  // Equal-power-ish: the dry path only dips a little, so switching the reverb on is not a jump in level.
  n.wet.gain.value = mix;
  n.dry.gain.value = 1 - 0.3 * mix;
}

// Monitoring level. The meter reads the engine before this, so turning it down cannot hide
// a patch that clips where it counts.
//
// It always opens at DEFAULT_DB and is deliberately *not* remembered between visits, unlike the
// octave, the reverb and the loop. Those are choices about the work; this is a choice about the
// room you are in, and carrying it across sessions means a level set quiet for headphones late
// one night is still there on speakers the next morning - or worse, the other way round. A known
// starting level every time is the safer promise, and the control is one drag away.
let volumeDb = DEFAULT_DB;
try {
  // Left behind by the versions that did remember it.
  localStorage.removeItem("owl.volume");
} catch {
  // Storage blocked; there is nothing stale to clear.
}
function applyVolume() {
  const g = verb.nodes?.master?.gain;
  if (!g) return;
  // A short ramp, so dragging the control does not crackle.
  g.setTargetAtTime(dbToGain(volumeDb), verb.nodes.ctx.currentTime, 0.02);
}
function drawVolume() {
  $("#volume").value = volumeDb;
  $("#volOut").value = volumeText(volumeDb);
  $("#volume").title = `Monitoring level: ${volumeText(volumeDb)}. It changes only what you hear, never the patch.`;
}
$("#volume").oninput = (e) => {
  volumeDb = sanitizeVolume(e.target.value);
  applyVolume();
  drawVolume();
};

function drawReverb() {
  const s = verb.settings;
  $("#verbOn").checked = s.on;
  $("#verbPreset").innerHTML = REVERB_PRESETS.map((p) => `<option value="${p.id}" ${p.id === s.preset ? "selected" : ""}>${esc(p.label)}</option>`).join("");
  $("#verbMix").value = Math.round(s.mix * 100);
  $("#verbMixOut").value = `${Math.round(s.mix * 100)}%`;
  $("#verbSize").value = Math.round(s.seconds * 100);
  $("#verbSizeOut").value = `${s.seconds.toFixed(1)} s`;
  $("#verb").classList.toggle("off", !s.on);
}

function setReverb(change, rebuild) {
  change(verb.settings);
  verb.settings = sanitizeReverb(verb.settings);
  saveReverb();
  applyReverb({ rebuild });
  drawReverb();
}
$("#verbOn").onchange = (e) => setReverb((s) => (s.on = e.target.checked), false);
$("#verbPreset").onchange = (e) =>
  setReverb((s) => {
    s.preset = e.target.value;
    s.seconds = verbPreset(s.preset).seconds; // a space is a size as well as a tone
    if (!s.on) s.on = true;
  }, true);
$("#verbMix").oninput = (e) => setReverb((s) => ((s.mix = +e.target.value / 100), (s.on = s.on || s.mix > 0)), false);
$("#verbSize").oninput = (e) => setReverb((s) => (s.seconds = +e.target.value / 100), true);

// ---------------------------------------------------------------- audition loop
// A short pattern that keeps playing while the voice is edited, so a change can be heard as
// it is made rather than remembered across a gap. The transport lives in the audio engine;
// this is only the editor for it. Nothing here is saved into a patch.
const LOOP_KEY = "owl.loop";
const ROWS = 25; // two octaves of the roll
const BLACK = new Set([1, 3, 6, 8, 10]);
const loop = { pattern: loadPattern(), playing: false, base: 48, head: -1 };

function loadPattern() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOOP_KEY));
    if (saved) return sanitizePattern(saved);
  } catch {
    // Unavailable or corrupt storage: start from the default pattern.
  }
  return defaultPattern();
}
function savePattern() {
  try {
    localStorage.setItem(LOOP_KEY, JSON.stringify(loop.pattern));
  } catch {
    // Storage blocked; the pattern still works for this session.
  }
}
/** Send the edited pattern to the engine: the loop picks it up without stopping. */
function pushPattern() {
  audio?.send({ type: "pattern", pattern: loop.pattern });
  savePattern();
}

function engineEvent(e) {
  if (e.type !== "playhead") return;
  if (e.step !== loop.head) {
    loop.head = e.step;
    document.querySelectorAll("#roll .rcol, #velLane .vbar").forEach((el) => el.classList.toggle("head", +el.dataset.i === e.step));
  }
  const peak = Math.min(1, e.peak || 0);
  $("#loopMeter").style.width = `${(peak * 100).toFixed(1)}%`;
  $("#loopMeter").classList.toggle("hot", peak > 0.9);
  $("#loopClip").classList.toggle("on", (e.peak || 0) >= 1);
}

function drawLoopControls() {
  const p = loop.pattern;
  $("#loopPreset").innerHTML = `<option value="">Custom</option>` + PRESETS.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join("");
  $("#loopDivision").innerHTML = DIVISIONS.map((d) => `<option value="${d.id}" ${d.id === p.division ? "selected" : ""}>${esc(d.label)}</option>`).join("");
  $("#loopBpm").value = p.bpm;
  $("#loopGate").value = Math.round(p.gate * 100);
  $("#loopGateOut").value = `${Math.round(p.gate * 100)}%`;
}

function drawRoll() {
  const p = loop.pattern;
  const notes = p.steps.map((s) => s.note).filter((n) => n != null);
  // Keep the written notes in view: follow them, in whole octaves.
  if (notes.length) {
    const lo = Math.min(...notes), hi = Math.max(...notes);
    // Keep the notes off the very edge of the window, unless they span more than it can show.
    const crowded = lo <= loop.base || hi >= loop.base + ROWS - 1;
    if (crowded && hi - lo <= ROWS - 3) loop.base = Math.max(0, Math.min(103, Math.floor(Math.max(0, lo - 4) / 12) * 12));
    else if (lo < loop.base || hi > loop.base + ROWS - 1) loop.base = Math.max(0, Math.min(103, Math.floor(Math.max(0, lo) / 12) * 12));
  }
  // A label column so the roll can be read at a glance: octave Cs, named as the DX7 names them.
  const labels = Array.from({ length: ROWS }, (_, r) => {
    const note = loop.base + (ROWS - 1 - r);
    return `<i class="rlabel">${note % 12 === 0 ? noteName(note) : ""}</i>`;
  }).join("");
  $("#roll").innerHTML = `<div class="rlabels">${labels}</div>` + p.steps
    .map((s, i) => {
      const cells = Array.from({ length: ROWS }, (_, r) => {
        const note = loop.base + (ROWS - 1 - r);
        const cls = `rcell${BLACK.has(note % 12) ? " black" : ""}${s.note === note ? " on" : ""}`;
        return `<i class="${cls}" data-note="${note}"></i>`;
      }).join("");
      const above = s.note != null && s.note > loop.base + ROWS - 1;
      const below = s.note != null && s.note < loop.base;
      return `<div class="rcol${i === loop.head ? " head" : ""}" data-i="${i}">${cells}${
        above || below ? `<u class="off-roll" title="${noteName(s.note)}, outside the visible range">${above ? "↑" : "↓"}</u>` : ""
      }</div>`;
    })
    .join("");
  $("#velLane").innerHTML = `<i class="lane-label">VEL</i>` + p.steps
    .map(
      (s, i) =>
        `<div class="vbar${s.note == null ? " rest" : ""}${i === loop.head ? " head" : ""}" data-i="${i}" role="slider" tabindex="0"
        aria-label="Step ${i + 1} velocity" aria-valuemin="1" aria-valuemax="127" aria-valuenow="${s.vel}" title="Velocity ${s.vel}"><b style="height:${(s.vel / 127) * 100}%"></b></div>`,
    )
    .join("");
  $("#tieLane").innerHTML =
    `<i class="lane-label">HOLD</i>` +
    p.steps
      .map((s, i) => `<button class="tie${s.tie ? " on" : ""}" data-i="${i}" aria-pressed="${s.tie}" title="Hold the note before it through step ${i + 1}"></button>`)
      .join("");
  drawChordLane();
}

/**
 * The chord row: which chord of the progression each step plays, if any. It sits with HOLD and
 * VEL because it is the same kind of thing - one more property of a step - and because a chord
 * has to be read against the notes above it to make sense.
 */
function drawChordLane() {
  const p = loop.pattern;
  const any = progressionChords(p).length > 0;
  $(".lane-chord").hidden = !any;
  if (!any) return;
  const selected = stepChord(p, lab.selected);
  $("#chordLane").innerHTML =
    `<i class="lane-label">CHORD</i>` +
    p.steps
      .map((s, i) => {
        const on = s.chord != null;
        const label = on ? labelFor(s.chord) : "";
        const title = !on
          ? selected
            ? `Step ${i + 1} plays its own note. Click to repeat ${labelFor(selected)} here, as its own chord.`
            : `Step ${i + 1} plays its own note. Click to put a chord on it.`
          : i === lab.selected
            ? `Step ${i + 1} plays ${label}, and is selected. Click to take it off.`
            : `Step ${i + 1} plays ${label}. Click to select it.`;
        return `<button class="cstep${on ? " on" : ""}${i === lab.selected ? " sel" : ""}" data-i="${i}"
          title="${esc(title)}" aria-label="${esc(title)}">${esc(label)}</button>`;
      })
      .join("");
}

function editPattern(change) {
  change(loop.pattern);
  loop.pattern = sanitizePattern(loop.pattern);
  $("#loopPreset").value = "";
  $("#loopHint").textContent = "";
  pushPattern();
  drawRoll();
}

$("#roll").addEventListener("click", (e) => {
  const cell = e.target.closest(".rcell");
  if (!cell) return;
  const i = +cell.closest(".rcol").dataset.i;
  const note = +cell.dataset.note;
  editPattern((p) => (p.steps[i].note = p.steps[i].note === note ? null : note));
});
// Velocity: drag across the lane to draw a shape, as on a step sequencer.
let drawingVel = false;
const velFromEvent = (bar, y) => {
  const r = bar.getBoundingClientRect();
  return Math.max(1, Math.min(127, Math.round((1 - (y - r.top) / r.height) * 127)));
};
$("#velLane").addEventListener("pointerdown", (e) => {
  const bar = e.target.closest(".vbar");
  if (!bar) return;
  drawingVel = true;
  editPattern((p) => (p.steps[+bar.dataset.i].vel = velFromEvent(bar, e.clientY)));
});
$("#velLane").addEventListener("pointermove", (e) => {
  if (!drawingVel) return;
  const bar = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".vbar");
  if (bar) editPattern((p) => (p.steps[+bar.dataset.i].vel = velFromEvent(bar, e.clientY)));
});
addEventListener("pointerup", () => (drawingVel = false));
$("#velLane").addEventListener("keydown", (e) => {
  const bar = e.target.closest(".vbar");
  const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
  if (!bar || !delta) return;
  e.preventDefault();
  editPattern((p) => (p.steps[+bar.dataset.i].vel += delta * (e.shiftKey ? 10 : 1)));
  $(`#velLane .vbar[data-i="${bar.dataset.i}"]`)?.focus();
});
$("#tieLane").addEventListener("click", (e) => {
  const b = e.target.closest(".tie");
  if (b) editPattern((p) => (p.steps[+b.dataset.i].tie = !p.steps[+b.dataset.i].tie));
});

$("#loopPreset").onchange = (e) => {
  const preset = presetById(e.target.value);
  if (!preset) return;
  // Presets are written around middle C; bring them to whatever octave is on screen.
  const written = preset.make();
  loop.pattern = sanitizePattern(shiftPattern(written, (octave - 4) * 12) || written);
  lab.selected = null;
  $("#loopHint").textContent = preset.hint;
  pushPattern();
  drawLoopControls();
  $("#loopPreset").value = preset.id;
  drawChordLab();
  drawRoll();
};
$("#loopBpm").oninput = (e) => editPattern((p) => (p.bpm = +e.target.value || p.bpm));
$("#loopDivision").onchange = (e) => editPattern((p) => (p.division = e.target.value));
$("#loopGate").oninput = (e) => {
  $("#loopGateOut").value = `${e.target.value}%`;
  editPattern((p) => (p.gate = +e.target.value / 100));
};
$("#loopToggle").onclick = () => {
  const body = $(".loop-body");
  body.hidden = !body.hidden;
  $("#loopToggle").setAttribute("aria-expanded", String(!body.hidden));
  $("#loopToggle").textContent = body.hidden ? "Edit pattern" : "Hide pattern";
};

async function setLoopPlaying(playing) {
  loop.playing = playing;
  $("#loopPlay").textContent = playing ? "Stop loop" : "Play loop";
  $("#loopPlay").setAttribute("aria-pressed", String(playing));
  $("#loopPlay").classList.toggle("on", playing);
  if (!playing) {
    audio?.send({ type: "transport", playing: false });
    return;
  }
  try {
    const a = await ensureAudio();
    if (a.ctx.state !== "running") await a.ctx.resume();
    a.send({ type: "pattern", pattern: loop.pattern });
    a.send({ type: "transport", playing: true });
  } catch (err) {
    setLoopPlaying(false);
    $("#statusText").textContent = String(err.message || err).toUpperCase();
  }
}
$("#loopPlay").onclick = () => setLoopPlaying(!loop.playing);
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || typing() || e.target.closest?.("button")) return;
  e.preventDefault();
  setLoopPlaying(!loop.playing);
});

// ---------------------------------------------------------------- chord lab
// Picking chords from a honeycomb and hearing a patch through them. The musical model is
// harmony.js, ported from SpaceAge; the honeycomb is chord-honeycomb.js. This is only the wiring:
// which chord is selected, and what each control does to it.
//
// `lab.selected` is a **step index**, not a position in a list. Each step owns its chord, so
// selecting a chord means selecting the step it sits on, and two steps showing the same chord are
// two chords that happen to match rather than one chord heard twice.
//
// The point of this in a patch designer, as against a sequencer, is the measurement at the end:
// four stacked carriers clip where one does not, and until now nothing in OWL could say so.
const lab = { selected: null, measuring: false };

const harmonyOf = () => loop.pattern.harmony;
const labelFor = (chord) =>
  chordLabel(chord, { keyPosition: harmonyOf().keyPosition, mode: harmonyOf().mode, preferFlats: harmonyOf().preferFlats });
const notesOf = (chord) => chordMidiNotes(chord, { keyRoot: harmonyKeyRoot(harmonyOf()), mode: harmonyOf().mode });

function editHarmony(change) {
  change(loop.pattern.harmony);
  loop.pattern = sanitizePattern(loop.pattern);
  if (lab.selected != null && stepChord(loop.pattern, lab.selected) == null) lab.selected = null;
  pushPattern();
  drawChordLab();
  drawRoll();
}

/** Edit the chord on a step, leaving every other chord alone even if it matches. */
function editStepChord(step, change) {
  if (step == null || stepChord(loop.pattern, step) == null) return;
  change(loop.pattern.steps[step].chord);
  loop.pattern = sanitizePattern(loop.pattern);
  pushPattern();
  drawChordLab();
  drawRoll();
}

function drawChordLabControls() {
  $("#clKey").innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${esc(majorName(i))} major</option>`).join("");
  $("#clMode").innerHTML = SCALES.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join("");
  $("#clSpelling").innerHTML =
    `<option value="key">From the key</option><option value="sharps">Sharps</option><option value="flats">Flats</option>`;
  $("#clQuality").innerHTML = QUALITIES.map((q, i) => `<option value="${i}">${esc(q.name)}</option>`).join("");
  $("#clVoicing").innerHTML = VOICINGS.map((v) => `<option value="${v.id}" title="${esc(v.hint)}">${esc(v.label)}</option>`).join("");
  $("#clInversion").innerHTML = ["Root position", "1st", "2nd", "3rd"].map((t, i) => `<option value="${i}">${esc(t)}</option>`).join("");
  $("#clRegister").innerHTML = [-3, -2, -1, 0, 1, 2, 3]
    .map((o) => `<option value="${o}">${o === 0 ? "As written" : `${o > 0 ? "+" : ""}${o} oct`}</option>`)
    .join("");
}

/**
 * Draw the honeycomb, sized to the scale.
 *
 * The cell count changes with the scale - five for a pentatonic, eight for a diminished - so the
 * viewBox is computed from it rather than fixed. The SVG then scales to whatever width the panel
 * has, which is what keeps the cells big enough to hit on a narrow screen.
 */
function drawHoneycomb(h) {
  const CELL = 96;
  const PAD = 6;
  const count = Math.max(1, SCALES[h.mode].count);
  const { width, height } = honeycombSize(count, CELL);
  const svg = $("#clHoneycomb");
  svg.setAttribute("viewBox", `0 0 ${(width + PAD * 2).toFixed(1)} ${(height + PAD * 2).toFixed(1)}`);
  svg.innerHTML = honeycombSvg(h.keyPosition, h.mode, {
    width: CELL,
    pad: PAD,
    preferFlats: h.preferFlats,
    selected: stepChord(loop.pattern, lab.selected)?.degree ?? null,
    // The selected chord itself, so its own cell can carry the inversion edges and octave discs
    // and show where they stand. Null when nothing is selected, and then no cell has controls:
    // an edge with no chord to act on would be a control that does nothing.
    chord: stepChord(loop.pattern, lab.selected),
  });
}

function drawChordLab() {
  const h = harmonyOf();
  $("#clKey").value = String(h.keyPosition);
  $("#clMode").value = String(h.mode);
  $("#clSpelling").value = h.preferFlats == null ? "key" : h.preferFlats ? "flats" : "sharps";
  $("#clKeySig").textContent = h.mode === MODE_MAJOR ? keySignature(h.keyPosition) : SCALES[h.mode].name;
  drawHoneycomb(h);

  const progression = progressionChords(loop.pattern);
  $("#clProgression").innerHTML = progression.length
    ? progression
        .map(
          ({ step, chord: c }) => `<span class="chl-chip${step === lab.selected ? " sel" : ""}">
            <button class="chl-pick" data-i="${step}" title="Edit and hear ${esc(labelFor(c))}, on step ${step + 1}">${esc(labelFor(c))}<em>${esc(degreeNumeral(c.degree))}</em></button>
            <button class="chl-drop" data-drop="${step}" aria-label="Remove ${esc(labelFor(c))}" title="Remove ${esc(labelFor(c))} from step ${step + 1}">&times;</button>
          </span>`,
        )
        .join("")
    : `<p class="chl-empty">No chords yet. Click a hexagon above.</p>`;
  $("#clProgNote").textContent = progression.length ? `${progression.length} of ${MAX_CHORDS}` : "—";

  const chord = stepChord(loop.pattern, lab.selected);
  $("#clEditorBlock").hidden = !chord;
  if (chord) {
    $("#clChordName").textContent = labelFor(chord);
    $("#clQuality").value = String(chord.quality);
    $("#clVoicing").value = String(chord.voicing);
    $("#clInversion").value = String(chord.inversion);
    $("#clRegister").value = String(chord.registerOctaves);
    $("#clNotes").textContent = `${notesOf(chord).map(noteName).join("  ")}`;
  }
  drawChordLane();
}

// ---- the honeycomb
//
// A cell's body adds that degree to the progression and plays it. The selected chord's cell also
// carries controls on four of its edges and two discs, and those are checked first: an edge sits
// inside the body, so a click that lands on one must not also add a chord.
$("#clHoneycomb").addEventListener("click", (e) => {
  const control = e.target.closest?.("[data-control]");
  if (control) return useCellControl(control);
  addFromHoneycomb(e.target.closest("[data-degree]"));
});
// The cells and their controls are SVG groups with a button role, so Enter and Space are not free.
$("#clHoneycomb").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const control = e.target.closest?.("[data-control]");
  const seg = control ? null : e.target.closest?.("[data-degree]");
  if (!control && !seg) return;
  e.preventDefault();
  e.stopPropagation(); // Space is also the transport; on a chord it means this chord.
  if (control) useCellControl(control);
  else addFromHoneycomb(seg);
});

/**
 * An inversion edge or an octave disc on the selected chord's cell.
 *
 * They edit the selected chord and nothing else, which is what the panel beside the honeycomb
 * does too: it is a second view of these two fields rather than a competing one, and both read
 * the chord back after every change, so the two cannot disagree.
 */
function useCellControl(el) {
  const chord = stepChord(loop.pattern, lab.selected);
  if (!chord) return;
  const value = Number(el.dataset.value);
  if (el.dataset.control === "inversion") {
    editSelected((c) => (c.inversion = value));
  } else {
    const next = Math.min(3, Math.max(-3, chord.registerOctaves + value));
    if (next === chord.registerOctaves) return; // already as far as it goes
    editSelected((c) => (c.registerOctaves = next));
  }
  // Put keyboard focus back on the control that moved: redrawing has just replaced the element
  // it was on, and a control that loses focus when you use it cannot be used twice.
  $(`#clHoneycomb [data-control="${el.dataset.control}"][data-value="${el.dataset.value}"]`)?.focus();
}

function addFromHoneycomb(seg) {
  if (!seg) return;
  addChord({ ...defaultChord(), degree: +seg.dataset.degree });
}

/**
 * Put a chord on the next free step and select it. A chord that is not on a step cannot be heard,
 * which is what made the honeycomb look broken: you clicked four chords, pressed play, and the
 * loop played whatever it played before.
 */
function addChord(chord) {
  const wasEmpty = loop.pattern.steps.map((s) => s.chord == null);
  const placed = placeChord(loop.pattern, chord);
  if (placed === loop.pattern) {
    $("#clProgNote").textContent =
      progressionChords(loop.pattern).length >= MAX_CHORDS ? `full at ${MAX_CHORDS}` : "no free step";
    return;
  }
  // The step it landed on is the one that was empty before and is not now.
  lab.selected = placed.steps.findIndex((s, i) => wasEmpty[i] && s.chord != null);
  loop.pattern = sanitizePattern(placed);
  $("#loopPreset").value = "";
  pushPattern();
  drawChordLab();
  drawRoll();
  auditionSelected();
}

$("#clProgression").addEventListener("click", (e) => {
  const drop = e.target.closest("[data-drop]");
  if (drop) {
    // The chord lives on its step, so removing it is a local edit: no list to renumber and no
    // other step to disturb.
    removeChordAt(+drop.dataset.drop);
    return;
  }
  const pick = e.target.closest("[data-i]");
  if (!pick) return;
  lab.selected = +pick.dataset.i;
  drawChordLab();
  auditionSelected();
});

function removeChordAt(step) {
  if (stepChord(loop.pattern, step) == null) return;
  editPattern((pat) => {
    pat.steps[step].chord = null;
    if (lab.selected === step) lab.selected = null;
  });
  drawChordLab();
}

const editSelected = (change) => {
  if (lab.selected == null) return;
  editStepChord(lab.selected, change);
  auditionSelected();
};
$("#clQuality").onchange = (e) => editSelected((c) => (c.quality = +e.target.value));
$("#clVoicing").onchange = (e) => editSelected((c) => (c.voicing = +e.target.value));
$("#clInversion").onchange = (e) => editSelected((c) => (c.inversion = +e.target.value));
$("#clRegister").onchange = (e) => editSelected((c) => (c.registerOctaves = +e.target.value));
$("#clKey").onchange = (e) => editHarmony((h) => (h.keyPosition = +e.target.value));
$("#clMode").onchange = (e) => editHarmony((h) => (h.mode = +e.target.value));
$("#clSpelling").onchange = (e) =>
  editHarmony((h) => (h.preferFlats = e.target.value === "key" ? null : e.target.value === "flats"));

/** Play the selected chord once, so an edit is heard as it is made. */
async function auditionSelected() {
  const chord = stepChord(loop.pattern, lab.selected);
  if (!chord || loop.playing) return;
  const notes = notesOf(chord);
  try {
    await ensureAudio();
    for (const n of notes) noteOn(n, +$("#velocity").value);
    setTimeout(() => notes.forEach(noteOff), 900);
  } catch {
    // Audio unavailable; the chord is still written down and will play when the loop runs.
  }
}

// ---- the chord row: click a step to move it through the progression and back to none
// The chord row: click an empty step to repeat the selected chord there, click another step's
// chord to select it, and click the selected one again to take it off. Repeating puts a *copy* on
// the step, so the two can be voiced differently afterwards - they are two chords that match, not
// one chord heard twice.
$("#chordLane").addEventListener("click", (e) => {
  const b = e.target.closest(".cstep");
  if (!b) return;
  const i = +b.dataset.i;
  const here = stepChord(loop.pattern, i);
  if (here == null) {
    const source = stepChord(loop.pattern, lab.selected) ?? { ...defaultChord() };
    placeChordOn(i, source);
    return;
  }
  if (lab.selected !== i) {
    lab.selected = i;
    drawChordLab();
    auditionSelected();
    return;
  }
  removeChordAt(i);
});

/** Put a copy of a chord on one named step. */
function placeChordOn(step, chord) {
  if (progressionChords(loop.pattern).length >= MAX_CHORDS) {
    $("#clProgNote").textContent = `full at ${MAX_CHORDS}`;
    return;
  }
  editPattern((pat) => {
    pat.steps[step].chord = { ...chord };
    pat.steps[step].tie = false;
    lab.selected = step;
  });
  drawChordLab();
  auditionSelected();
}

// ---- the measurement, which is the reason this is in a patch designer at all
$("#clMeasure").onclick = () => measureProgression();

function measureProgression() {
  const voice = currentVoice();
  const progression = progressionChords(loop.pattern);
  if (!voice || !progression.length || lab.measuring) return;
  lab.measuring = true;
  $("#clMeasure").disabled = true;
  $("#clMeasure").textContent = "Measuring…";
  // Rendering four to six notes per chord takes a moment; yield first so the button repaints.
  setTimeout(async () => {
    try {
      const { chordPeak } = await import("./features.js");
      const rows = progression.map(({ chord: c }) => ({ label: labelFor(c), notes: notesOf(c), ...chordPeak(voice, notesOf(c)) }));
      const single = chordPeak(voice, [60]);
      $("#clMeasureTable").innerHTML =
        `<tr><th>Chord</th><th>Notes</th><th>Peak</th><th>Stacking</th></tr>` +
        rows
          .map(
            (r) => `<tr class="${r.clips ? "clips" : ""}">
              <td>${esc(r.label)}</td>
              <td class="chl-num">${r.notes.length}</td>
              <td class="chl-num">${r.peakDb.toFixed(1)} dB</td>
              <td class="chl-num">+${r.stackingDb.toFixed(1)} dB</td></tr>`,
          )
          .join("");
      const worst = rows.reduce((a, b) => (b.peak > a.peak ? b : a));
      $("#clMeasureNote").textContent = worst.clips
        ? `${worst.label} clips: the mix reaches ${worst.peakDb.toFixed(1)} dB, where 0 dB is where SpaceAge and Dexed clip. Try a wider voicing, a lower register, or bring the patch down.`
        : `Loudest is ${worst.label} at ${worst.peakDb.toFixed(1)} dB, ${Math.abs(worst.peakDb).toFixed(1)} dB of headroom. One note alone peaks at ${single.peakDb.toFixed(1)} dB.`;
    } catch (err) {
      $("#clMeasureNote").textContent = `Could not measure: ${err.message || err}`;
    } finally {
      lab.measuring = false;
      $("#clMeasure").disabled = false;
      $("#clMeasure").textContent = "Measure progression";
    }
  }, 0);
}

$("#chordLabToggle").onclick = () => {
  const panel = $("#chordLab");
  panel.hidden = !panel.hidden;
  $("#chordLabToggle").setAttribute("aria-expanded", String(!panel.hidden));
  $("#chordLabToggle").classList.toggle("on", !panel.hidden);
  if (!panel.hidden) drawChordLab();
};

// ---------------------------------------------------------------- the tutorial
// A guided tour that runs on the real Chord Lab rather than on a picture of it, so it cannot
// drift out of date and so each step can be *heard*. The steps are data in tutorial.js; this is
// the api they drive and the callout that shows them.
//
// The tour borrows the loop and gives it back: the pattern is snapshotted when it starts and
// restored exactly when it ends, however it ends, so a progression you were part way through
// survives being shown around.
const tour = { at: -1, saved: null, selected: null };

/** What a tutorial step is allowed to do. The steps name intent; this carries it out. */
const tourApi = {
  setKey: (position) => editHarmony((h) => (h.keyPosition = position)),
  setScale: (name) => {
    const mode = scaleModeNamed(name);
    if (mode >= 0) editHarmony((h) => (h.mode = mode));
  },
  setSpelling: (how) => editHarmony((h) => (h.preferFlats = how === "key" ? null : how === "flats")),
  clearChords: () => {
    lab.selected = null;
    editPattern((p) => p.steps.forEach((s) => (s.chord = null)));
    drawChordLab();
  },
  addChord: (degree, quality = 0) => addChord({ ...defaultChord(), degree, quality }),
  selectNth: (n) => {
    const at = progressionChords(loop.pattern)[n];
    if (!at) return;
    lab.selected = at.step;
    drawChordLab();
  },
  editChord: (patch) => editSelected((c) => Object.assign(c, patch)),
  measure: () => measureProgression(),
};

function startTour() {
  if (tour.at >= 0) return;
  tour.saved = JSON.parse(JSON.stringify(loop.pattern));
  tour.selected = lab.selected;
  $("#chordLab").hidden = false;
  $("#chordLabToggle").setAttribute("aria-expanded", "true");
  $("#chordLabToggle").classList.add("on");
  $("#tourCallout").hidden = false;
  $("#tutorialOpen").setAttribute("aria-expanded", "true");
  showTourStep(0);
}

function endTour() {
  if (tour.at < 0) return;
  clearTourTarget();
  tour.at = -1;
  $("#tourCallout").hidden = true;
  $("#tutorialOpen").setAttribute("aria-expanded", "false");
  // Give the loop back exactly as it was found.
  if (tour.saved) {
    loop.pattern = sanitizePattern(tour.saved);
    lab.selected = tour.selected;
    tour.saved = null;
    pushPattern();
    drawChordLab();
    drawRoll();
  }
  $("#tutorialOpen").focus();
}

const clearTourTarget = () => document.querySelectorAll(".tour-target").forEach((el) => el.classList.remove("tour-target"));

function showTourStep(index) {
  const step = TUTORIAL_STEPS[index];
  if (!step) return endTour();
  tour.at = index;
  try {
    step.run?.(tourApi);
  } catch (err) {
    console.warn("A tutorial step could not run.", err);
  }
  clearTourTarget();
  const target = step.target ? $(step.target) : null;
  target?.classList.add("tour-target");

  $("#tourStepOf").textContent = `${index + 1} / ${TUTORIAL_STEPS.length}`;
  $("#tourTitle").textContent = step.title;
  $("#tourBody").textContent = step.body;
  $("#tourBack").disabled = index === 0;
  $("#tourNext").textContent = index === TUTORIAL_STEPS.length - 1 ? "Done" : "Next";
  target?.scrollIntoView({ block: "center", behavior: "smooth" });
  $("#tourCallout").focus();
}

$("#tutorialOpen").onclick = () => (tour.at >= 0 ? endTour() : startTour());
$("#tourNext").onclick = () => showTourStep(tour.at + 1);
$("#tourBack").onclick = () => showTourStep(tour.at - 1);
$("#tourClose").onclick = () => endTour();
addEventListener("keydown", (e) => {
  if (tour.at < 0) return;
  if (e.key === "Escape") (e.preventDefault(), endTour());
  else if (e.key === "ArrowRight") (e.preventDefault(), showTourStep(tour.at + 1));
  else if (e.key === "ArrowLeft" && tour.at > 0) (e.preventDefault(), showTourStep(tour.at - 1));
});

// ---------------------------------------------------------------- downloads
function download(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const namedVoice = () => ({ ...current().voice, name: patchName() });
// The file is named after the title, so what you called it and what is inside it agree.
const stem = () => patchTitle().trim().replace(/[^\w .-]+/g, "").replace(/ +/g, "_") || "FORGE";

// Writing the progression out as a file. Deliberately not behind the MIDI connect: this needs no
// device at all, and hiding it until one appears would make it invisible to anyone without
// hardware, which is most people opening a web page.
$("#midiExport").onclick = () => {
  const bytes = progressionMidiFile(loop.pattern, { name: patchTitle().trim() || "OWL chord progression" });
  if (!bytes) {
    $("#midiStatus").textContent = "No chords to export yet - add some in Chord Lab first.";
    return;
  }
  download(bytes, stem() + "_chords.mid", "audio/midi");
  const chords = progressionChords(loop.pattern).length;
  $("#midiStatus").textContent = `Exported ${chords} chord${chords === 1 ? "" : "s"} at ${loop.pattern.bpm} BPM.`;
};

$("#nativeDownload").onclick = async () => {
  if (!current()) return;
  // The title travels inside the patch, so renaming the file cannot leave the two disagreeing.
  download(await ssynthFile(namedVoice(), patchTitle()), stem() + ".ssynth", "application/json");
};
$("#singleDownload").onclick = () => current() && download(singleVoiceSysex(namedVoice()), stem() + ".syx");
$("#download").onclick = () => {
  if (!current()) return;
  // Slot 1 is the voice on screen; the rest are the other candidates and variations on them.
  const others = state.response.results.map((r, i) => ({ voice: (state.edits[i]?.result || r).voice })).filter((_, i) => i !== state.selected);
  const voices = cartridgeVoices([{ voice: namedVoice() }, ...others]);
  download(cartridgeSysex(voices), stem() + "_cartridge.syx");
};

// ---------------------------------------------------------------- cartridges
// "Opened" is the file the user loaded; it is only ever read. "My cartridge" is a separate
// 32-slot bank the user stores edited voices into and downloads. It persists in this browser.
const WORKING_KEY = "owl.workingCartridge";
const blankVoice = () => ({ ...defaultVoice(), name: "INIT VOICE" });
const cart = { opened: null, working: loadWorking() };

function loadWorking() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKING_KEY));
    if (saved?.voices?.length === 32) return { name: saved.name || "MY CARTRIDGE", voices: saved.voices.map(sanitizeVoice), used: saved.used || [] };
  } catch {
    // Unavailable or corrupt storage: start with an empty cartridge.
  }
  return { name: "MY CARTRIDGE", voices: Array.from({ length: 32 }, blankVoice), used: [] };
}
function saveWorking() {
  try {
    localStorage.setItem(WORKING_KEY, JSON.stringify(cart.working));
  } catch {
    // Storage full or blocked; the cartridge still works for this session.
  }
}

function slotButtons(voices, kind, used = null) {
  return voices
    .map((v, i) => {
      const empty = used && !used.includes(i);
      return `<button class="slot ${empty ? "empty" : ""}" data-kind="${kind}" data-i="${i}" title="${empty ? "Empty slot" : "Edit this voice"}"><i>${i + 1}</i>${esc(empty ? "—" : v.name)}</button>`;
    })
    .join("");
}
function drawCarts() {
  const o = cart.opened;
  $("#openedTitle").textContent = o ? `${o.fileName} · ${o.voices.length} voice${o.voices.length === 1 ? "" : "s"}` : "Opened file";
  $("#openedList").innerHTML = o ? slotButtons(o.voices, "opened") : '<p class="slot-empty">Nothing opened yet.</p>';
  $("#workingName").value = cart.working.name;
  $("#workingList").innerHTML = slotButtons(cart.working.voices, "working", cart.working.used);
  const firstEmpty = [...Array(32).keys()].find((i) => !cart.working.used.includes(i)) ?? 0;
  const keep = +($("#storeSlot").value || firstEmpty);
  $("#storeSlot").innerHTML = cart.working.voices
    .map((v, i) => `<option value="${i}" ${i === (cart.working.used.includes(keep) ? firstEmpty : keep) ? "selected" : ""}>slot ${i + 1}${cart.working.used.includes(i) ? " · " + esc(v.name) : " · empty"}</option>`)
    .join("");
}

/** Make a voice from a file the starting voice for editing. */
function editVoice(voice, label) {
  if (state.view === "classic") {
    // The classic editor takes the voice as it is; there is nothing to measure or search.
    ensureClassic().setVoice(sanitizeVoice(voice));
    setNames(classic.voice.name);
    state.manual = manualResult(classic.voice);
    showManual();
    $("#cartStatus").textContent = `Editing ${label} by hand. The file itself is never changed.`;
    return;
  }
  state.loading = label;
  state.request++;
  setBusy(true, "LOADING + MEASURING…");
  worker.postMessage({ type: "load", id: state.request, entry: { id: "file-" + state.request, voice: sanitizeVoice(voice) } });
}

$("#openFile").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let voices, note = "";
    if (/\.ssynth$/i.test(file.name) || bytes[0] === 0x7b) {
      voices = [parseSsynth(new TextDecoder().decode(bytes))];
    } else {
      const r = readDx7File(bytes);
      voices = r.voices;
      if (r.checksumErrors) note = ` (${r.checksumErrors} checksum warning${r.checksumErrors > 1 ? "s" : ""}; voices loaded anyway)`;
    }
    cart.opened = { fileName: file.name, voices };
    drawCarts();
    $("#cartStatus").textContent = `Opened ${file.name}${note}. Pick a voice to edit it.`;
    if (voices.length === 1) editVoice(voices[0], file.name);
  } catch (err) {
    $("#cartStatus").textContent = `Could not read ${file.name}: ${err.message || err}`;
  }
};

document.querySelector(".cart-cols").addEventListener("click", (e) => {
  const b = e.target.closest(".slot");
  if (!b || b.classList.contains("empty")) return;
  const i = +b.dataset.i;
  if (b.dataset.kind === "opened") editVoice(cart.opened.voices[i], `${cart.opened.fileName}, voice ${i + 1}`);
  else editVoice(cart.working.voices[i], `${cart.working.name}, slot ${i + 1}`);
});

$("#storeVoice").onclick = () => {
  if (!current()) return;
  const slot = +$("#storeSlot").value;
  cart.working.voices[slot] = namedVoice();
  if (!cart.working.used.includes(slot)) cart.working.used.push(slot);
  saveWorking();
  drawCarts();
  $("#cartStatus").textContent = `Stored ${patchName().trim()} in slot ${slot + 1} of ${cart.working.name}.`;
};
$("#workingName").oninput = (e) => {
  cart.working.name = e.target.value.trim() || "MY CARTRIDGE";
  saveWorking();
};
$("#downloadWorking").onclick = () => {
  const file = cart.working.name.replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "_") || "MY_CARTRIDGE";
  download(cartridgeSysex(cart.working.voices), file + ".syx");
};
$("#clearWorking").onclick = () => {
  if (!confirm(`Clear all 32 slots of ${cart.working.name}? Download it first if you want to keep it.`)) return;
  cart.working = { name: cart.working.name, voices: Array.from({ length: 32 }, blankVoice), used: [] };
  saveWorking();
  drawCarts();
};
drawCarts();

// ---------------------------------------------------------------- MIDI in and out
// Playing in: notes and velocity go straight to the preview, so a controller plays whatever
// is on screen while it is being edited. A dump sent from the instrument is read straight in.
const midi = new MidiLink(drawMidi, {
  note: async ({ note, velocity, on }) => {
    if (!on) return noteOff(note);
    await noteOn(note, velocity);
  },
  panic: () => {
    audio?.send({ type: "panic" });
    document.querySelectorAll(".key.down").forEach((k) => k.classList.remove("down"));
  },
  voices: ({ voices, source }) => {
    if (voices.length === 1) {
      editVoice(voices[0], "a voice from " + source);
      $("#midiStatus").textContent = `Received ${voices[0].name.trim() || "a voice"} from ${source}`;
      return;
    }
    // A whole cartridge goes into the opened column, where any voice can be picked to edit.
    cart.opened = { fileName: `${source} dump`, voices };
    drawCarts();
    $("#cartStatus").textContent = `Received ${voices.length} voices from ${source}. Pick one to edit it.`;
    $("#midiStatus").textContent = `Received ${voices.length} voices from ${source}`;
  },
});
function drawMidi() {
  const connected = !!midi.access;
  $("#midiConnect").hidden = connected;
  document.querySelectorAll(".midi-field, #midiSend").forEach((el) => (el.hidden = !connected));
  if (!midi.supported) {
    $("#midiConnect").disabled = true;
    $("#midiStatus").textContent = "This browser has no Web MIDI (try Chrome or Edge)";
    return;
  }
  if (!connected) return;
  const outs = midi.outputs();
  const chosen = midi.output();
  $("#midiOutput").innerHTML = outs.length
    ? outs.map((o) => `<option value="${esc(o.id)}" ${o === chosen ? "selected" : ""}>${esc(o.name)}</option>`).join("")
    : "<option>No MIDI outputs found</option>";
  $("#midiSend").disabled = !chosen;
  const ins = midi.inputs();
  $("#midiInput").innerHTML =
    `<option value="all" ${midi.inputId === "all" ? "selected" : ""}>Any input</option>` +
    ins.map((i) => `<option value="${esc(i.id)}" ${i.id === midi.inputId ? "selected" : ""}>${esc(i.name)}</option>`).join("");
  $("#midiListen").checked = midi.listen;
  const playing = midi.listening().length;
  $("#midiStatus").textContent = chosen
    ? `Ready: ${chosen.name}` + (playing ? ` · playing from ${playing} input${playing === 1 ? "" : "s"}` : "")
    : ins.length
    ? `Playing from ${playing || "no"} input${playing === 1 ? "" : "s"} · no output chosen`
    : "Connect a synth or start Dexed, then it will appear here";
}
$("#midiChannel").innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i}" ${i === midi.channel ? "selected" : ""}>${i + 1}</option>`).join("");
$("#midiAuto").checked = midi.auto;

function sendToSynth(quiet = false) {
  if (!current()) return;
  try {
    const name = midi.send(namedVoice());
    $("#midiStatus").textContent = `Sent ${patchName().trim()} to ${name}`;
  } catch (err) {
    if (!quiet) $("#midiStatus").textContent = String(err.message || err);
  }
}
$("#midiConnect").onclick = async () => {
  try {
    await midi.connect();
  } catch (err) {
    $("#midiStatus").textContent = err?.name === "SecurityError" || err?.name === "NotAllowedError" ? "MIDI access was not allowed" : String(err.message || err);
  }
};
$("#midiOutput").onchange = (e) => (midi.set({ outputId: e.target.value }), drawMidi());
$("#midiChannel").onchange = (e) => midi.set({ channel: +e.target.value });
$("#midiAuto").onchange = (e) => {
  midi.set({ auto: e.target.checked });
  if (e.target.checked) sendToSynth();
};
$("#midiSend").onclick = () => sendToSynth();
$("#midiInput").onchange = (e) => (midi.set({ inputId: e.target.value }), drawMidi());
$("#midiListen").onchange = (e) => (midi.set({ listen: e.target.checked }), drawMidi());
$("#midiPanic").onclick = () => {
  midi.releaseAll();
  setLoopPlaying(false);
  $("#midiStatus").textContent = "All notes off";
};
drawMidi();

// ---------------------------------------------------------------- wiring
$("#generate").onclick = () => forge(true);
$("#seed").oninput = (e) => ($("#seedOut").value = e.target.value);
$("#seed").onchange = () => forge();
$("#patchTitle").oninput = () => {
  syncNames($("#patchTitle").value);
  updateFileName();
};
$("#patchName").oninput = (e) => {
  // Once the DX7 name is typed into, it stops following the title.
  e.target.dataset.edited = e.target.value.trim() ? "1" : "";
};
$("#prompt").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) forge(true);
});
document.querySelectorAll("[data-prompt]").forEach((b) => (b.onclick = () => (($("#prompt").value = b.dataset.prompt), forge())));
buildKeyboard();
buildTabs();
drawVolume();
drawReverb();
drawLoopControls();
drawChordLabControls();
drawChordLab();
drawRoll();
forge();
