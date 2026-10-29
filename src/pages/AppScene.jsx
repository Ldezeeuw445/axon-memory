import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor, Stars } from '@react-three/drei';
import AxonCore from '../components/AxonCore';
import CoreGateway, { GATEWAY_DURATION } from '../components/CoreGateway';

/**
 * Persistent galaxy + Core behind every facet. The shell never remounts this
 * when switching Recall ↔ Connect ↔ …; only a soft parallax nudges the camera.
 * Opened on a facet, the gateway starts on the far (memory-space) side so the
 * Core still crowns the top of the frame instead of vanishing behind the camera.
 */
function Void({ reduceMotion }) {
  return (
    <>
      <color attach="background" args={['#020203']} />
      <Stars
        radius={100}
        depth={50}
        count={reduceMotion ? 1200 : 2600}
        factor={3}
        saturation={0}
        fade
        speed={reduceMotion ? 0 : 0.25}
      />
    </>
  );
}

export default function AppScene({ facet, isMobile, apertureRef, onProgress, parallax = 0, reduceMotion = false }) {
  const [perfDpr, setPerfDpr] = useState(isMobile ? 1.15 : 1.5);
  // Core is part of the memory-space look — build it even when opened on a facet.
  const [coreBuilt, setCoreBuilt] = useState(true);
  const [startInside] = useState(() => !!facet);

  useEffect(() => {
    if (!coreBuilt) setCoreBuilt(true);
  }, [coreBuilt]);

  return (
    <Canvas dpr={[0.7, perfDpr]} camera={{ position: [0, 0, 10], fov: 35 }} gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}>
      <PerformanceMonitor
        onDecline={() => setPerfDpr((d) => Math.max(0.7, d - 0.2))}
        onIncline={() => setPerfDpr((d) => Math.min(isMobile ? 1.25 : 1.75, d + 0.2))}
      />
      <AdaptiveDpr pixelated={false} />
      <Void reduceMotion={reduceMotion} />
      {coreBuilt && (
        <>
          <ambientLight intensity={0.1} />
          <spotLight position={[0, 10, 5]} angle={0.3} penumbra={1} intensity={2} color="#ffffff" />
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
            <Environment resolution={isMobile ? 128 : 256}>
              <Lightformer form="rect" intensity={9} position={[0, 8, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 10, 1]} color="#dfe9ff" />
              <Lightformer form="rect" intensity={5.2} position={[-8, 2, -6]} scale={[12, 9, 1]} color="#9fb6e0" />
              <Lightformer form="rect" intensity={2.8} position={[8, -1, 5]} scale={[9, 7, 1]} color="#6d7f9e" />
              <Lightformer form="rect" intensity={16} position={[-3.2, 4, 4]} scale={[0.35, 7, 1]} color="#ffffff" />
              <Lightformer form="rect" intensity={11} position={[3.6, -2, 3.5]} scale={[0.3, 6, 1]} color="#cfe2ff" />
              <Lightformer form="circle" intensity={2.2} position={[0, -6, 1]} scale={[7, 7, 1]} color="#2a3a5c" />
              <Lightformer form="rect" intensity={4.5} position={[-7, -3, 3]} scale={[11, 9, 1]} color="#8d9bb8" />
            </Environment>
          )}
        </>
      )}
    </Canvas>
  );
}
