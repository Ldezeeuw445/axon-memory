/**
 * Entering the Core.
 *
 * The old CorePortal treated a facet as a page: one plate peeled off, the Core
 * withdrew sideways, and a panel appeared. It was a transition between screens
 * wearing a 3D costume — and it left the Core parked behind the content, which
 * is why the crystal ended up sitting on top of the dashboard text.
 *
 * This is the opposite. Nothing is swapped. The Core unlocks six of its own
 * plates, they drift off and leave a hole, the shell turns that hole toward the
 * viewer, waits, and then the camera travels forward and passes through it. The
 * Core does not move aside and it is not hidden at the end: it ends up behind
 * the camera, because the camera went through it. That is the whole illusion —
 * the user has entered somewhere, rather than opened something.
 *
 * Every phase is deliberately slower than a UI animation would be. The first
 * second is almost still on purpose: mass does not respond instantly, and the
 * pause before the camera moves is what makes the opening readable as an
 * invitation rather than a cut.
 */
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Seconds. The shape of the sequence matters more than the exact numbers, but
// the proportions do not survive being shortened — halve these and it reads as
// a whoosh, which is the one thing it must not be.
export const GATEWAY_DURATION = 11.0;

const T = {
  react: [1.0, 2.0],    // the Core notices
  release: [2.0, 4.5],  // six plates unlock and drift
  turn: [4.5, 5.5],     // the opening comes around to face the viewer
  hold: [5.5, 6.2],     // stillness, so the eye can read what happened
  travel: [6.2, 9.5],   // the camera moves, slowly at first
  arrive: [9.5, 11.0],  // the galaxy opens out
};

const span = ([a, b], t) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * `active` starts the journey and holds the far side; dropping it plays the
 * return. `onProgress` reports 0..1 each frame so the shell can bring its
 * spatial content in as the camera arrives, instead of after a hard cut.
 */
export default function CoreGateway({ active, children, onApertureChange, onProgress, baseScale = 1 }) {
  const { camera } = useThree();
  const shell = useRef(null);
  // Already inside on mount means the viewer arrived by link — an OAuth
  // callback landing on ?facet=connections, say. Playing the journey there
  // would make them sit out eleven seconds of cinema to find out whether their
  // connection worked. The journey is for people who chose to take it.
  const t = useRef(active ? GATEWAY_DURATION : 0);
  const restZ = useRef(null);
  const lastAperture = useRef(0);

  useFrame((_, delta) => {
    if (restZ.current === null) restZ.current = camera.position.z;

    // Time, not lerp-toward-target: a timeline is the only way phases can be
    // sequenced and read. Returning runs it backwards at roughly double speed,
    // because a viewer who has changed their mind should not have to wait out
    // a cinematic they have already seen.
    const dir = active ? 1 : -2.2;
    t.current = THREE.MathUtils.clamp(t.current + delta * dir, 0, GATEWAY_DURATION);
    const time = t.current;

    const aperture = span(T.release, time);
    if (Math.abs(aperture - lastAperture.current) > 0.001) {
      lastAperture.current = aperture;
      onApertureChange?.(aperture);
    }

    // The Core is a fixed object in space for the whole sequence. It never
    // advances on the camera; only the camera moves. Keeping this at a constant
    // z is what makes the passage feel like travel rather than a zoom.
    if (shell.current) {
      const react = span(T.react, time);
      // A breath inward as it unlocks — the only thing the Core itself does.
      shell.current.scale.setScalar(baseScale * (1 - easeInOut(react) * 0.012));
    }

    // Camera. Starts at rest, creeps, then carries through the opening and out
    // the other side. The Core sits at z = 0, so anything past it is behind the
    // viewer by definition.
    const travel = span(T.travel, time);
    const through = span([T.travel[0], T.arrive[1]], time);
    // Cubic-in for the approach: genuinely near-stationary for the first
    // second, so the movement is felt starting rather than seen already moving.
    const approach = travel * travel * travel * 0.55 + easeInOut(through) * 0.45;
    camera.position.z = THREE.MathUtils.lerp(restZ.current, -14, approach);

    // Slight drift so the passage is not a rail. Falls away as the camera
    // arrives, leaving the far side steady.
    const drift = Math.sin(time * 0.35) * 0.12 * (1 - through);
    camera.position.x = drift;
    camera.position.y = drift * 0.4;
    // Ten units ahead, always. At rest that happens to be the Core at the
    // origin; past it, it is open space — so the viewer comes out the far side
    // facing forward, with the Core behind them, instead of being turned round
    // to look back at what they just went through.
    camera.lookAt(0, 0, camera.position.z - 10);

    onProgress?.(time / GATEWAY_DURATION);
  });

  return <group ref={shell} scale={baseScale}>{children}</group>;
}
