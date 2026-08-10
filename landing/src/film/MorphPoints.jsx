/**
 * The single body of matter that carries the whole film. It never re-mounts —
 * it only interpolates between the act formations.
 *
 * Rendering is a custom shader rather than PointsMaterial, because the three
 * things that make this read as photographed rather than plotted all need
 * per-particle control:
 *
 *   1. size varies per particle (a few large foreground motes, mostly dust)
 *   2. a circle-of-confusion term swells and dims particles away from the
 *      focal plane, which is what depth of field actually does to a highlight
 *   3. brightness falls off with distance, so the far side sinks into the void
 *
 * Blue never lives in the palette. It arrives only through uPulse, at the two
 * moments in the film that earn it.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildActBuffers, buildAtmosphere } from './formations';

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uNear;
  uniform float uFar;
  uniform float uDrift;
  uniform float uScale;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vCoc;

  void main() {
    vec3 p = position;
    // A slow, incoherent breath. Never enough to smear a formation.
    p += vec3(
      sin(uTime * 0.31 + aPhase),
      cos(uTime * 0.27 + aPhase * 1.7),
      sin(uTime * 0.19 + aPhase * 0.6)
    ) * uDrift;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;

    // Circle of confusion: 0 at the focal plane, growing either side of it.
    float coc = clamp(abs(dist - uFocus) / max(uFocus, 0.001) * uAperture, 0.0, 1.0);

    // Out-of-focus highlights get bigger AND dimmer — energy is conserved,
    // which is exactly why real bokeh never looks like glowing dots.
    gl_PointSize = aSize * uScale * uPixelRatio * (1.0 + coc * 6.5) * (140.0 / max(dist, 0.001));

    vAlpha = 1.0 / (1.0 + coc * 8.0);
    vAlpha *= smoothstep(uFar, uNear, dist);

    vColor = aColor;
    vCoc = coc;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
  uniform float uPulse;
  uniform vec3 uPulseColor;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vCoc;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    // In focus: a tight core with a soft skirt. Out of focus: a flatter disc
    // with a defined edge, the way a real lens renders a defocused highlight.
    float sharp = pow(smoothstep(0.5, 0.0, d), 3.2);
    float disc = smoothstep(0.5, 0.40, d) * 0.5;
    float a = mix(sharp, disc, vCoc);

    vec3 c = mix(vColor, uPulseColor, uPulse);
    gl_FragColor = vec4(c, a * vAlpha * uOpacity);
  }
`;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Narrow spike used for the blue pulse — meaningful, then gone. */
function spike(p, at, width) {
  const d = (p - at) / width;
  return Math.exp(-d * d);
}

function makeUniforms(extra) {
  return {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uFocus: { value: 10 },
    uAperture: { value: 1.5 },
    uNear: { value: 46 },
    uFar: { value: 3 },
    uDrift: { value: 0.05 },
    uScale: { value: 1 },
    uOpacity: { value: 1 },
    uPulse: { value: 0 },
    uPulseColor: { value: new THREE.Color('#6aa6ff') },
    ...extra,
  };
}

/**
 * Static haze sitting behind the subject. It never forms anything; it exists
 * so the camera move has something to parallax against and the void has a
 * floor. Without it the subject floats in nothing and reads as a graphic.
 */
export function Atmosphere({ count = 1400, reducedMotion = false }) {
  const { viewport } = useThree();
  const matRef = useRef(null);
  const { pos, sizes, phases } = useMemo(() => buildAtmosphere(count), [count]);

  const uniforms = useMemo(
    () => makeUniforms({ uOpacity: { value: 0.5 }, uDrift: { value: reducedMotion ? 0 : 0.12 } }),
    [reducedMotion],
  );

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = clock.elapsedTime;
    matRef.current.uniforms.uPixelRatio.value = Math.min(viewport.dpr ?? 1, 2);
  });

  const colors = useMemo(() => {
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // barely there — this layer is felt, not seen
      const v = 0.16 + (i % 7) * 0.012;
      c[i * 3] = v * 1.02;
      c[i * 3 + 1] = v;
      c[i * 3 + 2] = v * 1.06;
    }
    return c;
  }, [count]);

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function MorphPoints({ progressRef, count = 14000, reducedMotion = false }) {
  const geoRef = useRef(null);
  const matRef = useRef(null);
  const { viewport } = useThree();

  const { acts, sizes, phases, positions, colors } = useMemo(() => {
    const built = buildActBuffers(count);
    return {
      ...built,
      positions: new Float32Array(built.acts[0].pos),
      colors: new Float32Array(built.acts[0].col),
    };
  }, [count]);

  const uniforms = useMemo(
    () => makeUniforms({ uDrift: { value: reducedMotion ? 0 : 0.045 } }),
    [reducedMotion],
  );

  useFrame(({ clock }) => {
    const geo = geoRef.current;
    const mat = matRef.current;
    if (!geo || !mat) return;

    const p = THREE.MathUtils.clamp(progressRef.current, 0, acts.length - 1 - 1e-4);
    const i0 = Math.floor(p);
    const i1 = Math.min(acts.length - 1, i0 + 1);
    const t = easeInOut(p - i0);

    const a = acts[i0];
    const b = acts[i1];
    const pos = geo.attributes.position.array;
    const col = geo.attributes.aColor.array;

    for (let i = 0; i < pos.length; i++) {
      pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * t;
      col[i] = a.col[i] + (b.col[i] - a.col[i]) * t;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;

    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uPixelRatio.value = Math.min(viewport.dpr ?? 1, 2);

    // Focus tracks the subject: it sits close during the intimate acts and
    // pulls back for the wide, cold one, so something is always sharp.
    const focus = [9.2, 6.4, 12.6, 11.0, 13.4, 7.2];
    const f = THREE.MathUtils.lerp(focus[i0], focus[i1], t);
    mat.uniforms.uFocus.value = f;

    // Two blue moments only: AXON resolving (act IV) and the shared memory
    // landing on every surface (act V). Nowhere else.
    mat.uniforms.uPulse.value = Math.min(1, spike(p, 3.0, 0.26) * 0.55 + spike(p, 4.05, 0.2) * 0.4);
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
