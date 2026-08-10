/**
 * The single point cloud that carries the whole film. It never re-mounts —
 * it only interpolates between the act formations, so the audience reads one
 * continuous body of information reorganising itself.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildActBuffers } from './formations';

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function MorphPoints({ progressRef, count = 9000, reducedMotion = false }) {
  const geoRef = useRef(null);
  const matRef = useRef(null);

  const { acts, positions, colors, drift, glow } = useMemo(() => {
    const acts = buildActBuffers(count);
    // Start on act 0 so the first paint is already composed.
    const positions = new Float32Array(acts[0].pos);
    const colors = new Float32Array(acts[0].col);
    const drift = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) drift[i] = Math.random() * Math.PI * 2;
    return { acts, positions, colors, drift, glow: makeGlowTexture() };
  }, [count]);

  useFrame(({ clock }) => {
    const geo = geoRef.current;
    if (!geo) return;

    // progress runs 0 .. acts.length-1 across the scrolled film.
    const p = THREE.MathUtils.clamp(progressRef.current, 0, acts.length - 1 - 1e-4);
    const i0 = Math.floor(p);
    const i1 = Math.min(acts.length - 1, i0 + 1);
    const t = easeInOut(p - i0);

    const a = acts[i0];
    const b = acts[i1];
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const time = clock.elapsedTime;
    // A slow breath keeps the cloud alive between acts without smearing it.
    const amp = reducedMotion ? 0 : 0.035;

    for (let i = 0; i < pos.length; i++) {
      const base = a.pos[i] + (b.pos[i] - a.pos[i]) * t;
      pos[i] = base + Math.sin(time * 0.5 + drift[i]) * amp;
      col[i] = a.col[i] + (b.col[i] - a.col[i]) * t;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    if (matRef.current) {
      matRef.current.opacity = 0.62 + 0.12 * Math.sin(time * 0.9);
    }
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        vertexColors
        size={0.055}
        sizeAttenuation
        map={glow}
        transparent
        opacity={0.7}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
