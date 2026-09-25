// The circle of fifths, drawn as SVG.
//
// SpaceAge's CircleOfFifthsComponent is a JUCE component and was not ported; this is the rebuild
// the brief asks for. What *is* shared is the model in harmony.js, which decides every degree,
// name and pitch class here. This file only turns that into shapes, the way algorithm-chart.js
// turns an algorithm into boxes and lines.
//
// The ring geometry is SpaceAge's, as fractions of the wheel's radius, and is named once because
// the drawing and the hit target have to agree. In JUCE that agreement needed a hit test and a
// gate to check it; in SVG the segment a person clicks *is* the shape that was drawn, and carries
// the degree it was drawn with, so the class of bug that gate guards against cannot occur here.
//
// Nothing in this file touches the DOM: it returns markup, and app.js puts it on the page.

import { wrap, majorName, minorName, majorRingDegree, minorRingDegree, chordName, degreeNumeral } from "./harmony.js";

// Fractions of the radius, from SpaceAge's CircleOfFifthsComponent.
const MAJOR_INNER = 0.72;
const MINOR_OUTER = 0.66;
const MINOR_INNER = 0.4;
const SEGMENT_DEGREES = 30; // twelve positions

const f = (n) => n.toFixed(2);

/** A point on the wheel: `angle` is degrees clockwise from the top, `r` a fraction of the radius. */
function point(cx, cy, radius, angle, r) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [cx + radius * r * Math.cos(rad), cy + radius * r * Math.sin(rad)];
}

/** One annulus segment, from `inner` to `outer` as fractions of the radius. */
function segmentPath(cx, cy, radius, position, inner, outer) {
  const a0 = position * SEGMENT_DEGREES - SEGMENT_DEGREES / 2;
  const a1 = position * SEGMENT_DEGREES + SEGMENT_DEGREES / 2;
  const [x0, y0] = point(cx, cy, radius, a0, outer);
  const [x1, y1] = point(cx, cy, radius, a1, outer);
  const [x2, y2] = point(cx, cy, radius, a1, inner);
  const [x3, y3] = point(cx, cy, radius, a0, inner);
  const ro = radius * outer;
  const ri = radius * inner;
  return `M${f(x0)} ${f(y0)} A${f(ro)} ${f(ro)} 0 0 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${f(ri)} ${f(ri)} 0 0 0 ${f(x3)} ${f(y3)} Z`;
}

/**
 * The wheel for a key, as SVG markup for a `viewBox="0 0 size size"`.
 *
 * `selected` is the degree currently being edited, or null. Every clickable segment carries
 * `data-degree` and `data-position`, so what a click means is written on the shape itself rather
 * than worked out again from where the pointer landed.
 */
export function wheelSvg(keyPosition, { size = 360, selected = null } = {}) {
  const key = wrap(keyPosition);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;
  let out = "";

  for (let position = 0; position < 12; position++) {
    for (const ring of ["major", "minor"]) {
      const isMajor = ring === "major";
      const degree = isMajor ? majorRingDegree(key, position) : minorRingDegree(key, position);
      const lit = degree >= 0;
      const [inner, outer] = isMajor ? [MAJOR_INNER, 1] : [MINOR_INNER, MINOR_OUTER];
      const label = lit ? chordName(key, degree) : isMajor ? majorName(position) : minorName(position);
      const mid = (inner + outer) / 2;
      const [tx, ty] = point(cx, cy, radius, position * SEGMENT_DEGREES, mid);
      const cls = `wseg ${ring}${lit ? " lit" : ""}${lit && degree === selected ? " sel" : ""}`;
      const title = lit
        ? `${label}, ${degreeNumeral(degree)} in ${majorName(key)}`
        : `${label}, outside ${majorName(key)}`;
      // Positions outside the key are drawn, but are not targets: they are the context that makes
      // the seven lit chords read as a key rather than as a list.
      //
      // A lit segment is a `g` with a button role rather than an HTML `button`: inside an `svg`
      // element the markup is parsed in the SVG namespace, where `button` is not a button at all,
      // only an unknown element that happens to draw its children. The role and the tabindex are
      // what make it reachable; app.js gives it Enter and Space.
      const attrs = lit
        ? ` role="button" tabindex="0" data-degree="${degree}" data-position="${position}" aria-label="${title}"`
        : ` aria-hidden="true"`;
      out += `<g class="${cls}"${attrs}>`;
      out += `<title>${title}</title>`;
      out += `<path d="${segmentPath(cx, cy, radius, position, inner, outer)}"/>`;
      out += `<text x="${f(tx)}" y="${f(ty + 4)}" text-anchor="middle">${label}</text>`;
      if (lit) {
        const [nx, ny] = point(cx, cy, radius, position * SEGMENT_DEGREES, isMajor ? outer - 0.07 : inner + 0.06);
        out += `<text class="wnum" x="${f(nx)}" y="${f(ny + 3)}" text-anchor="middle">${degreeNumeral(degree)}</text>`;
      }
      out += `</g>`;
    }
  }

  // The centre names the key. It is not a target: changing key is a deliberate act, and the keys
  // are a row of buttons beside the wheel where they can be read at a glance.
  out += `<circle class="whub" cx="${f(cx)}" cy="${f(cy)}" r="${f(radius * MINOR_INNER)}"/>`;
  out += `<text class="wkey" x="${f(cx)}" y="${f(cy - 2)}" text-anchor="middle">${majorName(key)}</text>`;
  out += `<text class="wsig" x="${f(cx)}" y="${f(cy + 16)}" text-anchor="middle">major</text>`;
  return out;
}

/**
 * Which chord a point lands on, or -1: SpaceAge's degreeAtPoint, ported so the two can be held
 * to the same cases. The drawn wheel above does not need it - its segments are their own hit
 * targets - but a test that only checked the segments would be checking this file against
 * itself, and this is the function SpaceAge's FIFTHS gate actually sweeps.
 *
 * `x` and `y` are relative to the wheel's top-left corner, in the same units as `size`.
 */
export function degreeAtPoint(keyPosition, x, y, { size = 360 } = {}) {
  const key = wrap(keyPosition);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;
  if (radius <= 1) return -1;

  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.hypot(dx, dy);
  if (distance > radius || distance < radius * MINOR_INNER) return -1;

  // Twelve segments, each 30 degrees, with position 0 centred on the top.
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  const position = wrap(Math.floor((angle + SEGMENT_DEGREES / 2) / SEGMENT_DEGREES));

  return distance >= radius * MAJOR_INNER ? majorRingDegree(key, position) : minorRingDegree(key, position);
}

/** The ring fractions, exported so a test can probe the middle of a ring rather than guess. */
export const RING_FRACTIONS = { majorInner: MAJOR_INNER, minorOuter: MINOR_OUTER, minorInner: MINOR_INNER };
