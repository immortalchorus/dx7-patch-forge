import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stampJs, stampHtml } from "../tools/stamp.mjs";

test("every way a module is referenced gets the version", () => {
  const js = [
    'import { a } from "./dx7.js";',
    'import { b } from "./sub/other.js";',
    'const w = new Worker(new URL("./design-worker.js", import.meta.url), { type: "module" });',
    'await ctx.audioWorklet.addModule(new URL("./preview-worklet.js", import.meta.url));',
    'const { P } = await import("./preview-engine.js");',
  ].join("\n");
  const out = stampJs(js, "abc123");
  assert.equal(out.match(/\?v=abc123/g).length, 5, out);
  assert.ok(out.includes('from "./dx7.js?v=abc123"'));
  assert.ok(out.includes('new URL("./design-worker.js?v=abc123", import.meta.url)'));
});

test("it leaves alone what is not a module reference", () => {
  const js = 'const help = "look at ./dx7.js for this";\nimport x from "https://example.com/x.js";\nfetch("./data.json");';
  assert.equal(stampJs(js, "abc123"), js);
  // Stamping twice must not double up, or the second deploy would break every path.
  const once = stampJs('import { a } from "./dx7.js";', "abc123");
  assert.equal(stampJs(once, "def456"), once);
});

test("the page's own script and stylesheet are stamped, but not remote ones", () => {
  const html = '<link href="https://fonts.googleapis.com/css2?family=DM+Mono" rel="stylesheet">\n<link rel="stylesheet" href="styles.css">\n<script type="module" src="js/app.js"></script>';
  const out = stampHtml(html, "abc123");
  assert.ok(out.includes('href="styles.css?v=abc123"'));
  assert.ok(out.includes('src="js/app.js?v=abc123"'));
  assert.ok(out.includes('href="https://fonts.googleapis.com/css2?family=DM+Mono"'), "a remote stylesheet is left alone");
});

test("the shipped app is stamped whole: no module reference is missed", () => {
  // Anything imported without a version would be served from the old cache after a deploy.
  const app = stampJs(readFileSync(new URL("../dist/js/app.js", import.meta.url), "utf8"), "v1");
  const refs = app.match(/(?:from |import\(|new URL\()\s*"\.\/[^"]+\.js[^"]*"/g) || [];
  assert.ok(refs.length > 10, `found ${refs.length} module references`);
  for (const ref of refs) assert.match(ref, /\?v=v1"$/, ref);
});
