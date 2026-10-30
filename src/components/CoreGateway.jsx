/**
 * Entering the Core / settling in memory-space.
 *
 * Historically the camera dove fully through the Core (z → -14) so only stars
 * remained behind a matte facet panel. Luka's direction: the galaxy IS the app;
 * you never leave memory-space. The far side now parks the camera just in front
 * of the Core, looking slightly up past it into the void — so the sphere crowns
 * the top of the frame while floating glass cards sit on the stars below.
 *
 * Facet switches keep this pose and only nudge a soft parallax offset; they do
 * not remount the scene or replay the journey.
 */
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const GATEWAY_DURATION = 11.0;

const T = {
  react: [1.0, 2.0],
  release: [2.0, 4.5],
  turn: [4.5, 5.5],
  hold: [5.5, 6.2],
  travel: [6.2, 9.5],
  arrive: [9.5, 11.0],
};

const span = ([a, b], t) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Far-side pose: Core peeks at the top; stars fill the rest. */
const FAR = { z: 4.6, y: -1.05, lookY: 2.55, lookZ: -3.5 };

/**
 * `active` starts the journey and holds the far side; dropping it plays the
 * return. `parallax` (≈ -1..1) is a soft lateral nudge between facets.
 * `onProgress` reports 0..1 and whether content may settle in.
 */
export default function CoreGateway({
  active,
  children,
  apertureRef,
  onProgress,
  baseScale = 1,
  startAt,
  parallax = 0,
  reduceMotion = false,
}) {
  const { camera } = useThree();
  const shell = useRef(null);
  const t = useRef(startAt ?? (active ? GATEWAY_DURATION : 0));
  if (apertureRef && apertureRef.current === 0 && (active || startAt)) apertureRef.current = 1;
  const restZ = useRef(null);
  const para = useRef(parallax);
  para.current = parallax;

  useFrame((_, delta) => {
    if (restZ.current === null) restZ.current = camera.position.z;

    // Reduced motion: snap to the pose, no cinematic timeline.
    if (reduceMotion) {
      const on = !!active;
      t.current = on ? GATEWAY_DURATION : 0;
      camera.position.z = on ? FAR.z : restZ.current;
      camera.position.y = on ? FAR.y : 0;
      camera.position.x = on ? para.current * 0.35 : 0;
      camera.lookAt(0, on ? FAR.lookY : 0, on ? FAR.lookZ : camera.position.z - 10);
      if (apertureRef) apertureRef.current = on ? 1 : 0;
      if (shell.current) shell.current.scale.setScalar(baseScale);
      onProgress?.(on ? 1 : 0, on);
      return;
    }

    const dir = active ? 1 : -2.2;
    t.current = THREE.MathUtils.clamp(t.current + delta * dir, 0, GATEWAY_DURATION);
    const time = t.current;

    if (apertureRef) apertureRef.current = span(T.release, time);

    if (shell.current) {
      const react = span(T.react, time);
      shell.current.scale.setScalar(baseScale * (1 - easeInOut(react) * 0.012));
    }

    const travel = span(T.travel, time);
    const through = span([T.travel[0], T.arrive[1]], time);
    const approach = travel * travel * travel * 0.55 + easeInOut(through) * 0.45;

    camera.position.z = THREE.MathUtils.lerp(restZ.current, FAR.z, approach);
    camera.position.y = THREE.MathUtils.lerp(0, FAR.y, approach);

    const drift = Math.sin(time * 0.35) * 0.12 * (1 - through);
    // Soft facet parallax eases in with arrival so tab switches feel like a glance.
    const targetPara = para.current * 0.45 * approach;
    camera.position.x = drift + targetPara;

    const lookY = THREE.MathUtils.lerp(0, FAR.lookY, approach);
    const lookZ = THREE.MathUtils.lerp(camera.position.z - 10, FAR.lookZ, approach);
    camera.lookAt(0, lookY, lookZ);

    // Content may settle once the camera is mostly in memory-space.
    const settled = approach > 0.42;
    onProgress?.(time / GATEWAY_DURATION, settled);
  });

  return <group ref={shell} scale={baseScale}>{children}</group>;
}
