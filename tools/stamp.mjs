// Stamp a version onto every module reference, at deploy time only.
//
// GitHub Pages serves these files with a ten-minute cache, and a query string on the page's
// own URL does not reach the modules it imports: you can load a fresh page that quietly runs
// last deploy's JavaScript. That makes a shipped fix look like it did not work. Stamping every
// import with the commit means each deploy fetches its own code, while the checked-in files
// stay plain so the app still runs from disk with no build step.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** True when this file was run directly, rather than imported. Paths with spaces need the URL decoded. */
const runAsScript = () => process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

/** Module specifiers in JavaScript: static imports, dynamic imports, and URLs for workers. */
export function stampJs(source, version) {
  return source
    .replace(/(\bfrom\s*")(\.\/[^"?]+\.js)(")/g, (_, a, path, b) => `${a}${path}?v=${version}${b}`)
    .replace(/(\bimport\(\s*")(\.\/[^"?]+\.js)(")/g, (_, a, path, b) => `${a}${path}?v=${version}${b}`)
    .replace(/(new URL\(\s*")(\.\/[^"?]+\.js)(")/g, (_, a, path, b) => `${a}${path}?v=${version}${b}`);
}

/** The page's own references: the entry script and the stylesheet. */
export function stampHtml(source, version) {
  return source
    .replace(/(<script[^>]*\ssrc=")([^"?]+\.js)(")/g, (_, a, path, b) => `${a}${path}?v=${version}${b}`)
    .replace(/(<link[^>]*\shref=")([^"?:]+\.css)(")/g, (_, a, path, b) => `${a}${path}?v=${version}${b}`);
}

export const stamp = (source, ext, version) => (ext === ".html" ? stampHtml : stampJs)(source, version);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

// node tools/stamp.mjs <dir> <version>
if (runAsScript()) {
  const [dir = "dist", version = String(Date.now())] = process.argv.slice(2);
  const short = version.slice(0, 12).replace(/[^\w.-]/g, "");
  let changed = 0;
  for await (const path of walk(dir)) {
    const ext = extname(path);
    if (ext !== ".js" && ext !== ".html") continue;
    const before = await readFile(path, "utf8");
    const after = stamp(before, ext, short);
    if (after !== before) (await writeFile(path, after), changed++);
  }
  console.log(`stamped ${changed} file${changed === 1 ? "" : "s"} with v=${short}`);
}
