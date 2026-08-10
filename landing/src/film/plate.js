/**
 * Geometry for the memory plate — the film's recurring protagonist.
 *
 * One memory is one facet of the AXON Core. The plate is milled, not glowing:
 * a graphite-anodised titanium body whose only light lives in a recessed
 * channel network cut into its face. That channel network is the AXON summit
 * seen straight on, which is what lets the final shot resolve the object into
 * the mark without inventing anything new.
 *
 * Built procedurally so the exact same geometry is used in every shot — the
 * plate must be visually identical from its first appearance to the last.
 */
import * as THREE from 'three';

/** Irregular pentagon — a facet lifted off the Core, not a regular polygon. */
const OUTLINE = [
  [0.02, 0.56],
  [0.54, 0.2],
  [0.36, -0.46],
  [-0.32, -0.5],
  [-0.55, 0.14],
];

export const PLATE_THICKNESS = 0.13;

/**
 * The summit path, in plate-local space. Same three-peak geometry as the mark:
 * one dominant apex, two shoulders, and the triangulation bands beneath.
 * Ordered so cumulative length runs outward from the seat at the base — the
 * "gathering" fill then reads as context arriving from where it docks.
 */
const SUMMIT = [
  // base spine outward
  [[0.0, -0.34], [0.0, -0.08]],
  [[0.0, -0.08], [0.0, 0.26]],
  // main apex flanks
  [[0.0, 0.26], [-0.19, -0.16]],
  [[0.0, 0.26], [0.19, -0.16]],
  // shoulders
  [[-0.19, -0.16], [-0.3, 0.02]],
  [[-0.3, 0.02], [-0.38, -0.28]],
  [[0.19, -0.16], [0.29, 0.0]],
  [[0.29, 0.0], [0.37, -0.28]],
  // triangulation bands
  [[-0.19, -0.16], [0.0, -0.08]],
  [[0.19, -0.16], [0.0, -0.08]],
  [[-0.3, -0.3], [-0.12, -0.24]],
  [[-0.12, -0.24], [0.12, -0.24]],
  [[0.12, -0.24], [0.3, -0.3]],
];

export function buildPlateBody() {
  const shape = new THREE.Shape();
  OUTLINE.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: PLATE_THICKNESS,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.022,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 1,
  });
  // Centre it so rotation happens about the plate, not its corner.
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * The channel network, as thin ribbons sitting just proud of the front face.
 * Each vertex carries `aT`: normalised distance along the path from the seat.
 * The material thresholds against that, so the channels fill progressively
 * rather than switching on all at once.
 */
export function buildPlateChannels() {
  const width = 0.016;
  const z = PLATE_THICKNESS / 2 + 0.004;

  // Cumulative length gives each segment its place in the fill order.
  const lengths = SUMMIT.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lengths.reduce((s, l) => s + l, 0);

  const positions = [];
  const ts = [];
  let travelled = 0;

  SUMMIT.forEach(([a, b], i) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = lengths[i] || 1e-6;
    // Perpendicular, for ribbon width.
    const nx = (-dy / len) * width;
    const ny = (dx / len) * width;

    const t0 = travelled / total;
    const t1 = (travelled + len) / total;
    travelled += len;

    // Two triangles per segment.
    const p = [
      [a[0] + nx, a[1] + ny, t0],
      [a[0] - nx, a[1] - ny, t0],
      [b[0] + nx, b[1] + ny, t1],
      [b[0] - nx, b[1] - ny, t1],
    ];
    const tri = [p[0], p[1], p[2], p[1], p[3], p[2]];
    tri.forEach(([x, y, t]) => {
      positions.push(x, y, z);
      ts.push(t);
    });
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
  return geo;
}

/**
 * Channel material. `uFill` is how far the light has travelled from the seat,
 * `uColor` carries the state, `uIntensity` the flare. Deliberately unlit —
 * this is light escaping a recess, not a surface that glows.
 */
export const channelVertex = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const channelFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uFill;
  uniform float uIntensity;
  varying float vT;

  void main() {
    // Hard-ish leading edge with a short falloff, the way light spreads along
    // a machined slot rather than fading like a gradient.
    float lit = smoothstep(uFill, uFill - 0.06, vT);
    if (lit <= 0.001) discard;
    gl_FragColor = vec4(uColor * uIntensity, lit);
  }
`;

/** The five states from the production bible, as colour + intensity. */
export const PLATE_STATES = {
  dormant: { color: new THREE.Color('#2a1c07'), intensity: 0.4 },
  gathering: { color: new THREE.Color('#c07b12'), intensity: 1.5 },
  complete: { color: new THREE.Color('#ffb02e'), intensity: 2.2 },
  transit: { color: new THREE.Color('#5b93e6'), intensity: 2.6 },
  recalled: { color: new THREE.Color('#fff2d6'), intensity: 4.2 },
};
