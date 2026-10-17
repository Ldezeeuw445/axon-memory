import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import AxonCore from '../AxonCore';

/**
 * Hero visual (spec §24): one memory leaving one AI, settling in AXON, and
 * arriving in another. Clearly an example. One moving element at a time:
 * the card forms, then the light travels, then the other card forms.
 */
const STORY = [
  { from: 'Claude', said: 'We moved the Kestrel launch to 3 November. Marit owns the announcement.', to: 'Cursor', recalled: 'Kestrel launches 3 November. Marit owns the announcement.' },
  { from: 'ChatGPT', said: 'Keep my code in TypeScript, with as few dependencies as possible.', to: 'Claude', recalled: 'Prefers TypeScript and minimal dependencies.' },
];
const PHASE_MS = [1600, 1900, 3600, 900]; // card forms → light travels → arrives & holds → rest

function CoreStage() {
  const aperture = useRef(0);
  return (
    <Canvas dpr={[1, 1.75]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0, 10], fov: 35 }} style={{ background: 'transparent' }}>
      <ambientLight intensity={0.1} />
      <spotLight position={[0, 10, 5]} angle={0.3} penumbra={1} intensity={2} color="#ffffff" />
      <group scale={0.4}><AxonCore stage={3} apertureRef={aperture} skipIntro /></group>
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={9} position={[0, 8, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 10, 1]} color="#dfe9ff" />
        <Lightformer form="rect" intensity={5.2} position={[-8, 2, -6]} scale={[12, 9, 1]} color="#9fb6e0" />
        <Lightformer form="rect" intensity={16} position={[-3.2, 4, 4]} scale={[0.35, 7, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={11} position={[3.6, -2, 3.5]} scale={[0.3, 6, 1]} color="#ffd98a" />
        <Lightformer form="circle" intensity={2.2} position={[0, -6, 1]} scale={[7, 7, 1]} color="#2a3a5c" />
      </Environment>
    </Canvas>
  );
}

export default function MemoryFlow() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState(reduce ? 2 : 0);
  const wrap = useRef(null); const left = useRef(null); const core = useRef(null);
  const [path, setPath] = useState(null);

  useEffect(() => {
    if (reduce) return undefined;
    const t = setTimeout(() => {
      if (phase === 3) { setI((v) => (v + 1) % STORY.length); setPhase(0); } else setPhase(phase + 1);
    }, PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [phase, reduce]);

  useLayoutEffect(() => {
    const measure = () => {
      if (!wrap.current || !left.current || !core.current) return;
      const w = wrap.current.getBoundingClientRect();
      const l = left.current.getBoundingClientRect();
      const c = core.current.getBoundingClientRect();
      const stacked = c.top >= l.bottom - 2;
      setPath({
        x0: stacked ? l.left + l.width / 2 - w.left : l.right - w.left, y0: stacked ? l.bottom - w.top : l.top + l.height / 2 - w.top,
        x1: c.left + c.width / 2 - w.left, y1: c.top + c.height / 2 - w.top,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [i]);

  const s = STORY[i];
  return (
    <div className="hm-flow" ref={wrap} aria-label="Example: a memory captured in one AI and recalled in another">
      <div className="hm-flow-slot" ref={left}>
        <AnimatePresence mode="wait">
          {phase <= 2 && (
            <motion.div key={`l${i}`} className="hm-flow-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: phase === 2 ? 0.55 : 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }}>
              <div className="hm-flow-where">You, in {s.from}</div>
              <div className="hm-flow-text">{s.said}</div>
              <div className="hm-flow-meta"><i /> Captured to AXON</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="hm-flow-core" ref={core}><Suspense fallback={null}><CoreStage /></Suspense></div>
      <div className="hm-flow-slot right">
        <AnimatePresence mode="wait">
          {phase >= 2 && (
            <motion.div key={`r${i}`} className="hm-flow-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1.1, ease: [0.19, 1, 0.22, 1] }}>
              <div className="hm-flow-where">Later, in {s.to}</div>
              <div className="hm-flow-text">{s.recalled}</div>
              <div className="hm-flow-meta"><i /> Recalled from AXON · said in {s.from}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {path && phase === 1 && (
        <motion.span key={`c${i}`} className="hm-flow-chip" initial={{ x: path.x0, y: path.y0, opacity: 0, scale: 0.6 }}
          animate={{ x: path.x1, y: path.y1, opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.4] }}
          transition={{ duration: 1.7, ease: [0.65, 0, 0.35, 1] }} style={{ left: 0, top: 0, margin: '-5px' }} />
      )}
    </div>
  );
}
