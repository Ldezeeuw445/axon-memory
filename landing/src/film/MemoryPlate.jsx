/**
 * The memory plate. Identical geometry and materials in every shot it appears
 * in — the whole film depends on the viewer recognising it each time.
 *
 * The body is a real metal: rough anodised face, polished chamfer, lit only by
 * the stage. Nothing about it is emissive. The only light it carries is inside
 * the channels, and that light is what changes state.
 */
import { forwardRef, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildPlateBody,
  buildPlateChannels,
  channelFragment,
  channelVertex,
  PLATE_STATES,
} from './plate';

const MemoryPlate = forwardRef(function MemoryPlate(
  { fill = 1, state = 'complete', scale = 1, ...rest },
  ref,
) {
  const matRef = useRef(null);
  const bodyGeo = useMemo(() => buildPlateBody(), []);
  const channelGeo = useMemo(() => buildPlateChannels(), []);

  const uniforms = useMemo(
    () => ({
      uColor: { value: PLATE_STATES.dormant.color.clone() },
      uFill: { value: 0 },
      uIntensity: { value: PLATE_STATES.dormant.intensity },
    }),
    [],
  );

  useFrame((_, dt) => {
    const m = matRef.current;
    if (!m) return;
    const target = PLATE_STATES[state] ?? PLATE_STATES.complete;
    // Eased rather than snapped: the recall flare has to fall back to amber
    // quickly but never instantly, or it reads as a flicker bug.
    const k = 1 - Math.pow(0.001, dt);
    m.uniforms.uColor.value.lerp(target.color, k);
    m.uniforms.uIntensity.value = THREE.MathUtils.lerp(
      m.uniforms.uIntensity.value,
      target.intensity,
      k,
    );
    m.uniforms.uFill.value = THREE.MathUtils.lerp(m.uniforms.uFill.value, fill, k * 0.8);
  });

  return (
    <group ref={ref} scale={scale} {...rest}>
      <mesh geometry={bodyGeo} castShadow receiveShadow>
        {/* Pulled back off full metalness: at 0.96 the face returned only the
            environment and went black. Anodising is a dielectric layer over
            metal, so a little diffuse is physically right and it also gives
            the blasted face something to hold. */}
        <meshStandardMaterial
          color="#2b2d33"
          metalness={0.78}
          roughness={0.33}
          envMapIntensity={2.1}
        />
      </mesh>
      <mesh geometry={channelGeo}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={channelVertex}
          fragmentShader={channelFragment}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

export default MemoryPlate;
