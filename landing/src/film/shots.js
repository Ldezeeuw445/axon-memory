/**
 * The twelve shots as data.
 *
 * The film is one space, not twelve scenes. Four sets sit at fixed places in
 * the world and the camera travels between them; the plate is carried along
 * rather than cut to a new position. Nothing teleports — if the plate is
 * somewhere else, we watched it go.
 *
 *   SET A   origin        emergence, convergence, the Core, the final mark
 *   SET B   x = +7        the device — app entry, the memory, the answer
 *   SET C   x = +15       the three docks
 *   SET D   z = -26       the archive, reached by pushing through the screen
 */

export const SET_B = [7, 0, 0];
export const SET_C = [15, 0, -1];
export const SET_D = [0, 0, -26];

/**
 * medium: 'video' shots are DOM plates over the canvas; everything else is
 * rendered. 'ui' shots put the real product on the device screen.
 */
export const SHOTS = [
  {
    id: 1,
    name: 'The world before AXON',
    medium: 'video',
    cam: [0, 0.3, 6.5],
    look: [0, 0, 0],
    plate: null,
  },
  {
    id: 2,
    name: 'Fragmented memory',
    medium: 'video',
    cam: [0, 0.3, 6],
    look: [0, 0, 0],
    plate: null,
  },
  {
    id: 3,
    name: 'A memory becomes physical',
    medium: '3d',
    cam: [0.4, 0.25, 3.2],
    look: [0, 0, 0],
    // The pivot pose: centred, face square to camera. Every later join
    // returns to this attitude so the cut disappears.
    plate: { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, state: 'gathering', fill: 0.35 },
  },
  {
    id: 4,
    name: 'Memory convergence',
    medium: '3d',
    cam: [2.4, 0.7, 2.4],
    look: [0, 0, 0],
    plate: { pos: [0, 0, 0], rot: [0, 0.7, 0], scale: 1, state: 'gathering', fill: 1 },
    fragments: true,
  },
  {
    id: 5,
    name: 'AXON Memory',
    medium: '3d',
    cam: [3.6, 1.2, 3.6],
    look: [0, 0, 0],
    // Seated in the Core, still identifiable — its channel geometry is the
    // only one on the assembly.
    plate: { pos: [0, 0.62, 1.15], rot: [0.2, 0, 0], scale: 1, state: 'complete', fill: 1 },
    core: true,
  },
  {
    id: 6,
    name: 'Memory enters the app',
    medium: '3d',
    cam: [SET_B[0], 0.2, 3.4],
    look: SET_B,
    plate: { pos: [SET_B[0], 0.1, 0.9], rot: [0, 0, 0], scale: 0.75, state: 'complete', fill: 1 },
    device: true,
  },
  {
    id: 7,
    name: 'The memory',
    medium: 'ui',
    cam: [SET_B[0] + 0.35, 0.05, 2.1],
    look: [SET_B[0], 0, 0],
    // Absorbed into the screen — present as content, not as an object.
    plate: null,
    device: true,
  },
  {
    id: 8,
    name: 'Memory travels',
    medium: '3d',
    cam: [SET_C[0], 0.5, 4.2],
    look: SET_C,
    plate: { pos: [SET_C[0], 0.05, 0.35], rot: [0, 0, 0], scale: 0.7, state: 'transit', fill: 1 },
    docks: true,
  },
  {
    id: 9,
    name: 'Recall',
    medium: '3d',
    cam: [SET_D[0], 0.2, SET_D[2] + 5.5],
    look: SET_D,
    plate: { pos: [SET_D[0], 0, SET_D[2] + 1.2], rot: [0, 0.2, 0], scale: 0.8, state: 'complete', fill: 1 },
    archive: true,
  },
  {
    id: 10,
    name: 'The answer',
    medium: 'ui',
    cam: [SET_B[0], 0, 2.4],
    look: [SET_B[0], 0, 0],
    plate: null,
    device: true,
    // The single flare in the entire film.
    flare: true,
  },
  {
    id: 11,
    name: 'The ecosystem',
    medium: '3d',
    cam: [SET_B[0] + 4, 3.4, 9.5],
    look: [SET_B[0] + 3, 0, -0.5],
    plate: { pos: [SET_B[0] + 3, 0.4, 1.4], rot: [0, 0.5, 0], scale: 0.6, state: 'complete', fill: 1 },
    device: true,
    docks: true,
  },
  {
    id: 12,
    name: 'AXON',
    medium: '3d',
    cam: [0, 0, 2.6],
    look: [0, 0, 0],
    // Back to the pivot pose it first held in shot 03. The channel network is
    // the summit, seen straight on.
    plate: { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1.15, state: 'complete', fill: 1 },
  },
];

export const SHOT_COUNT = SHOTS.length;

/** Which caption belongs to which shot — the six approved acts, unchanged. */
export const SHOT_TO_ACT = [0, 0, 1, 1, 1, 2, 2, 3, 4, 4, 5, 5];
