/**
 * Opening the Core.
 *
 * The crystal was standing at full size behind every panel, which made it
 * wallpaper — and unreadable wallpaper at that. Dimming it would have solved
 * the legibility and thrown away the idea.
 *
 * Rebuilt per Luka's step-by-step (5 numbered steps, screenshot 2026-08-16):
 *   1. Clicking "+Connect Source" / "View Constellation" starts the sequence.
 *   2. Six adjacent panels release together, subtly — "like watching a real
 *      spaceship release a panel" — not one plate doing all the work.
 *   3. The Core itself turns so the opening those six panels left faces the
 *      viewer square on.
 *   4. The camera's view moves all the way through that opening, into the
 *      Core.
 *   5. End state: the screen is fully and only the galaxy background — no
 *      crystal, no box, nothing "SaaS" left on screen.
 *
 * Driven entirely through refs — a per-frame setState here would re-render
 * the whole scene sixty times a second, which is what dropped the film to a
 * crawl the first time round.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Where on the Core the hatch opens, in the Core's own local (unrotated)
// space. The six panels cluster around this point, and step 3 turns the
// whole shell so this exact direction ends up facing the camera (+Z).
const RELEASE_DIR = new THREE.Vector3(0.3, 0.15, 0.94).normalize();
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);
const IDLE_QUAT = new THREE.Quaternion();
const TARGET_QUAT = new THREE.Quaternion().setFromUnitVectors(RELEASE_DIR, WORLD_FORWARD);

const PANEL_COUNT = 6;

// Six local offsets in a small ring around RELEASE_DIR, each with its own
// release delay so the cluster reads as six independent plates letting go
// in sequence, not one plate stamped six times in lockstep.
const PANEL_LAYOUT = (() => {
  const up = new THREE.Vector3(0, 1, 0);
  const basis1 = new THREE.Vector3().crossVectors(RELEASE_DIR, up).normalize();
  const basis2 = new THREE.Vector3().crossVectors(RELEASE_DIR, basis1).normalize();
  return Array.from({ length: PANEL_COUNT }).map((_, i) => {
    const angle = (i / PANEL_COUNT) * Math.PI * 2;
    const ring = 0.62;
    const offset = basis1.clone().multiplyScalar(Math.cos(angle) * ring)
      .add(basis2.clone().multiplyScalar(Math.sin(angle) * ring));
    return {
      offset,
      delay: (i / PANEL_COUNT) * 0.18,
      spin: (i % 2 === 0 ? 1 : -1) * (0.15 + 0.1 * (i / PANEL_COUNT)),
    };
  });
})();

/**
 * Wraps the Core. `open` runs 0 (closed, centred, full size, idle-spinning)
 * to 1 (turned to face the release point at the viewer, withdrawn, faded
 * out — leaving only the galaxy).
 */
export default function CorePortal({ open = false, children, baseScale = 1 }) {
  const shell = useRef(null);
  const panelRefs = useRef([]);
  const panelMatRefs = useRef([]);
  const t = useRef(0);

  const plateGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.5, 3);
    g.rotateZ(Math.PI / 6);
    return g;
  }, []);

  useFrame((state, dt) => {
    const want = open ? 1 : 0;
    // A much longer journey than the old single-panel version (turn + dive +
    // fade, not just a panel sliding out), so both directions are slower.
    // Opening still earns more time than closing, same as before.
    const speed = open ? 0.5 : 1.3;
    t.current += (want - t.current) * Math.min(1, dt * speed * 2);
    const e = THREE.MathUtils.clamp(t.current, 0, 1);
    const eased = EASE(e);

    if (shell.current) {
      // Step 3: turn the whole Core so RELEASE_DIR faces the camera.
      shell.current.quaternion.slerpQuaternions(IDLE_QUAT, TARGET_QUAT, eased);
      // Step 5: withdraw, shrink and finally disappear — by the time it
      // hides, the camera dolly (Landing.jsx) has already carried the
      // viewer's frame past it, so this reads as arriving in open space
      // rather than a crystal popping out of existence.
      shell.current.position.z = -11 * eased;
      shell.current.scale.setScalar(baseScale * Math.max(0.02, 1 - 0.94 * eased));
      shell.current.visible = eased < 0.985;
    }

    // Step 2: six panels release together around RELEASE_DIR, staggered.
    for (let i = 0; i < PANEL_COUNT; i++) {
      const panel = panelRefs.current[i];
      const mat = panelMatRefs.current[i];
      if (!panel || !mat) continue;

      const layout = PANEL_LAYOUT[i];
      const local = THREE.MathUtils.clamp((e - layout.delay) / (1 - layout.delay), 0, 1);
      const pe = EASE(local);

      const start = RELEASE_DIR.clone().multiplyScalar(1.9)
        .add(layout.offset.clone().multiplyScalar(0.3));
      const end = RELEASE_DIR.clone().multiplyScalar(2.05 + 3.2 * pe)
        .add(layout.offset.clone().multiplyScalar(0.3 + 0.55 * pe));

      panel.position.lerpVectors(start, end, pe);
      panel.rotation.set(
        -0.5 * (1 - pe) + layout.spin * pe,
        0.7 * (1 - pe),
        0.22 * (1 - pe) + layout.spin * 0.5 * pe,
      );
      panel.scale.setScalar(1 + 1.3 * pe);
      // Thins out as it arrives, handing the frame to what's behind it —
      // same "present only mid-flight" behavior as the original single panel.
      panel.visible = pe > 0.004 && pe < 0.997;
      mat.opacity = Math.sin(Math.PI * Math.min(pe, 0.999)) * 0.5;
    }
  });

  return (
    <group>
      <group ref={shell} scale={baseScale}>
        {children}
      </group>

      {PANEL_LAYOUT.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { panelRefs.current[i] = el; }}
          geometry={plateGeo}
          visible={false}
        >
          <meshPhysicalMaterial
            ref={(el) => { panelMatRefs.current[i] = el; }}
            color="#2b2d33"
            metalness={0.78}
            roughness={0.3}
            clearcoat={0.6}
            clearcoatRoughness={0.22}
            envMapIntensity={2.1}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
