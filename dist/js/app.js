import { ALGORITHMS, operatorRoles, opRatio, opFixedHz, cleanName, singleVoiceSysex, cartridgeSysex, readDx7File, defaultVoice, sanitizeVoice } from "./dx7.js";
import { ssynthFile, parseSsynth } from "./ssynth.js";
import { CONTROLS, GROUPS, neutralSliders } from "./controls.js";
import { cartridgeVoices } from "./designer.js";
import { MidiLink } from "./midi.js";
import { algorithmSvg } from "./algorithm-chart.js";

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
  // Drawn like the DX7 front-panel chart: cream boxes and lines, carriers on the output bus.
  const css = getComputedStyle(document.documentElement);
  const tok = (name) => css.getPropertyValue(name).trim();
  const alg = ALGORITHMS[v.algorithm];
  const silent = new Set(v.ops.map((o, i) => (o.level ? 0 : i + 1)).filter(Boolean));
  $("#algoSvg").innerHTML = algorithmSvg(v.algorithm, alg.edges, alg.carriers, {
    width: 440,
    height: 170,
    silent,
    colors: { box: tok("--text"), text: tok("--black"), line: tok("--text"), dim: tok("--line") },
  });
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
forge();
