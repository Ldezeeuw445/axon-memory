import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Points, PointMaterial } from '@react-three/drei';

// Define colors outside to avoid recreation
const flashColor = new THREE.Color("#0044ff"); // Exact same deep neon blue as the crystal core
const injectionColor = new THREE.Color("#C4D63C"); // Hex image Gold/Yellow
const baseColor = new THREE.Color("#ffffff");

export default function MemoryParticle({ position, weight = 'light', stage, isNewInjection = false }) {
  const groupRef = useRef();
  const materialRef = useRef();
  
  const orbitCenter = [0, 0, 0];
  
  // Determine scale based on weight
  const baseScale = weight === 'heavy' ? 0.12 : (weight === 'medium' ? 0.08 : 0.05);
  
  // Orbit logic
  const speed = weight === 'heavy' ? 0.15 : 0.3;
  const angleRef = useRef(Math.random() * Math.PI * 2);
  const targetDistance = new THREE.Vector3(...position).distanceTo(new THREE.Vector3(...orbitCenter));
  
  const startDist = useRef(targetDistance + 35);
  const flashTime = useRef(0);
  const lastStage = useRef(stage);

  // Generate a dense point cloud sphere
  const [positions, innerPositions] = useMemo(() => {
    const pointCount = 1000;
    const pos = new Float32Array(pointCount * 3);
    const innerPos = new Float32Array(pointCount * 3);
    
    for (let i = 0; i < pointCount; i++) {
      // Outer shell (dense surface)
      const phi = Math.acos(-1 + (2 * i) / pointCount);
      const theta = Math.sqrt(pointCount * Math.PI) * phi;
      
      const r = baseScale;
      pos[i * 3] = r * Math.cos(theta) * Math.sin(phi);
      pos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // Inner dense core (random inside volume)
      const rInner = baseScale * 0.8 * Math.cbrt(Math.random());
      const thetaInner = Math.random() * 2 * Math.PI;
      const phiInner = Math.acos(2 * Math.random() - 1);
      
      innerPos[i * 3] = rInner * Math.sin(phiInner) * Math.cos(thetaInner);
      innerPos[i * 3 + 1] = rInner * Math.sin(phiInner) * Math.sin(thetaInner);
      innerPos[i * 3 + 2] = rInner * Math.cos(phiInner);
    }
    return [pos, innerPos];
  }, [baseScale]);

  const mountTime = useRef(null);

  useFrame((state, delta) => {
    if (mountTime.current === null) mountTime.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - mountTime.current;
    
    // Arrival timeline (12s for initial load, 3.5s for new injections)
    const duration = isNewInjection ? 3.5 : 12.0;
    const timeline = Math.min(elapsed / duration, 1.0);
    
    // easeInOutCubic: begint met 0 snelheid (geen schok/hapering), 
    // versnelt zacht in het midden, en remt onzichtbaar af in de uiteindelijke baan.
    const ease = timeline < 0.5 
      ? 4 * timeline * timeline * timeline 
      : 1 - Math.pow(-2 * timeline + 2, 3) / 2;
    
    if (groupRef.current) {
      const currentDist = THREE.MathUtils.lerp(startDist.current, targetDistance, ease);
      angleRef.current += speed * delta;
      
      if (isNewInjection && timeline < 1.0) {
        // Starts at the UI Panel and shoots to the orbit center. Handle mobile position.
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        // Zorgt dat ie echt ver buiten de view start om er langzaam in te glijden
        const startPos = new THREE.Vector3(isMobile ? 0 : 5, isMobile ? 6 : 0, 8.5);
        const endPos = new THREE.Vector3(
          orbitCenter[0] + Math.cos(angleRef.current) * targetDistance,
          orbitCenter[1],
          orbitCenter[2] + Math.sin(angleRef.current) * targetDistance
        );
        
        groupRef.current.position.copy(startPos).lerp(endPos, ease);
        groupRef.current.scale.set(3, 3, 3).lerp(new THREE.Vector3(1, 1, 1), ease); // Starts big, shrinks down
      } else {
        groupRef.current.position.x = orbitCenter[0] + Math.cos(angleRef.current) * currentDist;
        groupRef.current.position.z = orbitCenter[2] + Math.sin(angleRef.current) * currentDist;
        groupRef.current.position.y += Math.sin(state.clock.elapsedTime * speed + angleRef.current) * 0.001;
      }
      
      // Self rotation
      groupRef.current.rotation.y += delta * 0.5;
      groupRef.current.rotation.x += delta * 0.2;
      
      // "Connection" click flash
      if ((stage === 3 || stage === 5) && materialRef.current && !isNewInjection) {
        if (flashTime.current === 0 || stage !== lastStage.current) {
          flashTime.current = state.clock.elapsedTime;
          lastStage.current = stage;
        }
        const flashElapsed = state.clock.elapsedTime - flashTime.current;
        
        // Flash duurt 2 seconden. Begint fel (blauw of goud), vloeit terug naar wit.
        const flashProgress = Math.min(flashElapsed / 2.0, 1.0);
        const targetFlashColor = stage === 5 ? injectionColor : flashColor;
        
        materialRef.current.color.lerpColors(targetFlashColor, baseColor, Math.pow(flashProgress, 0.5));
        
        // Fysieke scale pulse (blaast 60% groter op en krimpt terug)
        const scalePulse = 1.0 + (1.0 - Math.pow(flashProgress, 0.5)) * 0.6;
        groupRef.current.scale.set(scalePulse, scalePulse, scalePulse);
      } else {
        lastStage.current = stage;
      }

      // New injection flash
      if (isNewInjection && materialRef.current) {
        if (timeline < 1.0) {
          // Stay bright gold during travel
          materialRef.current.color.copy(injectionColor);
        } else {
          // Fade to white after arriving, taking 3 full seconds to calmly blend in
          const postArrivalProgress = Math.min((elapsed - 3.5) / 3.0, 1.0);
          materialRef.current.color.lerpColors(injectionColor, baseColor, Math.pow(postArrivalProgress, 0.5));
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Solid black core to block light and create density */}
      <mesh>
        <sphereGeometry args={[baseScale * 0.85, 32, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      
      {/* Outer shell of particles */}
      <Points positions={positions} stride={3}>
        <PointMaterial 
          ref={materialRef}
          transparent 
          color="#ffffff" 
          size={0.005} 
          sizeAttenuation={true} 
          depthWrite={false}
          opacity={0.8}
        />
      </Points>

      {/* Inner dense particles */}
      <Points positions={innerPositions} stride={3}>
        <PointMaterial 
          transparent 
          color="#a0c0ff" 
          size={0.003} 
          sizeAttenuation={true} 
          depthWrite={false}
          opacity={0.5}
        />
      </Points>
    </group>
  );
}
