/**
 * The physical sets. Everything here is a milled object in a black studio —
 * no holographic panels, no floating cards, no network diagrams.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildPlateBody, PLATE_THICKNESS } from './plate';
import { SET_B, SET_C, SET_D } from './shots';

/* ── shared materials ─────────────────────────────────────────── */

const GRAPHITE = {
  color: '#17181b',
  metalness: 0.94,
  roughness: 0.52,
  envMapIntensity: 1.1,
};

/**
 * Laser-etched label. Drawn as an alpha mask and applied to a slightly
 * rougher, darker patch sitting flush in the dock face — the way a real
 * etched mark catches light differently from the surface around it.
 */
function makeEtchTexture(label) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = '#fff';
  ctx.font = '600 46px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // letterspacing by hand — canvas has no tracking control worth trusting
  const text = label.toUpperCase();
  const spacing = 7;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (text.length - 1);
  let x = 256 - total / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x + widths[i] / 2, 66);
    x += widths[i] + spacing;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/* ── shot 04 — fragments seating into the plate ───────────────── */

export function Fragments({ progress = 0 }) {
  const geo = useMemo(() => buildPlateBody(), []);
  const seats = useMemo(
    () => [
      { from: [-2.6, 1.1, -1.4], rot: [0.4, 0.9, 0.2] },
      { from: [2.4, -0.9, -1.9], rot: [-0.3, -0.6, 0.4] },
      { from: [-1.9, -1.6, 1.5], rot: [0.6, 0.3, -0.5] },
      { from: [2.1, 1.4, 1.2], rot: [-0.5, 0.8, 0.3] },
      { from: [0.2, 2.2, -1.1], rot: [0.9, -0.4, 0.1] },
    ],
    [],
  );

  return (
    <group>
      {seats.map((s, i) => {
        // Staggered so five pieces arrive one at a time and stay readable —
        // never a swarm.
        const local = THREE.MathUtils.clamp((progress - i * 0.13) / 0.55, 0, 1);
        const e = 1 - Math.pow(1 - local, 3);
        const p = [
          THREE.MathUtils.lerp(s.from[0], 0, e),
          THREE.MathUtils.lerp(s.from[1], 0, e),
          THREE.MathUtils.lerp(s.from[2], 0, e),
        ];
        const scale = THREE.MathUtils.lerp(0.34, 0.06, e);
        return (
          <mesh
            key={i}
            geometry={geo}
            position={p}
            rotation={[s.rot[0] * (1 - e), s.rot[1] * (1 - e), s.rot[2] * (1 - e)]}
            scale={scale}
            visible={local < 0.99}
          >
            <meshStandardMaterial {...GRAPHITE} roughness={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

/* ── shot 05 — the Core ───────────────────────────────────────── */

export function Core({ visible = true }) {
  const ref = useRef(null);
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1.35, 1);
    // Flat-shaded facets: the Core is an assembly of plates, so it must never
    // read as a smooth sphere.
    return g.toNonIndexed();
  }, []);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.055;
  });

  return (
    <group ref={ref} visible={visible}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial {...GRAPHITE} flatShading roughness={0.44} />
      </mesh>
      {/* a second, slightly larger shell of open facets so the silhouette
          breaks up and never resolves fully in one view */}
      <mesh geometry={geo} scale={1.13}>
        <meshStandardMaterial
          {...GRAPHITE}
          flatShading
          transparent
          opacity={0.32}
          side={THREE.DoubleSide}
          roughness={0.7}
        />
      </mesh>
    </group>
  );
}

/* ── shots 06 / 07 / 10 — the device ──────────────────────────── */

/**
 * A physical phone. The screen takes a texture: when the real product
 * screenshot is supplied it goes here. Until then the screen stays a plain
 * dark surface — this deliberately does NOT fake an interface.
 */
export function Device({ screenTexture = null, screenBrightness = 1, visible = true }) {
  const bodyGeo = useMemo(() => new THREE.BoxGeometry(1.02, 2.06, 0.1), []);

  return (
    <group position={SET_B} visible={visible}>
      <mesh geometry={bodyGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#141518" metalness={0.98} roughness={0.34} envMapIntensity={1.3} />
      </mesh>
      <mesh position={[0, 0, 0.051]}>
        <planeGeometry args={[0.94, 1.98]} />
        {screenTexture ? (
          <meshBasicMaterial map={screenTexture} toneMapped={false} opacity={screenBrightness} transparent />
        ) : (
          <meshBasicMaterial color="#05060a" toneMapped={false} />
        )}
      </mesh>
    </group>
  );
}

/* ── shot 08 — the three docks ────────────────────────────────── */

const DOCK_LABELS = ['ChatGPT', 'Claude', 'Gemini'];

function Dock({ index, label, seated }) {
  const etch = useMemo(() => makeEtchTexture(label), [label]);
  const x = SET_C[0] + (index - 1) * 3.1;

  return (
    <group position={[x, 0, SET_C[2]]}>
      {/* a shallow machined alcove — the plate seats into it */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.9, 1.5, 0.42]} />
        <meshStandardMaterial {...GRAPHITE} roughness={0.58} />
      </mesh>
      {/* the recess itself, darker and rougher than the face */}
      <mesh position={[0, 0.12, 0.215]}>
        <boxGeometry args={[0.92, 0.86, 0.06]} />
        <meshStandardMaterial color="#0b0c0e" metalness={0.9} roughness={0.75} />
      </mesh>
      {/* etched identifier, flush in the face below the recess */}
      <mesh position={[0, -0.5, 0.212]}>
        <planeGeometry args={[1.15, 0.29]} />
        <meshStandardMaterial
          color="#3c3e44"
          metalness={0.85}
          roughness={0.85}
          alphaMap={etch}
          transparent
        />
      </mesh>
      {/* one practical per alcove, warm and low */}
      <pointLight position={[0, 0.1, 0.9]} intensity={seated ? 1.6 : 0.5} distance={3.2} color="#ffb974" />
    </group>
  );
}

export function Docks({ visible = true, seatedIndex = -1 }) {
  return (
    <group visible={visible}>
      {DOCK_LABELS.map((l, i) => (
        <Dock key={l} index={i} label={l} seated={seatedIndex === i} />
      ))}
    </group>
  );
}

/* ── shot 09 — the archive ────────────────────────────────────── */

/**
 * Stored memories receding into black. Bodies only, each with a single small
 * amber slot — at this distance the channel network is not readable, and
 * pretending otherwise would just add noise.
 */
export function Archive({ visible = true, gather = 0 }) {
  const geo = useMemo(() => buildPlateBody(), []);
  const items = useMemo(() => {
    const rand = (() => {
      let s = 20260810;
      return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    })();
    return Array.from({ length: 16 }, () => ({
      from: [(rand() - 0.5) * 16, (rand() - 0.5) * 9, SET_D[2] - rand() * 22],
      rot: [rand() * 3, rand() * 3, rand() * 3],
      scale: 0.5 + rand() * 0.5,
    }));
  }, []);

  return (
    <group visible={visible}>
      {items.map((it, i) => {
        const e = 1 - Math.pow(1 - THREE.MathUtils.clamp(gather, 0, 1), 3);
        const target = [SET_D[0], SET_D[1], SET_D[2] + 1.2];
        const p = [
          THREE.MathUtils.lerp(it.from[0], target[0], e * 0.86),
          THREE.MathUtils.lerp(it.from[1], target[1], e * 0.86),
          THREE.MathUtils.lerp(it.from[2], target[2], e * 0.86),
        ];
        return (
          <group key={i} position={p} rotation={it.rot} scale={it.scale}>
            <mesh geometry={geo}>
              <meshStandardMaterial {...GRAPHITE} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0, PLATE_THICKNESS / 2 + 0.006]}>
              <planeGeometry args={[0.03, 0.44]} />
              <meshBasicMaterial color="#ffb02e" toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
