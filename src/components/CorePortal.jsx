/**
 * Opening the Core.
 *
 * The crystal was standing at full size behind every panel, which made it
 * wallpaper — and unreadable wallpaper at that. Dimming it would have solved
 * the legibility and thrown away the idea.
 *
 * Instead it becomes the mechanism. Choosing a facet detaches a single panel
 * from the shell: it releases, turns to face the viewer and travels forward
 * while the rest of the Core withdraws behind it. The content appears where
 * that panel opened. One memory is one facet of the Core, so the panel you
 * open is literally the thing you are opening.
 *
 * Driven entirely through refs — a per-frame setState here would re-render the
 * whole scene sixty times a second, which is what dropped the film to a crawl
 * the first time round.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Wraps the Core. `open` runs 0 (closed, centred, full size) to 1 (withdrawn,
 * with one panel released toward the viewer).
 */
export default function CorePortal({ open = false, children, baseScale = 1 }) {
  const shell = useRef(null);
  const panel = useRef(null);
  const panelMat = useRef(null);
  const t = useRef(0);

  // The released panel: a facet-sized plate that starts flush on the shell and
  // ends between the Core and the camera, square to the view.
  const plateGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.92, 3);
    g.rotateZ(Math.PI / 6);
    return g;
  }, []);

  useFrame((state, dt) => {
    const want = open ? 1 : 0;
    // Opening is slower than closing: the reveal earns the time, the return
    // should not make the viewer wait.
    const speed = open ? 1.25 : 2.0;
    t.current += (want - t.current) * Math.min(1, dt * speed * 2);
    const e = EASE(THREE.MathUtils.clamp(t.current, 0, 1));

    if (shell.current) {
      // The Core withdraws rather than fades — it stays present as the thing
      // the panel came out of, just no longer competing with the content.
      shell.current.position.z = -7.4 * e;
      shell.current.position.x = 1.6 * e;
      shell.current.scale.setScalar(baseScale * (1 - 0.46 * e));
    }

    if (panel.current && panelMat.current) {
      panel.current.visible = e > 0.004;
      // Out of the shell and forward, arriving just short of the camera.
      panel.current.position.set(0.55 * e, 0.15 * e, 2.05 + 3.9 * e);
      panel.current.scale.setScalar(1 + 2.5 * e);
      // Turns square to the viewer as it comes.
      panel.current.rotation.set(-0.5 * (1 - e), 0.7 * (1 - e), 0.22 * (1 - e));
      // Thins out as it arrives, handing the frame to the panel behind it.
      panelMat.current.opacity = Math.sin(Math.PI * Math.min(e, 0.999)) * 0.5;
    }
  });

  return (
    <group>
      <group ref={shell} scale={baseScale}>
        {children}
      </group>

      <mesh ref={panel} geometry={plateGeo} visible={false}>
        <meshPhysicalMaterial
          ref={panelMat}
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
    </group>
  );
}
