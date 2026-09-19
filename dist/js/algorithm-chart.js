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

/**
 * SVG markup for one algorithm, sized to fill `width` x `height`.
 * edges: [[from, to], ...] modulation routing; carriers: [op, ...].
 * colors: { box, text, line, dim } ; silent: set of operators drawn dimmed (output level 0).
 */
export function algorithmSvg(algorithm, edges, carriers, { width = 440, height = 170, colors, silent = new Set(), label = true } = {}) {
  const lay = ALGORITHM_LAYOUT[algorithm];
  const cols = Math.max(...Object.values(lay.p).map(([c]) => c)) + 1;
  const rows = Math.max(...Object.values(lay.p).map(([, r]) => r)) + 1;
  // Panel proportions: boxes ~1.55:1, horizontal gap ~0.25 box, vertical gap ~0.4 box.
  const bottom = label ? 34 : 14;
  // One box size for every algorithm, as on the panel: sized for the widest (6 columns) and
  // tallest (4 rows) layouts, so switching algorithms never rescales the operators.
  const fit = (c, r) => Math.min((width - 40) / (c + (c - 1) * 0.25), ((height - bottom - 16) / (r + (r - 1) * 0.4)) * 1.55);
  const unitW = fit(Math.max(cols, 6), Math.max(rows, 4));
  const W = unitW, H = unitW / 1.55, GX = W * 0.25, GY = H * 0.4;
  const totalW = cols * W + (cols - 1) * GX;
  const x0 = (width - totalW) / 2;
  const busY = height - bottom + 8;
  const top = (op) => busY - 8 - lay.p[op][1] * (H + GY) - H;
  const left = (op) => x0 + lay.p[op][0] * (W + GX);
  const cx = (op) => left(op) + W / 2;
  const stroke = Math.max(1.5, H / 9);
  const line = (x1, y1, x2, y2) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${colors.line}" stroke-width="${stroke}" stroke-linecap="square"/>`;
  let out = "";
  for (const [from, to] of edges) out += line(cx(from), top(from) + H, cx(to), top(to));
  // Output bus: a stub under each carrier and one horizontal line spanning them.
  const xs = carriers.map(cx);
  for (const c of carriers) out += line(cx(c), top(c) + H, cx(c), busY);
  if (xs.length > 1) out += line(Math.min(...xs), busY, Math.max(...xs), busY);
  // Feedback: up from the top edge, over the side, down, and back into the target's side.
  const [fbFrom, fbTo, side] = lay.fb;
  const s = side === "R" ? 1 : -1;
  const outer = side === "R" ? left(fbFrom) + W + W * 0.18 : left(fbFrom) - W * 0.18;
  const rise = top(fbFrom) - H * 0.35;
  const exitX = cx(fbFrom) + s * W * 0.25;
  const entryY = top(fbTo) + H * 0.6;
  const edgeX = side === "R" ? left(fbTo) + W : left(fbTo);
  out += `<path d="M${exitX.toFixed(1)} ${top(fbFrom).toFixed(1)} V${rise.toFixed(1)} H${outer.toFixed(1)} V${entryY.toFixed(1)} H${edgeX.toFixed(1)}" fill="none" stroke="${colors.line}" stroke-width="${stroke}" stroke-linejoin="miter"/>`;
  for (let op = 1; op <= 6; op++) {
    const dim = silent.has(op);
    out += `<rect x="${left(op).toFixed(1)}" y="${top(op).toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="${dim ? colors.dim : colors.box}"/>`;
    out += `<text x="${cx(op).toFixed(1)}" y="${(top(op) + H * 0.7).toFixed(1)}" text-anchor="middle" fill="${colors.text}" font-family="DM Mono, monospace" font-size="${(H * 0.62).toFixed(1)}" font-weight="500">${op}</text>`;
  }
  if (label)
    out += `<text x="${(width / 2).toFixed(1)}" y="${(busY + 20).toFixed(1)}" text-anchor="middle" fill="${colors.line}" font-family="DM Mono, monospace" font-size="13">${algorithm}</text>`;
  return out;
}
