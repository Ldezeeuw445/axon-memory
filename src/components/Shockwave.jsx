import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';

export default function Shockwave({ position, triggerTime, color = '#00aaff' }) {
  const meshRef = useRef();
  const materialRef = useRef();

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current || !triggerTime) return;
    
    const elapsed = state.clock.elapsedTime - triggerTime;
    
    // Shockwave lasts for 1 second
    if (elapsed > 0 && elapsed < 1.0) {
      // Rapid expansion
      const progress = elapsed / 1.0;
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      // Starts small at the UI panel, expands massively to engulf the core
      const scale = THREE.MathUtils.lerp(0.1, 35, easeOut);
      meshRef.current.scale.set(scale, scale, scale);
      
      // Distortion intensity fades as it expands
      materialRef.current.distortion = THREE.MathUtils.lerp(1.5, 0.0, easeOut);
      materialRef.current.transmission = THREE.MathUtils.lerp(1.0, 0.0, progress);
    } else if (elapsed >= 1.0) {
      meshRef.current.scale.set(0, 0, 0); // Hide when done
    }
  });

  if (!triggerTime) return null;

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 32, 32]} />
      <MeshTransmissionMaterial 
        ref={materialRef}
        backside
        samples={8}
        resolution={512}
        transmission={1.0}
        roughness={0.0}
        thickness={2.5}
        ior={1.8}
        distortion={1.5}
        distortionScale={2.0}
        color={color}
        transparent
      />
    </mesh>
  );
}
