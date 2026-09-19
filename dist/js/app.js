import { ALGORITHMS, operatorRoles, opRatio, opFixedHz, cleanName, singleVoiceSysex, cartridgeSysex, readDx7File, defaultVoice, sanitizeVoice } from "./dx7.js";
import { ssynthFile, parseSsynth } from "./ssynth.js";
import { CONTROLS, GROUPS, neutralSliders } from "./controls.js";
import { cartridgeVoices } from "./designer.js";
import { MidiLink } from "./midi.js";
import { algorithmSvg, CHART_HEIGHT, chartHeight, ALGORITHM_LAYOUT } from "./algorithm-chart.js";
import { interchangeableWith } from "./layers.js";
import { createClassicEditor } from "./classic.js";
import { defaultPattern, sanitizePattern, shiftPattern, PRESETS, DIVISIONS, CHORDS, presetById } from "./pattern.js";
import { defaultReverb, sanitizeReverb, impulseResponse, REVERB_PRESETS, presetById as verbPreset } from "./reverb.js";
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
    $("#patchName").value = data.result.name;
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

function drawSliders() {
  const focusId = document.activeElement?.dataset?.id;
  const values = sliders();
  const desc = original()?.sliders || neutralSliders();
  const counts = Object.fromEntries(GROUPS.map((g) => [g, CONTROLS.filter((c) => c.group === g && Math.abs(values[c.id]) > 0.005).length]));
  document.querySelectorAll("#groupTabs [data-group]").forEach((b) => (b.dataset.count = counts[b.dataset.group] || ""));
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
  const edited = !!state.edits[state.selected];
  if (focusId) $(`#s-${focusId}`)?.focus();
  $("#shaperStatus").textContent = edited ? "edited · double-click resets a slider" : "0 = starting voice";
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
  if (state.dragging) (state.dragging = false), drawSliders();
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
function patchName() {
  return cleanName($("#patchName").value.trim() || current()?.name || "FORGE");
}

function show() {
  if (state.manual) return showManual();
  const r = current();
  const { intent, results } = state.response;
  const nameField = $("#patchName");
  if (!nameField.value || nameField.value === state.generatedName) nameField.value = r.name;
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
  $("#fileName").textContent = patchName().trim().replace(/\s+/g, "_") + ".ssynth";
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
function sendVoice() {
  // In the classic editor what you hear also reflects muted operators and compare.
  const voice = state.manual ? classic.previewVoice : current()?.voice;
  if (audio && voice) audio.send({ type: "voice", voice });
}
async function noteOn(note) {
  try {
    const a = await ensureAudio();
    if (a.ctx.state !== "running") await a.ctx.resume();
    a.send({ type: "on", note, velocity: +$("#velocity").value });
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
    $("#loopHint").textContent = "The pattern cannot move any further without running off the keyboard.";
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
  drawRoll();
}
$("#octDown").onclick = () => shiftOctave(-1);
$("#octUp").onclick = () => shiftOctave(1);

// ---------------------------------------------------------------- monitoring reverb
// Listening equipment only: it sits after the engine, so nothing it does reaches a patch
// file, a MIDI dump or the measurements, and the clip meter still reads the dry signal.
const VERB_KEY = "owl.reverb";
const verb = { settings: loadReverb(), nodes: null };

function loadReverb() {
  try {
    return sanitizeReverb(JSON.parse(localStorage.getItem(VERB_KEY)) || undefined);
  } catch {
    return defaultReverb();
  }
}
function saveReverb() {
  try {
    localStorage.setItem(VERB_KEY, JSON.stringify(verb.settings));
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
  source.connect(dry).connect(ctx.destination);
  source.connect(predelay).connect(convolver).connect(wet).connect(ctx.destination);
  verb.nodes = { ctx, dry, wet, predelay, convolver };
  applyReverb();
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
  $("#loopChord").innerHTML = CHORDS.map((c) => `<option value="${c.id}" ${c.id === p.chord ? "selected" : ""}>${esc(c.label)}</option>`).join("");
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
  $("#velLane").innerHTML = p.steps
    .map(
      (s, i) =>
        `<div class="vbar${s.note == null ? " rest" : ""}${i === loop.head ? " head" : ""}" data-i="${i}" role="slider" tabindex="0"
        aria-label="Step ${i + 1} velocity" aria-valuemin="1" aria-valuemax="127" aria-valuenow="${s.vel}" title="Velocity ${s.vel}"><b style="height:${(s.vel / 127) * 100}%"></b></div>`,
    )
    .join("");
  $("#tieLane").innerHTML = p.steps
    .map((s, i) => `<button class="tie${s.tie ? " on" : ""}" data-i="${i}" aria-pressed="${s.tie}" title="Hold the note before it through step ${i + 1}">hold</button>`)
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
  $("#loopHint").textContent = preset.hint;
  pushPattern();
  drawLoopControls();
  $("#loopPreset").value = preset.id;
  drawRoll();
};
$("#loopBpm").oninput = (e) => editPattern((p) => (p.bpm = +e.target.value || p.bpm));
$("#loopDivision").onchange = (e) => editPattern((p) => (p.division = e.target.value));
$("#loopChord").onchange = (e) => editPattern((p) => (p.chord = e.target.value));
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

// ---------------------------------------------------------------- downloads
function download(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const namedVoice = () => ({ ...current().voice, name: patchName() });
const stem = () => patchName().trim().replace(/\s+/g, "_") || "FORGE";

$("#nativeDownload").onclick = async () => {
  if (!current()) return;
  download(await ssynthFile(namedVoice(), $("#patchName").value.trim() || current().name), stem() + ".ssynth", "application/json");
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
    $("#patchName").value = classic.voice.name;
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

// ---------------------------------------------------------------- MIDI out
const midi = new MidiLink(drawMidi);
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
  $("#midiStatus").textContent = chosen ? `Ready: ${chosen.name}` : "Connect a synth or start Dexed, then it will appear here";
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
drawMidi();

// ---------------------------------------------------------------- wiring
$("#generate").onclick = () => forge(true);
$("#seed").oninput = (e) => ($("#seedOut").value = e.target.value);
$("#seed").onchange = () => forge();
$("#patchName").oninput = updateFileName;
$("#prompt").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) forge(true);
});
document.querySelectorAll("[data-prompt]").forEach((b) => (b.onclick = () => (($("#prompt").value = b.dataset.prompt), forge())));
buildKeyboard();
buildTabs();
drawReverb();
drawLoopControls();
drawRoll();
forge();
