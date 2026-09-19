// The classic editor: every DX7 parameter, in the DX7's own names and units, plus the
// panel's own gestures — operator select, operator on/off, EG copy and compare.
//
// It edits a voice object directly. Nothing here measures or searches: what you set is what
// the synth gets. The app owns the voice; this module reports every change back through
// onChange (a saved edit) and onPreview (what should be heard, which differs while an
// operator is switched off or compare is held).

import { ALGORITHMS, operatorRoles, cloneVoice, sanitizeVoice, defaultVoice, clamp } from "./dx7.js";
import { OP_PARAMS, VOICE_PARAMS, OP_GROUPS, VOICE_GROUPS, displayValue, getParam, setParam, frequencyText } from "./dx7-params.js";
import { Env, operatorOutLevel } from "./render.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const byGroup = (params, g) => params.filter((p) => p.group === g);

/**
 * Envelope shape for drawing: amplitude in dB over time, key held for `hold` seconds and
 * then released. Uses the same envelope the preview and the measurements use, so the
 * picture matches what is heard.
 */
export function envelopeShape(o, { hold = 1.5, note = 60, velocity = 100, points = 240 } = {}) {
  const sr = 44100, blockSecs = 64 / sr;
  const env = new Env(o.rates, o.levels, operatorOutLevel(o, note, velocity), 0, sr);
  const holdBlocks = Math.round(hold / blockSecs);
  const totalBlocks = Math.round(holdBlocks * 1.6);
  const step = Math.max(1, Math.round(totalBlocks / points));
  const out = [];
  for (let i = 0; i < totalBlocks; i++) {
    if (i === holdBlocks) env.release();
    const level = env.next();
    if (i % step === 0) out.push([i * blockSecs, level / 2 ** 24 - 14]);
  }
  return { points: out, releaseAt: holdBlocks * blockSecs, span: totalBlocks * blockSecs };
}

const DB_FLOOR = -72;
function envelopeSvg(o, w = 250, h = 56) {
  const { points, releaseAt, span } = envelopeShape(o);
  const y = (v) => h - 2 - ((Math.max(DB_FLOOR, v * 6.02) - DB_FLOOR) / -DB_FLOOR) * (h - 4);
  const x = (t) => (t / span) * w;
  const d = points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const rx = x(releaseAt).toFixed(1);
  return `<svg class="eg-graph" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Envelope shape">
    <line x1="${rx}" y1="0" x2="${rx}" y2="${h}" class="eg-release"/><path d="${d}" class="eg-line"/></svg>`;
}

/** One parameter row: slider, number box and the DX7's own reading of the value. */
function rowHtml(p, value, ctx, scope) {
  const id = `cl-${scope}-${p.id}`;
  const label = `<label for="${id}" title="${esc(p.name)}">${esc(p.short)}<b>${p.btn}</b></label>`;
  if (p.choices)
    return `<div class="pr pr-choice">${label}<select id="${id}" data-param="${p.id}" data-scope="${scope}">${p.choices
      .map((c, i) => `<option value="${i}" ${i === value ? "selected" : ""}>${esc(c)}</option>`)
      .join("")}</select></div>`;
  return `<div class="pr">${label}
    <input id="${id}" class="pr-range" type="range" min="${p.min}" max="${p.max}" value="${value}" data-param="${p.id}" data-scope="${scope}" aria-label="${esc(p.name)}">
    <input class="pr-num" type="number" min="${p.min}" max="${p.max}" value="${value}" data-param="${p.id}" data-scope="${scope}" aria-label="${esc(p.name)} value">
    <output data-out="${p.id}">${esc(displayValue(p, value, ctx))}</output></div>`;
}

/** EG rates and levels as the compact 4-across block the DX7's display implies. */
function egBlock(params, obj, scope) {
  const cell = (p) =>
    `<div class="eg-cell"><span title="${esc(p.name)}">${esc(p.short)}</span>
      <input class="pr-num" type="number" min="0" max="99" value="${getParam(obj, p.path)}" data-param="${p.id}" data-scope="${scope}" aria-label="${esc(p.name)}"></div>`;
  return `<div class="eg-grid">${params.map(cell).join("")}</div>`;
}

/**
 * Build the editor inside `root`.
 *   onChange(voice)  the voice was edited and should be kept
 *   onPreview(voice) what the keyboard should play right now
 */
export function createClassicEditor({ root, onChange, onPreview }) {
  const el = (s) => root.querySelector(s);
  let voice = defaultVoice();
  let stored = cloneVoice(voice); // the voice as it was when editing started, for COMPARE
  let op = 1;
  const muted = new Set();
  let comparing = false;
  const past = [];
  const future = [];

  root.innerHTML = `
    <div class="cl-bar">
      <div class="cl-gestures">
        <button id="clCompare" title="Hear the voice as it was before these edits (the DX7's edit/compare)">Compare</button>
        <button id="clUndo" title="Undo (Ctrl+Z)">Undo</button>
        <button id="clRedo" title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button id="clRevert" title="Throw away every edit since this voice was loaded">Revert</button>
        <button id="clInit" title="Start from INIT VOICE, as the DX7 does">Init voice</button>
      </div>
      <small id="clStatus"></small>
    </div>
    <div class="op-strip" id="opStrip" role="tablist" aria-label="Operator select"></div>
    <div class="cl-cols">
      <div class="cl-op" id="opDetail"></div>
      <div class="cl-voice" id="voiceDetail"></div>
    </div>`;

  const previewVoice = () => {
    const v = comparing ? stored : voice;
    if (!muted.size || comparing) return v;
    const m = cloneVoice(v);
    for (const n of muted) m.ops[n - 1].level = 0;
    return m;
  };
  const push = () => {
    past.push(cloneVoice(voice));
    if (past.length > 200) past.shift();
    future.length = 0;
  };

  /** A change that keeps the panel's layout: update values in place so typing is not interrupted. */
  function refresh() {
    for (const input of root.querySelectorAll("[data-param]")) {
      const table = input.dataset.scope === "op" ? OP_PARAMS : VOICE_PARAMS;
      const p = table.find((q) => q.id === input.dataset.param);
      const target = input.dataset.scope === "op" ? voice.ops[op - 1] : voice;
      const value = getParam(target, p.path);
      if (input !== document.activeElement && +input.value !== value) input.value = value;
      const out = input.parentElement.querySelector(`[data-out="${p.id}"]`);
      if (out) out.value = displayValue(p, value, target);
    }
    el("#opDetail").querySelector(".eg-graph")?.replaceWith(egGraphNode());
    el(".cl-op-head span").textContent = frequencyText(voice.ops[op - 1]) + (voice.ops[op - 1].mode ? "" : " ratio");
    drawStrip();
    drawBar();
  }
  function egGraphNode() {
    const wrap = document.createElement("div");
    wrap.innerHTML = envelopeSvg(voice.ops[op - 1]);
    return wrap.firstElementChild;
  }

  function drawBar() {
    el("#clCompare").classList.toggle("on", comparing);
    el("#clUndo").disabled = !past.length;
    el("#clRedo").disabled = !future.length;
    const bits = [];
    if (comparing) bits.push("comparing: hearing the stored voice");
    if (muted.size) bits.push(`OP ${[...muted].sort().join(", ")} off (preview only)`);
    bits.push(past.length ? `${past.length} edit${past.length === 1 ? "" : "s"}` : "no edits yet");
    el("#clStatus").textContent = bits.join(" · ");
  }

  function drawStrip() {
    const roles = operatorRoles(voice.algorithm);
    el("#opStrip").innerHTML = voice.ops
      .map((o, i) => {
        const n = i + 1;
        const off = muted.has(n);
        return `<div class="op-chip ${n === op ? "sel" : ""} ${off ? "muted" : ""} ${roles[i].carrier ? "carrier" : ""}">
        <button class="op-sel" data-op="${n}" role="tab" aria-selected="${n === op}"><b>OP ${n}</b><i>${roles[i].carrier ? "CARRIER" : "MOD"}</i>
          <small>${esc(frequencyText(o))} · ${o.level}</small></button>
        <button class="op-power" data-power="${n}" title="Operator ${n} ${off ? "off" : "on"} — the DX7's panel button ${n} in edit mode. Affects what you hear, never the saved voice." aria-pressed="${!off}">${off ? "OFF" : "ON"}</button>
      </div>`;
      })
      .join("");
  }

  function drawOp() {
    const o = voice.ops[op - 1];
    const others = [1, 2, 3, 4, 5, 6].filter((n) => n !== op);
    const group = (g) => {
      const ps = byGroup(OP_PARAMS, g);
      if (g === "ENVELOPE")
        return `<div class="cl-group"><h5>${g}<span class="eg-copy" title="The DX7's EG COPY: hold STORE and press the operator's number">EG copy from
          <select id="clEgCopy"><option value="">—</option>${others.map((n) => `<option value="${n}">OP ${n}</option>`).join("")}</select></span></h5>
          ${egBlock(ps.slice(0, 4), o, "op")}${egBlock(ps.slice(4), o, "op")}${envelopeSvg(o)}</div>`;
      return `<div class="cl-group"><h5>${g}</h5>${ps.map((p) => rowHtml(p, getParam(o, p.path), o, "op")).join("")}</div>`;
    };
    el("#opDetail").innerHTML =
      `<div class="cl-op-head"><strong>OPERATOR ${op}</strong><span></span></div>` + OP_GROUPS.map(group).join("");
  }

  function drawVoice() {
    const group = (g) => {
      const ps = byGroup(VOICE_PARAMS, g);
      if (g === "PITCH EG")
        return `<div class="cl-group"><h5>${g}</h5>${egBlock(ps.slice(0, 4), voice, "voice")}${egBlock(ps.slice(4), voice, "voice")}
          <small class="cl-note">Level 50 is no pitch change.</small></div>`;
      return `<div class="cl-group"><h5>${g}</h5>${ps.map((p) => rowHtml(p, getParam(voice, p.path), voice, "voice")).join("")}</div>`;
    };
    el("#voiceDetail").innerHTML = VOICE_GROUPS.map(group).join("");
  }

  /** Full rebuild: after an operator change, undo, revert, or a new voice. */
  function draw() {
    drawOp();
    drawVoice();
    refresh();
  }

  /** An edit the app should keep. */
  function commit({ rebuild = false } = {}) {
    onChange(voice);
    onPreview(previewVoice());
    rebuild ? draw() : refresh();
  }

  function setVoice(next, { reset = true } = {}) {
    voice = sanitizeVoice(next);
    if (reset) {
      stored = cloneVoice(voice);
      past.length = future.length = 0;
      muted.clear();
      comparing = false;
    }
    draw();
    onPreview(previewVoice());
  }

  // ------------------------------------------------------------- editing
  function apply(scope, id, raw) {
    const table = scope === "op" ? OP_PARAMS : VOICE_PARAMS;
    const p = table.find((q) => q.id === id);
    if (!p) return;
    const target = scope === "op" ? voice.ops[op - 1] : voice;
    const value = clamp(raw, p.min, p.max);
    if (getParam(target, p.path) === value) return;
    push();
    setParam(target, p.path, value);
    // The algorithm decides which operators are carriers, so the whole panel is redrawn.
    commit({ rebuild: p.id === "algorithm" });
  }

  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.param == null) return;
    if (t.type === "number" && t.value === "") return; // mid-typing
    apply(t.dataset.scope, t.dataset.param, +t.value);
  });
  root.addEventListener("click", (e) => {
    const sel = e.target.closest("[data-op]");
    if (sel) return (op = +sel.dataset.op), draw();
    const power = e.target.closest("[data-power]");
    if (!power) return;
    const n = +power.dataset.power;
    muted.has(n) ? muted.delete(n) : muted.add(n);
    onPreview(previewVoice());
    drawStrip();
    drawBar();
  });
  root.addEventListener("change", (e) => {
    if (e.target.id !== "clEgCopy" || !e.target.value) return;
    const from = voice.ops[+e.target.value - 1];
    push();
    const o = voice.ops[op - 1];
    o.rates = [...from.rates];
    o.levels = [...from.levels];
    e.target.value = "";
    commit();
  });

  const undo = () => {
    if (!past.length) return;
    future.push(cloneVoice(voice));
    voice = past.pop();
    commit({ rebuild: true });
  };
  const redo = () => {
    if (!future.length) return;
    past.push(cloneVoice(voice));
    voice = future.pop();
    commit({ rebuild: true });
  };
  el("#clCompare").onclick = () => {
    comparing = !comparing;
    onPreview(previewVoice());
    drawBar();
  };
  el("#clUndo").onclick = undo;
  el("#clRedo").onclick = redo;
  el("#clRevert").onclick = () => {
    push();
    voice = cloneVoice(stored);
    commit({ rebuild: true });
  };
  el("#clInit").onclick = () => {
    push();
    voice = { ...defaultVoice(), name: voice.name };
    commit({ rebuild: true });
  };

  return {
    setVoice,
    undo,
    redo,
    draw,
    get voice() {
      return voice;
    },
    /** What the keyboard should play: mutes and compare included. */
    get previewVoice() {
      return previewVoice();
    },
    /** True when the voice differs from the one editing started with. */
    get edited() {
      return JSON.stringify(voice) !== JSON.stringify(stored);
    },
    /** Called when the algorithm was changed elsewhere, e.g. the picker on the right. */
    setAlgorithm(a) {
      if (!ALGORITHMS[a] || a === voice.algorithm) return;
      push();
      voice.algorithm = a;
      commit({ rebuild: true });
    },
    selectOp(n) {
      op = clamp(n, 1, 6);
      draw();
    },
  };
}
