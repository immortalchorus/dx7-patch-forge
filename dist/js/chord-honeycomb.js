// The chord honeycomb: one hexagon per degree of the key, staggered so they tessellate.
//
// This replaces the circle of fifths that Chord Lab started with. The wheel is a beautiful
// object and a bad fit for this job, for one reason that outgrew it: **a circle of fifths only
// describes a major key.** Its two rings are the majors and their relative minors, and the seven
// lit chords are the seven of a major scale. Ask it for Dorian, or Phrygian Dominant, or a
// pentatonic, and it has nothing to say - OWL fell back to printing roman numerals on a diagram
// that was still drawn as though the key were major.
//
// A honeycomb is one hexagon per scale degree, so it has exactly as many cells as the scale has
// notes: seven for the modes, five for a pentatonic, eight for the diminished scales. Every cell
// is a chord you can actually play in the chosen scale, and none of them are decoration.
//
// The geometry is SpaceAge's, from NumeralPadComponent in Source/SpaceageCircleOfFifths.h:
// flat-topped hexagons, each column three quarters of a width across, odd columns dropped half a
// height. That stagger is what makes it a honeycomb rather than a row of separate tiles.
//
// Nothing here touches the DOM: it returns markup, and app.js puts it on the page.

import { scaleByMode, chordLabel, romanNumeralForScaleDegree, defaultChord, degreeRootPitchClass, MODE_MAJOR } from "./harmony.js";

const H_RATIO = 0.8660254; // height of a flat-topped hexagon as a fraction of its width
const f = (n) => n.toFixed(2);

/** The box one cell occupies. Columns step three quarters across; odd ones drop half a height. */
export function cellBounds(index, { width, left = 0, top = 0 }) {
  const h = width * H_RATIO;
  return {
    x: left + index * width * 0.75,
    y: top + (index % 2 === 0 ? 0 : h * 0.5),
    w: width,
    h,
  };
}

/** A flat-topped hexagon inscribed in a box. */
const hexPath = ({ x, y, w, h }) =>
  `M${f(x + w * 0.25)} ${f(y)} L${f(x + w * 0.75)} ${f(y)} L${f(x + w)} ${f(y + h / 2)} ` +
  `L${f(x + w * 0.75)} ${f(y + h)} L${f(x + w * 0.25)} ${f(y + h)} L${f(x)} ${f(y + h / 2)} Z`;

/** How wide and tall the whole honeycomb is, for a given cell width and count. */
export function honeycombSize(count, width) {
  const h = width * H_RATIO;
  return { width: width * (0.75 * Math.max(1, count) + 0.25), height: h * 1.5 };
}

/**
 * The honeycomb for a key and scale, as SVG markup.
 *
 * `selected` is the degree currently being edited, or null. Every cell carries `data-degree`, so
 * what a click means is written on the shape itself rather than worked out from where the
 * pointer landed. The cells are their own hit targets, which is the whole reason this needs no
 * hit test the way the JUCE original does.
 */
export function honeycombSvg(keyPosition, mode = MODE_MAJOR, { width = 96, selected = null, pad = 6, preferFlats } = {}) {
  const scale = scaleByMode(mode);
  const count = Math.max(1, scale.count);
  let out = "";

  for (let degree = 0; degree < count; degree++) {
    const box = cellBounds(degree, { width, left: pad, top: pad });
    const chord = { ...defaultChord(), degree };
    const label = chordLabel(chord, { keyPosition, mode, preferFlats });
    const numeral = romanNumeralForScaleDegree(mode, degree);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const title = `${label}, ${numeral}, degree ${degree + 1} of ${scale.name}`;
    out += `<g class="hcell${degree === selected ? " sel" : ""}" role="button" tabindex="0"`;
    out += ` data-degree="${degree}" aria-label="${title}">`;
    out += `<title>${title}</title>`;
    out += `<path d="${hexPath(box)}"/>`;
    // A scale with no key-correct letter spelling is named by its numeral, and then the numeral
    // underneath would say the same thing twice. One line, centred, in that case.
    const doubled = label === numeral;
    out += `<text class="hname" x="${f(cx)}" y="${f(doubled ? cy + 6 : cy + 2)}" text-anchor="middle">${label}</text>`;
    if (!doubled) out += `<text class="hnum" x="${f(cx)}" y="${f(cy + box.h * 0.28)}" text-anchor="middle">${numeral}</text>`;
    out += `</g>`;
  }
  return out;
}

/**
 * Which cell a point lands on, or -1.
 *
 * The drawn honeycomb does not need this - its hexagons are their own hit targets - but the
 * JUCE original's hit test is what SpaceAge's FIFTHS gate sweeps, and a test that only checked
 * the drawn cells would be checking this file against itself. Point-in-polygon on the same path
 * the cell is drawn from, so the two cannot drift.
 */
export function degreeAtPoint(x, y, mode = MODE_MAJOR, { width = 96, pad = 6 } = {}) {
  const count = Math.max(1, scaleByMode(mode).count);
  // Later columns overlap earlier ones at the seams, so the last match wins the same way a
  // honeycomb drawn left to right puts the later cell on top.
  for (let degree = count - 1; degree >= 0; degree--) {
    if (pointInHex(x, y, cellBounds(degree, { width, left: pad, top: pad }))) return degree;
  }
  return -1;
}

function pointInHex(px, py, { x, y, w, h }) {
  const pts = [
    [x + w * 0.25, y], [x + w * 0.75, y], [x + w, y + h / 2],
    [x + w * 0.75, y + h], [x + w * 0.25, y + h], [x, y + h / 2],
  ];
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The pitch class each cell is rooted on, so a test can check the honeycomb against the scale. */
export const cellRootPitchClass = (keyRoot, mode, degree) => degreeRootPitchClass(keyRoot, mode, degree);
