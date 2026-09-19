// The 32 algorithms drawn the way the DX7 front panel prints them.
//
// Positions come from close-up photos of the printed chart, cross-checked against Ken
// Shirriff's reverse-engineered chart and Dexed's routing table: operators are plain boxes,
// carriers on the bottom row, modulators above their target joined by straight or diagonal
// lines, one output bus under the carriers, and a small right-angled feedback loop on the
// side the panel uses (left for OP2 in 2, 9, 15, 17 and OP4 in 8).
//
// p: op -> [column, row] (row 0 = carriers). fb: [from, to, side].

export const ALGORITHM_LAYOUT = {
  1: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [1, 2], 6: [1, 3] }, fb: [6, 6, "R"] },
  2: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [1, 2], 6: [1, 3] }, fb: [2, 2, "L"] },
  3: { p: { 1: [0, 0], 2: [0, 1], 3: [0, 2], 4: [1, 0], 5: [1, 1], 6: [1, 2] }, fb: [6, 6, "R"] },
  4: { p: { 1: [0, 0], 2: [0, 1], 3: [0, 2], 4: [1, 0], 5: [1, 1], 6: [1, 2] }, fb: [6, 4, "R"] },
  5: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [2, 0], 6: [2, 1] }, fb: [6, 6, "R"] },
  6: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [2, 0], 6: [2, 1] }, fb: [6, 5, "R"] },
  7: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [2, 1], 6: [2, 2] }, fb: [6, 6, "R"] },
  8: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [2, 1], 6: [2, 2] }, fb: [4, 4, "L"] },
  9: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [2, 1], 6: [2, 2] }, fb: [2, 2, "L"] },
  10: { p: { 5: [0, 1], 6: [1, 1], 4: [1, 0], 1: [2, 0], 2: [2, 1], 3: [2, 2] }, fb: [3, 3, "R"] },
  11: { p: { 5: [0, 1], 6: [1, 1], 4: [1, 0], 1: [2, 0], 2: [2, 1], 3: [2, 2] }, fb: [6, 6, "R"] },
  12: { p: { 4: [0, 1], 5: [1, 1], 6: [2, 1], 3: [1, 0], 1: [3, 0], 2: [3, 1] }, fb: [2, 2, "R"] },
  13: { p: { 4: [0, 1], 5: [1, 1], 6: [2, 1], 3: [1, 0], 1: [3, 0], 2: [3, 1] }, fb: [6, 6, "R"] },
  14: { p: { 1: [0, 0], 2: [0, 1], 5: [0, 2], 3: [1, 0], 4: [1, 1], 6: [1, 2] }, fb: [6, 6, "R"] },
  15: { p: { 1: [0, 0], 2: [0, 1], 5: [0, 2], 3: [1, 0], 4: [1, 1], 6: [1, 2] }, fb: [2, 2, "L"] },
  16: { p: { 2: [0, 1], 1: [1, 0], 3: [1, 1], 4: [1, 2], 5: [2, 1], 6: [2, 2] }, fb: [6, 6, "R"] },
  17: { p: { 2: [0, 1], 1: [1, 0], 3: [1, 1], 4: [1, 2], 5: [2, 1], 6: [2, 2] }, fb: [2, 2, "L"] },
  18: { p: { 2: [0, 1], 1: [1, 0], 3: [1, 1], 4: [2, 1], 5: [2, 2], 6: [2, 3] }, fb: [3, 3, "R"] },
  19: { p: { 1: [0, 0], 2: [0, 1], 3: [0, 2], 4: [1, 0], 6: [1, 1], 5: [2, 0] }, fb: [6, 6, "R"] },
  20: { p: { 1: [0, 0], 3: [0, 1], 2: [1, 0], 5: [1, 1], 4: [2, 0], 6: [2, 1] }, fb: [3, 3, "R"] },
  21: { p: { 1: [0, 0], 3: [0, 1], 2: [1, 0], 4: [2, 0], 6: [2, 1], 5: [3, 0] }, fb: [3, 3, "R"] },
  22: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [2, 0], 6: [2, 1], 5: [3, 0] }, fb: [6, 6, "R"] },
  23: { p: { 1: [0, 0], 2: [1, 0], 3: [1, 1], 4: [2, 0], 6: [2, 1], 5: [3, 0] }, fb: [6, 6, "R"] },
  24: { p: { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [3, 0], 6: [3, 1], 5: [4, 0] }, fb: [6, 6, "R"] },
  25: { p: { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [3, 0], 6: [3, 1], 5: [4, 0] }, fb: [6, 6, "R"] },
  26: { p: { 1: [0, 0], 2: [1, 0], 3: [1, 1], 5: [2, 1], 4: [3, 0], 6: [3, 1] }, fb: [6, 6, "R"] },
  27: { p: { 1: [0, 0], 2: [1, 0], 3: [1, 1], 5: [2, 1], 4: [3, 0], 6: [3, 1] }, fb: [3, 3, "R"] },
  28: { p: { 1: [0, 0], 2: [0, 1], 3: [1, 0], 4: [1, 1], 5: [1, 2], 6: [2, 0] }, fb: [5, 5, "R"] },
  29: { p: { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [2, 1], 5: [3, 0], 6: [3, 1] }, fb: [6, 6, "R"] },
  30: { p: { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [2, 1], 5: [2, 2], 6: [3, 0] }, fb: [5, 5, "R"] },
  31: { p: { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [3, 0], 5: [4, 0], 6: [4, 1] }, fb: [6, 6, "R"] },
  32: { p: { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [3, 0], 5: [4, 0], 6: [5, 0] }, fb: [6, 6, "R"] },
};

// Drawing geometry for style D: wide boxes on a fixed grid, sized for the tallest (4-row) and
// widest (6-column) algorithms so the diagram never rescales between patches.
const BOX_W = 51, BOX_H = 34, GAP_X = 14, GAP_Y = 16, MAX_ROWS = 4;
export const chartHeight = ({ boxH = BOX_H, gapY = GAP_Y, rows = MAX_ROWS } = {}) => 24 + rows * boxH + (rows - 1) * gapY + 30;
export const CHART_HEIGHT = chartHeight();

/**
 * SVG markup for one algorithm (viewBox 0 0 width CHART_HEIGHT).
 * Panel positions and panel-style lines: straight verticals and diagonals, an output bus under
 * the carriers, a right-angled feedback loop. Coloured by role in the app's palette.
 * colors: { fill, carrier, modulator, line, bus, feedback, dim }; silent: operators at level 0.
 */
export function algorithmSvg(algorithm, edges, carriers, { width = 440, colors, silent = new Set(), scale = 1, rows = MAX_ROWS } = {}) {
  const lay = ALGORITHM_LAYOUT[algorithm];
  const bw = BOX_W * scale, bh = BOX_H * scale, gx = GAP_X * scale, gy = GAP_Y * scale;
  const cols = Math.max(...Object.values(lay.p).map(([c]) => c)) + 1;
  const totalW = cols * bw + (cols - 1) * gx;
  const x0 = (width - totalW) / 2;
  const busY = chartHeight({ boxH: bh, gapY: gy, rows }) - 22 * scale;
  const left = (op) => x0 + lay.p[op][0] * (bw + gx);
  const top = (op) => busY - 12 * scale - lay.p[op][1] * (bh + gy) - bh;
  const cx = (op) => left(op) + bw / 2;
  const f = (n) => n.toFixed(1);
  const line = (x1, y1, x2, y2, c) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${c}" stroke-width="${f(2 * scale)}"/>`;
  let out = "";
  for (const [from, to] of edges) out += line(cx(from), top(from) + bh, cx(to), top(to), colors.line);
  const xs = carriers.map(cx);
  for (const c of carriers) out += line(cx(c), top(c) + bh, cx(c), busY, colors.bus);
  if (xs.length > 1) out += line(Math.min(...xs), busY, Math.max(...xs), busY, colors.bus);
  // Feedback: up from the top edge, over the side, down, and back into the target's side.
  const [fbFrom, fbTo, side] = lay.fb;
  const s = side === "R" ? 1 : -1;
  const outer = side === "R" ? left(fbFrom) + bw + 8 * scale : left(fbFrom) - 8 * scale;
  const edgeX = side === "R" ? left(fbTo) + bw : left(fbTo);
  out += `<path d="M${f(cx(fbFrom) + s * bw * 0.2)} ${f(top(fbFrom))} V${f(top(fbFrom) - 8 * scale)} H${f(outer)} V${f(top(fbTo) + bh * 0.55)} H${f(edgeX)}" fill="none" stroke="${colors.feedback}" stroke-width="${f(1.75 * scale)}"/>`;
  for (let op = 1; op <= 6; op++) {
    const role = silent.has(op) ? colors.dim : carriers.includes(op) ? colors.carrier : colors.modulator;
    out += `<rect x="${f(left(op))}" y="${f(top(op))}" width="${f(bw)}" height="${f(bh)}" rx="${f(3 * scale)}" fill="${colors.fill}" stroke="${role}" stroke-width="${f(1.75 * scale)}"/>`;
    out += `<text x="${f(cx(op))}" y="${f(top(op) + bh / 2 + 4.5 * scale)}" text-anchor="middle" fill="${role}" font-family="DM Mono, monospace" font-size="${f(13 * scale)}">${op}</text>`;
  }
  return out;
}
