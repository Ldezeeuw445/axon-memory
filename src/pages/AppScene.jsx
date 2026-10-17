import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor, Stars } from '@react-three/drei';
import AxonCore from '../components/AxonCore';
import CoreGateway, { GATEWAY_DURATION } from '../components/CoreGateway';

/**
 * The void and the Core, split out of the shell so three.js never sits on the
 * path to the first paint (perf, A-perf-1). The shell renders its facet first;
 * this chunk arrives afterwards and fades in behind it.
 *
 * Opened straight onto a facet (a link, a refresh, the installed app) the
 * camera is already past the Core, so only the stars are visible. The Core and
 * its environment map — the heaviest GPU work on the page — are built only once
 * the person comes back to the Core, and then play the return journey.
 */
function Void() {
  return (
    <>
      <color attach="background" args={['#020203']} />
      <Stars radius={100} depth={50} count={2600} factor={3} saturation={0} fade speed={0.25} />
    </>
  );
}

export default function AppScene({ facet, isMobile, apertureRef, onProgress }) {
  const [perfDpr, setPerfDpr] = useState(1.5);
  // Built from the start only when the Core is what the person sees first.
  const [coreBuilt, setCoreBuilt] = useState(() => !facet);
  const [startInside] = useState(() => !!facet);
  if (!facet && !coreBuilt) setCoreBuilt(true);

  return (
    <Canvas dpr={[0.75, perfDpr]} camera={{ position: [0, 0, 10], fov: 35 }}>
      <PerformanceMonitor onDecline={() => setPerfDpr((d) => Math.max(0.75, d - 0.25))} onIncline={() => setPerfDpr((d) => Math.min(1.75, d + 0.25))} />
      <AdaptiveDpr pixelated={false} />
      <Void />
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
          >
            <AxonCore stage={3} opening={!!facet} apertureRef={apertureRef} />
          </CoreGateway>
          <Environment resolution={256}>
            <Lightformer form="rect" intensity={9} position={[0, 8, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 10, 1]} color="#dfe9ff" />
            <Lightformer form="rect" intensity={5.2} position={[-8, 2, -6]} scale={[12, 9, 1]} color="#9fb6e0" />
            <Lightformer form="rect" intensity={2.8} position={[8, -1, 5]} scale={[9, 7, 1]} color="#6d7f9e" />
            <Lightformer form="rect" intensity={16} position={[-3.2, 4, 4]} scale={[0.35, 7, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={11} position={[3.6, -2, 3.5]} scale={[0.3, 6, 1]} color="#cfe2ff" />
            <Lightformer form="circle" intensity={2.2} position={[0, -6, 1]} scale={[7, 7, 1]} color="#2a3a5c" />
            <Lightformer form="rect" intensity={4.5} position={[-7, -3, 3]} scale={[11, 9, 1]} color="#8d9bb8" />
          </Environment>
        </>
      )}
    </Canvas>
  );
}
