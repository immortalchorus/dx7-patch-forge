// The tutorial is data, so it can be checked like data.
//
// The failure this exists to prevent: a tutorial that points at a control which has since been
// renamed, and says nothing about it. That is not hypothetical here - the wheel's `#clWheel`
// became `#clHoneycomb` the same day Chord Lab was built. A tutorial written as prose in a
// separate page would have gone on naming a control that no longer exists.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TUTORIAL_STEPS, TUTORIAL_TITLE, TUTORIAL_INTRO, runnableSteps, tutorialTargets } from "../dist/js/tutorial.js";
import { SCALES, QUALITIES, scaleModeNamed } from "../dist/js/harmony.js";

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");

test("every control the tutorial points at exists in the page", () => {
  const targets = tutorialTargets();
  assert.ok(targets.length >= 5, "a tour that highlights nothing is not a tour");
  for (const target of targets) {
    assert.match(target, /^#[A-Za-z][\w-]*$/, `${target} should be a plain id selector`);
    assert.ok(html.includes(`id="${target.slice(1)}"`), `${target} is not in index.html any more`);
  }
});

test("the steps are well formed and readable", () => {
  assert.ok(TUTORIAL_TITLE.length > 0);
  assert.ok(TUTORIAL_INTRO.length > 80, "the introduction should say what this is for");
  const ids = new Set();
  for (const step of TUTORIAL_STEPS) {
    assert.match(step.id, /^[a-z][a-z0-9-]*$/, `${step.id} should be a stable slug`);
    assert.ok(!ids.has(step.id), `duplicate step id ${step.id}`);
    ids.add(step.id);
    assert.ok(step.title.length > 4 && step.title.length < 60, `${step.id}: title length`);
    // Long enough to be worth reading, short enough to fit the callout without scrolling.
    assert.ok(step.body.length > 80, `${step.id}: body is too short to explain anything`);
    assert.ok(step.body.length < 560, `${step.id}: body will not fit the callout`);
    assert.ok(step.run === undefined || typeof step.run === "function", `${step.id}: run must be a function`);
  }
});

test("the tutorial teaches the thing it exists for", () => {
  // Chord Lab is in a patch designer because it measures. A tutorial that never gets to the
  // measurement has missed the point, so that is asserted rather than left to judgement.
  const prose = TUTORIAL_STEPS.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
  assert.ok(prose.includes("clip"), "the tutorial should explain clipping");
  assert.ok(prose.includes("voicing"), "and what to do about it");
  assert.ok(TUTORIAL_STEPS.some((s) => s.target === "#clMeasure"), "and point at the measurement");
});

test("every step that changes something asks for something real", () => {
  // The steps call an api rather than touching the page, so a fake api can record what a whole
  // run of the tour would ask for, and each request can be checked against the model.
  const calls = [];
  const api = new Proxy({}, { get: (_, name) => (...args) => calls.push({ name, args }) });
  const runnable = runnableSteps();
  assert.ok(runnable.length >= 4, "a tour that sets nothing up cannot demonstrate anything");
  for (const step of runnable) step.run(api);

  const known = new Set(["setKey", "setScale", "setSpelling", "clearChords", "addChord", "selectNth", "editChord", "measure"]);
  for (const call of calls) assert.ok(known.has(call.name), `the tour calls ${call.name}, which the api does not offer`);

  for (const { name, args } of calls) {
    if (name === "setScale") assert.ok(scaleModeNamed(args[0]) >= 0, `${args[0]} is not one of the scales`);
    if (name === "setKey") assert.ok(Number.isInteger(args[0]) && args[0] >= 0 && args[0] < 12, `key ${args[0]}`);
    if (name === "setSpelling") assert.ok(["key", "sharps", "flats"].includes(args[0]), `spelling ${args[0]}`);
    if (name === "addChord") {
      assert.ok(args[0] >= 0 && args[0] < 7, `degree ${args[0]}`);
      if (args[1] !== undefined) assert.ok(args[1] >= 0 && args[1] < QUALITIES.length, `quality ${args[1]}`);
    }
    if (name === "editChord") {
      for (const [field, value] of Object.entries(args[0])) {
        assert.ok(["quality", "inversion", "voicing", "registerOctaves"].includes(field), `editChord got ${field}`);
        assert.ok(Number.isInteger(value), `${field} should be a whole number`);
      }
    }
  }
  // It should finish with a progression on the loop and a measurement taken, or it has not shown
  // the one thing worth showing.
  assert.ok(calls.some((c) => c.name === "measure"), "the tour never measures");
  assert.ok(calls.filter((c) => c.name === "addChord").length >= 4, "the tour never builds a progression");
  assert.ok(SCALES.length === 50, "the scale list moved; the tutorial's claims about it should be re-read");
});

test("the page and the tour read the same records", () => {
  // The whole reason the steps are data: tutorial.html renders this list, so anything it shows is
  // this list. If the page ever grows its own copy of the prose, this is what should catch it.
  const page = readFileSync(new URL("../dist/tutorial.html", import.meta.url), "utf8");
  assert.ok(page.includes(`from "./js/tutorial.js"`), "the page should import the steps, not restate them");
  for (const step of TUTORIAL_STEPS) {
    assert.ok(!page.includes(step.body), `${step.id}'s text is copied into the page as well as imported`);
  }
});

test("the stylesheet has no at-rule left without its block", () => {
  // This shipped once. Removing a media query with a regex left a bare `@media` behind, and a
  // dangling at-rule does not fail loudly - the parser treats whatever follows as its condition
  // and swallows the next rule whole. The callout lost `position: fixed` and rendered inline at
  // the foot of the page while every rule around it still worked, which is exactly the kind of
  // breakage that reaches a deploy.
  const css = readFileSync(new URL("../dist/styles.css", import.meta.url), "utf8");
  const lines = css.split("\n");
  lines.forEach((line, i) => {
    const at = line.trim();
    if (!at.startsWith("@")) return;
    // Every at-rule either opens a block on its own line or is a complete one-line statement.
    assert.ok(
      at.includes("{") || at.endsWith(";"),
      `styles.css:${i + 1} has an at-rule with neither a block nor a semicolon: ${at}`,
    );
  });
  assert.equal(css.split("{").length, css.split("}").length, "unbalanced braces in styles.css");
});

/**
 * The region of `html` occupied by the element carrying `id`, assuming it is a div.
 * A small depth counter rather than a parser: only `div` tags are counted, which is enough for
 * this file and fails loudly if the shape it assumes ever stops holding.
 */
function divRegion(html, id) {
  const marker = html.indexOf(`id="${id}"`);
  assert.ok(marker > 0, `#${id} is not in the page`);
  const start = html.lastIndexOf("<", marker);
  assert.ok(html.startsWith("<div", start), `#${id} is not a div; this check assumes it is one`);
  const tag = /<(\/?)div\b[^>]*?>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m; (m = tag.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [start, tag.lastIndex];
  }
  throw new Error(`#${id} is never closed`);
}

test("every control in Chord Lab is one the tutorial points at", () => {
  // The guard this exists to be. A test cannot notice that a feature shipped without being
  // taught - it does not know the feature exists - but it can notice that a *control* has
  // appeared which no step rings. The tutorial fell behind twice before this was here: once for
  // the controls on the hexagon, once for the MIDI export, and both times a person had to catch
  // it. Add a control to Chord Lab now and this fails until the tour points at it, or until
  // someone writes down here why it does not need to.
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const [from, to] = divRegion(html, "chordLab");
  const panel = html.slice(from, to);

  const targets = new Set(tutorialTargets().map((t) => t.slice(1)));
  // The panel as a whole is a target - step one rings it - but that must not count as covering
  // everything inside it, or the guard would pass by construction and mean nothing.
  const containers = [...targets].filter((id) => id !== "chordLab" && new RegExp(`<div[^>]*id="${id}"`).test(html));
  const covers = containers.map((id) => divRegion(html, id));

  // Interactive means something a person operates: a select, a button, a checkbox or a slider.
  const controls = [...panel.matchAll(/<(select|button|input)\b[^>]*\bid="([^"]+)"/g)].map((m) => ({
    id: m[2],
    at: from + m.index,
  }));
  assert.ok(controls.length >= 6, `only ${controls.length} controls found; the scan is probably broken`);

  const uncovered = controls.filter(({ id, at }) => {
    if (targets.has(id)) return false;
    return !covers.some(([start, end]) => at > start && at < end);
  });
  assert.deepEqual(
    uncovered.map((c) => c.id),
    [],
    `Chord Lab controls the tutorial never points at: ${uncovered.map((c) => "#" + c.id).join(", ")}. ` +
      `Add a step that rings it, add it to an existing step's target list, or say here why it does not need one.`,
  );
});

test("the guard would notice a control the tutorial had missed", () => {
  // A guard that cannot fail is decoration. This performs the failure it is meant to catch,
  // against the same logic, rather than trusting that it works.
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const [from, to] = divRegion(html, "chordLab");
  const withNewControl = html.slice(0, to - 6) + `<select id="clSomethingNew"></select>` + html.slice(to - 6);
  const [f2, t2] = divRegion(withNewControl, "chordLab");
  const found = [...withNewControl.slice(f2, t2).matchAll(/<(select|button|input)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[2]);
  assert.ok(found.includes("clSomethingNew"), "the scan finds a newly added control");
  assert.ok(!new Set(tutorialTargets().map((t) => t.slice(1))).has("clSomethingNew"), "and it is not a target");
});
