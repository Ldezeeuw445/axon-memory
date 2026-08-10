/**
 * The film is carried by ONE body of matter that never dies — it only
 * reorganises. Each function below fills a Float32Array with the target
 * positions for one act.
 *
 * Everything here is VOLUMETRIC on purpose. Earlier versions sampled points
 * exactly onto lines, which read as a diagram being drawn. Every formation now
 * has real thickness, a dense core and a thinning halo, so the eye reads a
 * physical thing sitting in a dark room rather than a scatter plot.
 *
 * Deterministic (seeded), so a given particle keeps its identity across acts
 * and the morph reads as motion rather than as a cut.
 */

// Warm neutrals only. Blue is not in the palette — it exists solely as a
// timed pulse driven from the material, so it can never sit as ambient colour.
const WARM_WHITE = [0.96, 0.94, 0.9];
const BONE = [0.72, 0.71, 0.7];
const ASH = [0.30, 0.31, 0.34];
const EMBER = [1.0, 0.72, 0.32];
const EMBER_HOT = [1.0, 0.88, 0.66];

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian-ish: sum of uniforms. Gives soft cores instead of flat discs. */
function gauss(rand) {
  return (rand() + rand() + rand() - 1.5) * 0.9;
}

function setColor(colors, i, c, rand, spread = 0.06) {
  const j = rand() * spread - spread * 0.5;
  colors[i] = Math.max(0, c[0] + j);
  colors[i + 1] = Math.max(0, c[1] + j);
  colors[i + 2] = Math.max(0, c[2] + j);
}

/* ── a small value-noise fbm, used for the mountain ─────────────── */
function makeNoise(seed) {
  const rand = mulberry32(seed);
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grads = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const g = (h, x, y) => grads[h & 7][0] * x + grads[h & 7][1] * y;
  return (x, y) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = p[X] + Y;
    const b = p[X + 1] + Y;
    const n00 = g(p[a], x, y);
    const n10 = g(p[b], x - 1, y);
    const n01 = g(p[a + 1], x, y - 1);
    const n11 = g(p[b + 1], x - 1, y - 1);
    return (n00 + u * (n10 - n00) + v * (n01 + u * (n11 - n01) - (n00 + u * (n10 - n00)))) * 1.4;
  };
}

/**
 * ACT I — a lit working surface seen at a grazing angle. Deliberately NOT
 * legible text: a soft luminous field with faint horizontal striation, the way
 * a screen looks when it is out of focus behind someone's shoulder.
 */
export function formationMonday(n, out, colors) {
  const rand = mulberry32(11);
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    // Bias density toward a band of "rows" without ever resolving into lines.
    const row = Math.floor(rand() * 17);
    const rowY = 2.9 - row * 0.36;
    const along = rand();
    // ragged right edge, so it breathes like prose rather than a block
    const len = 0.3 + ((row * 37) % 13) / 13 * 0.66;
    out[idx] = -4.6 + along * 9.2 * len + gauss(rand) * 0.28;
    out[idx + 1] = rowY + gauss(rand) * 0.16;
    out[idx + 2] = gauss(rand) * 0.9;

    // The last rows are the answer arriving — warmer, brighter.
    const answering = row >= 14;
    setColor(colors, idx, answering ? WARM_WHITE : ASH, rand, answering ? 0.1 : 0.05);
  }
}

/** ACT II — the scattered pieces gather into one dense, coherent body. */
export function formationMemory(n, out, colors) {
  const rand = mulberry32(23);
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    // Dense core, thinning halo: r^(1/3) fills evenly, so bias below that.
    const shell = Math.pow(rand(), 0.55);
    const r = 2.15 * shell;
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    out[idx] = Math.cos(th) * s * r * 1.18;
    out[idx + 1] = u * r * 0.92;
    out[idx + 2] = Math.sin(th) * s * r * 1.18;
    // hotter toward the middle
    setColor(colors, idx, shell < 0.45 ? WARM_WHITE : BONE, rand, 0.07);
  }
}

/** ACT III — the same matter, torn into islands with real void between them. */
export function formationProblem(n, out, colors) {
  const rand = mulberry32(37);
  const islands = [
    [-5.8, 1.7, -1.4],
    [-2.1, -2.1, 0.8],
    [1.7, 2.2, -1.0],
    [5.2, -0.7, 1.1],
    [0.5, -2.9, -1.8],
  ];
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    const c = islands[i % islands.length];
    const r = 1.05 * Math.pow(rand(), 0.62);
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    out[idx] = c[0] + Math.cos(th) * s * r + gauss(rand) * 0.12;
    out[idx + 1] = c[1] + u * r * 0.85;
    out[idx + 2] = c[2] + Math.sin(th) * s * r;
    setColor(colors, idx, ASH, rand, 0.04);
  }
}

/**
 * ACT IV — AXON. A mountain with mass: particles fill the volume under a
 * heightfield, densest just beneath the surface, with the logo's ridges
 * carrying extra density so the silhouette reads without being "drawn".
 */
export function formationAxon(n, out, colors) {
  const rand = mulberry32(53);
  const noise = makeNoise(7);
  const fbm = (x, y) => {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let k = 0; k < 4; k++) {
      s += a * noise(x * f, y * f);
      norm += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  };

  // Three summits, matching the mark: one dominant, two shoulders.
  const peaks = [
    { x: 0, z: 0, h: 4.5, r: 2.5 },
    { x: -3.1, z: 0.5, h: 2.5, r: 1.9 },
    { x: 2.8, z: 0.4, h: 2.3, r: 1.8 },
  ];
  const heightAt = (x, z) => {
    let h = 0.42 * (fbm(x * 0.22, z * 0.22) * 0.5 + 0.5);
    for (const pk of peaks) {
      const d2 = (x - pk.x) ** 2 + (z - pk.z) ** 2;
      const sig = pk.r * 0.72;
      h += pk.h * Math.exp(-d2 / (2 * sig * sig));
    }
    // ridges: sharpen with a little erosion-ish detail
    return h * (0.86 + 0.28 * Math.abs(fbm(x * 0.5, z * 0.5)));
  };

  const SPAN = 8.2;
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    // Sample x/z biased toward the centre mass, then sit under the surface.
    const rr = Math.pow(rand(), 0.62) * SPAN;
    const th = rand() * Math.PI * 2;
    const x = Math.cos(th) * rr;
    const z = Math.sin(th) * rr * 0.62;
    const h = heightAt(x, z);
    // Density hugs the surface: most particles in the top slice of the column.
    const depth = Math.pow(rand(), 0.35);
    const y = h * depth - 2.4;

    out[idx] = x + gauss(rand) * 0.07;
    out[idx + 1] = y + gauss(rand) * 0.07;
    out[idx + 2] = z + gauss(rand) * 0.07;

    // Light gathers at altitude; the base stays in shadow.
    const alt = (y + 2.4) / 4.6;
    const c = alt > 0.82 ? EMBER_HOT : alt > 0.34 ? EMBER : ASH;
    setColor(colors, idx, c, rand, 0.06);
  }
}

/** ACT V — one memory, present as three separate volumes of light. */
export function formationEverywhere(n, out, colors) {
  const rand = mulberry32(71);
  const slabs = [
    [-5.6, 0.1, -1.2],
    [0, 0.25, 0.3],
    [5.6, 0.1, -1.2],
  ];
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    const s = slabs[i % slabs.length];
    // A soft rectangular volume, edges falling off rather than cut.
    out[idx] = s[0] + gauss(rand) * 1.35;
    out[idx + 1] = s[1] + gauss(rand) * 1.0;
    out[idx + 2] = s[2] + gauss(rand) * 0.45;
    // A shared seam of brighter matter runs through all three.
    const shared = Math.abs(out[idx + 1] - s[1]) < 0.34;
    setColor(colors, idx, shared ? WARM_WHITE : ASH, rand, shared ? 0.09 : 0.04);
  }
}

/** ACT VI — everything condenses into one small, dense, legible object. */
export function formationLanguage(n, out, colors) {
  const rand = mulberry32(97);
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    // A slab: wide, short, thin — an object you could pick up.
    const x = gauss(rand) * 1.55;
    const y = gauss(rand) * 0.85;
    const z = gauss(rand) * 0.24;
    out[idx] = x;
    out[idx + 1] = y;
    out[idx + 2] = z;
    // Brighter toward the centre plane so it reads as solid, not a cloud.
    const core = Math.abs(z) < 0.12 && Math.abs(y) < 0.62;
    setColor(colors, idx, core ? WARM_WHITE : BONE, rand, 0.07);
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

/**
 * Build every act's targets once, plus the per-particle attributes that stay
 * constant for the whole film (size, phase). Varying size is what stops the
 * cloud reading as a uniform dot screen.
 */
export function buildActBuffers(n) {
  const acts = ACTS.map((fn) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    fn(n, pos, col);
    return { pos, col };
  });

  const rand = mulberry32(1337);
  const sizes = new Float32Array(n);
  const phases = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Heavy tail: a few large motes carry the foreground, most are dust.
    const t = rand();
    sizes[i] = 0.5 + Math.pow(t, 3.2) * 5.5;
    phases[i] = rand() * Math.PI * 2;
  }
  return { acts, sizes, phases };
}

/** A static haze that never forms anything — it just gives the room depth. */
export function buildAtmosphere(n) {
  const rand = mulberry32(4242);
  const pos = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const phases = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * 3;
    pos[idx] = (rand() - 0.5) * 46;
    pos[idx + 1] = (rand() - 0.5) * 26;
    // pushed back so it parallaxes behind the subject
    pos[idx + 2] = -6 - rand() * 30;
    sizes[i] = 0.4 + Math.pow(rand(), 2.5) * 2.6;
    phases[i] = rand() * Math.PI * 2;
  }
  return { pos, sizes, phases };
}
