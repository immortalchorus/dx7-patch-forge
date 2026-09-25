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
