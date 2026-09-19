import { ALGORITHMS, operatorRoles, opRatio, opFixedHz, cleanName, singleVoiceSysex, cartridgeSysex } from "./dx7.js";
import { ssynthFile } from "./ssynth.js";
import { CONTROLS, GROUPS, neutralSliders } from "./controls.js";
import { cartridgeVoices } from "./designer.js";
import { MidiLink } from "./midi.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// response: the last design. edits[i]: the slider-edited version of candidate i, if any.
const state = { response: null, selected: 0, request: 0, lastSignature: "", generatedName: "", variation: 42, edits: {}, group: GROUPS[0] };
const original = () => state.response?.results[state.selected];
const current = () => state.edits[state.selected]?.result || original();
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
  $("#statusText").textContent = busy ? label : "DX7 VOICE ENGINE";
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
  $("#interpretNote").textContent = cues.length
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
  const css = getComputedStyle(document.documentElement);
  const tok = (name) => css.getPropertyValue(name).trim();
  const alg = ALGORITHMS[v.algorithm];
  const roles = operatorRoles(v.algorithm);
  // Tree layout: each modulator hangs under its lowest-numbered target.
  const parent = {};
  for (const [from, to] of alg.edges) if (!(from in parent) || to < parent[from]) parent[from] = to;
  const children = (op) => Object.keys(parent).map(Number).filter((m) => parent[m] === op).sort((a, b) => a - b);
  const x = {};
  let col = 0;
  const place = (op) => {
    const kids = children(op);
    kids.forEach(place);
    x[op] = kids.length ? kids.reduce((s, k) => s + x[k], 0) / kids.length : col++;
  };
  alg.carriers.forEach(place);
  const maxDepth = Math.max(...roles.map((r) => r.depth));
  const span = Math.max(1, col - 1);
  const px = (op) => (col === 1 ? 220 : 50 + (x[op] / span) * 340);
  const py = (op) => 138 - roles[op - 1].depth * Math.min(56, 116 / Math.max(1, maxDepth));
  let lines = "";
  for (const [from, to] of alg.edges)
    lines += `<line x1="${px(from)}" y1="${py(from) + 16}" x2="${px(to)}" y2="${py(to) - 16}" stroke="${tok("--line")}" stroke-width="2"/>`;
  const fb = alg.fb;
  lines += `<path d="M${px(fb) + 16} ${py(fb)} h12 v-24 h-28 v8" fill="none" stroke="${tok("--blue")}" stroke-width="1.5"/>`;
  lines += `<line x1="30" y1="162" x2="410" y2="162" stroke="${tok("--line")}"/>`;
  for (const c of alg.carriers) lines += `<line x1="${px(c)}" y1="${py(c) + 16}" x2="${px(c)}" y2="162" stroke="${tok("--orange")}" stroke-width="2"/>`;
  let nodes = "";
  for (let op = 1; op <= 6; op++) {
    const carrier = roles[op - 1].carrier;
    const color = v.ops[op - 1].level ? (carrier ? tok("--orange-text") : tok("--label")) : tok("--line");
    nodes += `<circle cx="${px(op)}" cy="${py(op)}" r="16" fill="${tok("--black")}" stroke="${color}"/><text x="${px(op)}" y="${py(op) + 4}" text-anchor="middle" fill="${color}" font-family="DM Mono" font-size="11">${op}</text>`;
  }
  $("#algoSvg").innerHTML = lines + nodes;
}

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
let octave = 4;
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
      node.connect(ctx.destination);
      audio = { ctx, send: (m) => node.port.postMessage(m), mode: "worklet" };
    } catch (err) {
      console.warn("Audio worklet failed to load; using the main-thread preview instead.", err);
      const { PreviewEngine } = await import("./preview-engine.js");
      const engine = new PreviewEngine(ctx.sampleRate);
      const node = ctx.createScriptProcessor(1024, 0, 2);
      node.onaudioprocess = (e) => engine.render([e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1)]);
      node.connect(ctx.destination);
      audio = { ctx, send: (m) => engine.message(m), mode: "main-thread", node };
    }
    sendVoice();
    return audio;
  })();
  audioSetup.catch(() => (audioSetup = null));
  return audioSetup;
}
function sendVoice() {
  const r = current();
  if (audio && r) audio.send({ type: "voice", voice: r.voice });
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
$("#octDown").onclick = () => ((octave = Math.max(1, octave - 1)), buildKeyboard());
$("#octUp").onclick = () => ((octave = Math.min(7, octave + 1)), buildKeyboard());

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
forge();
