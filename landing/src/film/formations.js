/**
 * The film is carried by ONE set of points that never dies — it only
 * reorganises. That is the whole argument of the page made physical: the same
 * information, first scattered, then structured. Each function below fills a
 * Float32Array with the target positions for one act.
 *
 * Everything is deterministic (seeded), so a given point keeps its identity
 * across acts and the morph reads as motion rather than as a cut.
 */

const GOLD = [1.0, 0.72, 0.2];
const WHITE = [0.92, 0.94, 1.0];
const BLUE = [0.42, 0.66, 1.0];
const DIM = [0.38, 0.42, 0.52];

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample points evenly along a polyline, with a little scatter off the line. */
function samplePolyline(segments, count, out, offset, scatter, rand, z = 0, zJitter = 0) {
  let total = 0;
  const lengths = segments.map(([a, b]) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    total += l;
    return l;
  });
  let written = 0;
  segments.forEach(([a, b], i) => {
    const share = i === segments.length - 1 ? count - written : Math.round((lengths[i] / total) * count);
    for (let k = 0; k < share; k++) {
      const t = (k + rand() * 0.6) / Math.max(1, share);
      const idx = (offset + written + k) * 3;
      out[idx] = a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * scatter;
      out[idx + 1] = a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * scatter;
      out[idx + 2] = z + (rand() - 0.5) * zJitter;
    }
    written += share;
  });
  return written;
}

/** ACT I — a working surface: lines of text on a tilted plane, and a cursor. */
export function formationMonday(n, out, colors) {
  const rand = mulberry32(11);
  const rows = 16;
  const perRow = Math.floor(n / rows);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    // Ragged line lengths so it reads as prose/code, not a grid.
    const len = 0.28 + rand() * 0.62;
    const indent = r % 5 === 0 ? 0 : rand() * 0.1;
    const y = 2.6 - r * 0.34;
    for (let k = 0; k < perRow && i < n; k++, i++) {
      const t = k / perRow;
      const idx = i * 3;
      out[idx] = -4.2 + indent * 4 + t * len * 8.4;
      out[idx + 1] = y + (rand() - 0.5) * 0.05;
      out[idx + 2] = (rand() - 0.5) * 0.12;
      // the last two rows are the answer coming back — lit, not dim
      const c = r >= rows - 3 ? WHITE : DIM;
      colors[idx] = c[0];
      colors[idx + 1] = c[1];
      colors[idx + 2] = c[2];
    }
  }
  for (; i < n; i++) {
    const idx = i * 3;
    out[idx] = -4.2 + rand() * 8.4;
    out[idx + 1] = -3.2 - rand() * 0.4;
    out[idx + 2] = (rand() - 0.5) * 0.12;
    colors[idx] = DIM[0];
    colors[idx + 1] = DIM[1];
    colors[idx + 2] = DIM[2];
  }
}

/** ACT II — fragments converge into one dense, coherent body. */
export function formationMemory(n, out, colors) {
  const rand = mulberry32(23);
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    // Shell of a rounded form, denser toward the surface.
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = 1.9 * (0.72 + 0.28 * Math.cbrt(rand()));
    const s = Math.sqrt(1 - u * u);
    out[idx] = Math.cos(th) * s * r * 1.15;
    out[idx + 1] = u * r;
    out[idx + 2] = Math.sin(th) * s * r * 1.15;
    const c = rand() < 0.18 ? BLUE : WHITE;
    colors[idx] = c[0];
    colors[idx + 1] = c[1];
    colors[idx + 2] = c[2];
  }
}

/** ACT III — the same material, broken into isolated islands. */
export function formationProblem(n, out, colors) {
  const rand = mulberry32(37);
  const islands = [
    [-5.4, 1.6, -1.2],
    [-2.0, -1.9, 0.6],
    [1.6, 2.0, -0.8],
    [4.8, -0.6, 0.9],
    [0.4, -2.6, -1.6],
  ];
  const per = Math.ceil(n / islands.length);
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    const c = islands[Math.min(islands.length - 1, Math.floor(i / per))];
    const r = 0.95 * Math.cbrt(rand());
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(rand() * 2 - 1);
    out[idx] = c[0] + Math.sin(ph) * Math.cos(th) * r;
    out[idx + 1] = c[1] + Math.sin(ph) * Math.sin(th) * r * 0.8;
    out[idx + 2] = c[2] + Math.cos(ph) * r;
    colors[idx] = DIM[0];
    colors[idx + 1] = DIM[1];
    colors[idx + 2] = DIM[2];
  }
}

/**
 * ACT IV — AXON. The points resolve into the wireframe summit from the mark.
 * This is the only act that quotes the logo, and it is the turn of the film.
 */
export function formationAxon(n, out, colors) {
  const rand = mulberry32(53);
  const S = 5.6;
  const p = (x, y) => [x * S, y * S];
  const segments = [
    // silhouette
    [p(-1.0, -0.6), p(-0.55, 0.15)],
    [p(-0.55, 0.15), p(-0.3, -0.15)],
    [p(-0.3, -0.15), p(0, 0.72)],
    [p(0, 0.72), p(0.28, -0.03)],
    [p(0.28, -0.03), p(0.5, 0.1)],
    [p(0.5, 0.1), p(1.0, -0.6)],
    // ridges off the main apex
    [p(0, 0.72), p(-0.38, -0.6)],
    [p(0, 0.72), p(0, -0.6)],
    [p(0, 0.72), p(0.38, -0.6)],
    // secondary apexes
    [p(-0.55, 0.15), p(-0.78, -0.6)],
    [p(-0.55, 0.15), p(-0.3, -0.6)],
    [p(0.5, 0.1), p(0.28, -0.6)],
    [p(0.5, 0.1), p(0.74, -0.6)],
    // triangulation bands
    [p(-0.28, -0.05), p(0, -0.15)],
    [p(0, -0.15), p(0.28, -0.03)],
    [p(-0.62, -0.35), p(-0.3, -0.25)],
    [p(-0.3, -0.25), p(0, -0.2)],
    [p(0, -0.2), p(0.3, -0.25)],
    [p(0.3, -0.25), p(0.62, -0.35)],
  ];
  const written = samplePolyline(segments, n, out, 0, 0.045, rand, 0, 0.7);
  for (let i = written; i < n; i++) {
    const idx = i * 3;
    out[idx] = (rand() - 0.5) * 12;
    out[idx + 1] = -3.4 + (rand() - 0.5) * 0.5;
    out[idx + 2] = (rand() - 0.5) * 2;
  }
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    // Apex glow: the higher the point, the hotter.
    const h = (out[idx + 1] / S + 0.6) / 1.32;
    const c = h > 0.86 ? [1, 0.96, 0.82] : GOLD;
    colors[idx] = c[0];
    colors[idx + 1] = c[1];
    colors[idx + 2] = c[2];
  }
}

/** ACT V — one memory, present on three surfaces at once. */
export function formationEverywhere(n, out, colors) {
  const rand = mulberry32(71);
  const panels = [
    [-5.2, 0.2, -0.6],
    [0, 0.2, 0],
    [5.2, 0.2, -0.6],
  ];
  const per = Math.floor(n / panels.length);
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    const pi = Math.min(panels.length - 1, Math.floor(i / per));
    const c = panels[pi];
    const k = i - pi * per;
    const rows = 11;
    const cols = Math.max(1, Math.floor(per / rows));
    const r = Math.floor(k / cols);
    const col = k % cols;
    const len = 0.42 + ((r * 37) % 11) / 11 * 0.5;
    out[idx] = c[0] - 1.5 + (col / cols) * 3 * len;
    out[idx + 1] = c[1] + 1.5 - r * 0.28 + (rand() - 0.5) * 0.03;
    out[idx + 2] = c[2] + (rand() - 0.5) * 0.1;
    // the shared memory reads blue on every surface
    const shared = r === 2 || r === 3;
    const cc = shared ? BLUE : DIM;
    colors[idx] = cc[0];
    colors[idx + 1] = cc[1];
    colors[idx + 2] = cc[2];
  }
}

/** ACT VI — raw conversation crystallises into a readable memory object. */
export function formationLanguage(n, out, colors) {
  const rand = mulberry32(97);
  const W = 3.5;
  const H = 2.3;
  const border = [
    [[-W, H], [W, H]],
    [[W, H], [W, -H]],
    [[W, -H], [-W, -H]],
    [[-W, -H], [-W, H]],
  ];
  const frameCount = Math.floor(n * 0.34);
  samplePolyline(border, frameCount, out, 0, 0.03, rand, 0, 0.06);

  // Structured rows inside: title, description, tags, context, source.
  const rowSpec = [0.9, 0.62, 0.34, 0.78, 0.5, 0.28];
  const rest = n - frameCount;
  const perRow = Math.floor(rest / rowSpec.length);
  let i = frameCount;
  rowSpec.forEach((len, r) => {
    const y = H - 0.55 - r * 0.62;
    for (let k = 0; k < perRow && i < n; k++, i++) {
      const idx = i * 3;
      out[idx] = -W + 0.5 + (k / perRow) * (2 * W - 1) * len;
      out[idx + 1] = y + (rand() - 0.5) * 0.05;
      out[idx + 2] = (rand() - 0.5) * 0.05;
    }
  });
  for (; i < n; i++) {
    const idx = i * 3;
    out[idx] = (rand() - 0.5) * 0.4;
    out[idx + 1] = -H - 0.4;
    out[idx + 2] = 0;
  }
  for (let j = 0; j < n; j++) {
    const idx = j * 3;
    const c = j < frameCount ? GOLD : WHITE;
    colors[idx] = c[0];
    colors[idx + 1] = c[1];
    colors[idx + 2] = c[2];
  }
}

export const ACTS = [
  formationMonday,
  formationMemory,
  formationProblem,
  formationAxon,
  formationEverywhere,
  formationLanguage,
];

/** Build every act's target buffers once, up front. */
export function buildActBuffers(n) {
  return ACTS.map((fn) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    fn(n, pos, col);
    return { pos, col };
  });
}
