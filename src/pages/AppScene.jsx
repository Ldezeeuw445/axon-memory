import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor, Stars } from '@react-three/drei';
import * as THREE from 'three';
import AxonCore from '../components/AxonCore';
import CoreGateway, { GATEWAY_DURATION } from '../components/CoreGateway';

/**
 * Persistent galaxy + Core behind every facet. Multi-layer stars + soft nebula
 * for depth; DPR capped for iPhone. Soft parallax only — never remounts.
 */

function NebulaVeil({ reduceMotion, isMobile }) {
  const group = useRef(null);
  const mats = useMemo(() => {
    const mk = (color, opacity) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
    return [
      mk('#1a2858', isMobile ? 0.22 : 0.28),
      mk('#3a2060', isMobile ? 0.14 : 0.18),
      mk('#204050', isMobile ? 0.1 : 0.14),
    ];
  }, [isMobile]);

  useFrame((state) => {
    if (reduceMotion || !group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = t * 0.012;
    group.current.children.forEach((child, i) => {
      child.position.x = Math.sin(t * (0.04 + i * 0.01) + i) * (2 + i);
      child.position.y = Math.cos(t * (0.03 + i * 0.008) + i * 1.3) * (1.2 + i * 0.4);
    });
  });

  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  return (
    <group ref={group} position={[0, 1.5, -55]}>
      <mesh position={[-8, 4, 0]} scale={[70, 42, 1]} material={mats[0]}>
        <planeGeometry args={[1, 1, 1, 1]} />
      </mesh>
      <mesh position={[14, -2, -8]} scale={[50, 34, 1]} rotation={[0, 0, 0.4]} material={mats[1]}>
        <planeGeometry args={[1, 1, 1, 1]} />
      </mesh>
      <mesh position={[0, 10, -16]} scale={[90, 28, 1]} material={mats[2]}>
        <planeGeometry args={[1, 1, 1, 1]} />
      </mesh>
    </group>
  );
}

function Void({ reduceMotion, isMobile }) {
  const farCount = reduceMotion ? 700 : isMobile ? 1400 : 2200;
  const midCount = reduceMotion ? 400 : isMobile ? 900 : 1600;
  const nearCount = reduceMotion ? 180 : isMobile ? 420 : 700;
  return (
    <>
      <color attach="background" args={['#020203']} />
      <fog attach="fog" args={['#020203', 55, 140]} />
      {/* Far / mid / near star fields — parallax via different radii + speeds */}
      <Stars radius={140} depth={90} count={farCount} factor={2.2} saturation={0} fade speed={reduceMotion ? 0 : 0.08} />
      <Stars radius={95} depth={55} count={midCount} factor={3.2} saturation={0.05} fade speed={reduceMotion ? 0 : 0.18} />
      <Stars radius={55} depth={28} count={nearCount} factor={4.5} saturation={0.12} fade speed={reduceMotion ? 0 : 0.32} />
      <NebulaVeil reduceMotion={reduceMotion} isMobile={isMobile} />
    </>
  );
}

export default function AppScene({ facet, isMobile, apertureRef, onProgress, parallax = 0, reduceMotion = false }) {
  const mobileCap = 1.15;
  const desktopCap = 1.65;
  const [perfDpr, setPerfDpr] = useState(isMobile ? 1.0 : 1.4);
  const [coreBuilt, setCoreBuilt] = useState(true);
  const [startInside] = useState(() => !!facet);

  useEffect(() => {
    if (!coreBuilt) setCoreBuilt(true);
  }, [coreBuilt]);

  const dprMax = Math.min(perfDpr, isMobile ? mobileCap : desktopCap);

  return (
    <Canvas
      dpr={[0.65, dprMax]}
      camera={{ position: [0, 0, 10], fov: 35 }}
      gl={{ antialias: !isMobile, powerPreference: 'high-performance', alpha: false }}
    >
      <PerformanceMonitor
        onDecline={() => setPerfDpr((d) => Math.max(0.65, d - 0.15))}
        onIncline={() => setPerfDpr((d) => Math.min(isMobile ? mobileCap : desktopCap, d + 0.12))}
      />
      <AdaptiveDpr pixelated={false} />
      <Void reduceMotion={reduceMotion} isMobile={isMobile} />
      {coreBuilt && (
        <>
          <ambientLight intensity={0.12} />
          {/* Key + fill + rim so the Core reads as a lit sphere, not a flat disc */}
          <spotLight position={[0, 10, 5]} angle={0.32} penumbra={1} intensity={2.1} color="#ffffff" />
          <spotLight position={[-6, 3, 8]} angle={0.45} penumbra={0.9} intensity={0.85} color="#9fb6e0" />
          <pointLight position={[3.2, 1.5, 5.5]} intensity={1.35} color="#dfe9ff" distance={22} decay={2} />
          <pointLight position={[-2.8, -1.2, 4]} intensity={0.55} color="#ffc878" distance={16} decay={2} />
          <pointLight position={[0, 4.5, -2]} intensity={0.7} color="#a8c4ff" distance={18} decay={2} />
          <CoreGateway
            active={!!facet}
            startAt={startInside ? GATEWAY_DURATION : undefined}
            baseScale={isMobile ? 0.62 : 0.95}
            apertureRef={apertureRef}
            onProgress={onProgress}
            parallax={parallax}
            reduceMotion={reduceMotion}
          >
            <AxonCore stage={3} opening={!!facet} apertureRef={apertureRef} />
          </CoreGateway>
          {!reduceMotion && (
            <Environment resolution={isMobile ? 96 : 256}>
              <Lightformer form="rect" intensity={9} position={[0, 8, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 10, 1]} color="#dfe9ff" />
              <Lightformer form="rect" intensity={5.2} position={[-8, 2, -6]} scale={[12, 9, 1]} color="#9fb6e0" />
              <Lightformer form="rect" intensity={2.8} position={[8, -1, 5]} scale={[9, 7, 1]} color="#6d7f9e" />
              <Lightformer form="rect" intensity={16} position={[-3.2, 4, 4]} scale={[0.35, 7, 1]} color="#ffffff" />
              <Lightformer form="rect" intensity={11} position={[3.6, -2, 3.5]} scale={[0.3, 6, 1]} color="#cfe2ff" />
              <Lightformer form="circle" intensity={2.2} position={[0, -6, 1]} scale={[7, 7, 1]} color="#2a3a5c" />
              <Lightformer form="rect" intensity={4.5} position={[-7, -3, 3]} scale={[11, 9, 1]} color="#8d9bb8" />
              {/* Rim wash — warm edge opposite the key */}
              <Lightformer form="ring" intensity={3.4} position={[5, 1, 6]} scale={[6, 6, 1]} color="#ffd9a8" />
            </Environment>
          )}
        </>
      )}
    </Canvas>
  );
}
