import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor, Stars } from '@react-three/drei';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Plus, Spline, Mountain, Link2, CircleUser } from 'lucide-react';
import AxonCore from '../components/AxonCore';
import CoreGateway from '../components/CoreGateway';
import FragmentPanel from '../components/FragmentPanel';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import RecallFacet from './facets/RecallFacet';
import CaptureFacet from './facets/CaptureFacet';
import ThreadsFacet from './facets/ThreadsFacet';
import YouFacet from './facets/YouFacet';
import MemoryGraph from './MemoryGraph';
import ConnectFacet from './facets/ConnectFacet';
import '../styles/facets.css';

/**
 * The product. One surface: the Core in the void, and its facets.
 * Spec §11–12 — Recall (home), Capture, Threads, Terrain, Connect, You.
 * Older facet names still open the right facet, so every existing link and
 * the OAuth callbacks keep working.
 */
export const FACETS = [
  { id: 'recall', label: 'Recall', Icon: Search },
  { id: 'capture', label: 'Capture', Icon: Plus },
  { id: 'threads', label: 'Threads', Icon: Spline },
  { id: 'terrain', label: 'Terrain', Icon: Mountain },
  { id: 'connections', label: 'Connect', Icon: Link2 },
  { id: 'you', label: 'You', Icon: CircleUser },
];
const ALIAS = { dashboard: 'recall', graph: 'terrain', billing: 'you', sources: 'connections', privacy: 'you', profile: 'you' };
export const facetFrom = (f) => (FACETS.some((x) => x.id === f) ? f : ALIAS[f] || null);

function Void() {
  return (
    <>
      <color attach="background" args={['#020203']} />
      <Stars radius={100} depth={50} count={2600} factor={3} saturation={0} fade speed={0.25} />
    </>
  );
}

export default function AppShell() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const requested = facetFrom(params.get('facet'));
  const [facet, setFacet] = useState(requested || 'recall');
  const [initial, setInitial] = useState(() => {
    const p = Object.fromEntries(params.entries());
    delete p.facet;
    return Object.keys(p).length ? p : null;
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [perfDpr, setPerfDpr] = useState(1.5);
  const apertureRef = useRef(0);
  const [arrived, setArrived] = useState(true);
  const arrivedRef = useRef(true);
  const [mounted, setMounted] = useState(true);
  const mountedRef = useRef(true);
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    const r = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  useEffect(() => { if (!loading && !user) navigate('/login', { replace: true, state: { from: `${location.pathname}${location.search}` } }); }, [loading, user]);

  // Keep the address honest so a refresh or a shared link opens the same facet.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (facet) q.set('facet', facet); else q.delete('facet');
    for (const k of ['title', 'text', 'url', 'thread']) if (!initial?.[k]) q.delete(k);
    window.history.replaceState(null, '', `/?${q.toString()}`);
  }, [facet, initial]);

  useEffect(() => {
    if (!user || facet) return;
    Promise.all([
      supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('retired_at', null),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]).then(([m, t]) => setCounts({ m: m.count ?? 0, t: t.count ?? 0 }));
  }, [user, facet]);

  const open = (id, init = null) => { setInitial(init); setFacet(id); };
  const toggle = (id) => { setInitial(null); setFacet((f) => (f === id ? null : id)); };

  if (!user) return <div className="full-screen" style={{ background: '#020203' }} />;

  const reading = facet && facet !== 'terrain';
  const panelStyle = isMobile
    ? { top: 'calc(64px + env(safe-area-inset-top))', bottom: 'calc(88px + env(safe-area-inset-bottom))', left: 10, right: 10, padding: '22px 18px' }
    : { top: 84, bottom: 104, left: 'max(32px, calc(50% - 420px))', right: 'max(32px, calc(50% - 420px))', padding: '34px 36px' };

  return (
    <div className="full-screen">
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Canvas dpr={[0.75, perfDpr]} camera={{ position: [0, 0, 10], fov: 35 }}>
          <PerformanceMonitor onDecline={() => setPerfDpr((d) => Math.max(0.75, d - 0.25))} onIncline={() => setPerfDpr((d) => Math.min(1.75, d + 0.25))} />
          <AdaptiveDpr pixelated={false} />
          <ambientLight intensity={0.1} />
          <spotLight position={[0, 10, 5]} angle={0.3} penumbra={1} intensity={2} color="#ffffff" />
          <Void />
          <CoreGateway
            active={!!facet}
            baseScale={isMobile ? 0.62 : 0.95}
            apertureRef={apertureRef}
            onProgress={(p, through) => {
              if (p > 0.4 && !mountedRef.current) { mountedRef.current = true; setMounted(true); }
              if (p === 0 && mountedRef.current) { mountedRef.current = false; setMounted(false); }
              if (through !== arrivedRef.current) { arrivedRef.current = through; setArrived(through); }
            }}
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
        </Canvas>
      </div>

      <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
        <header style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', left: isMobile ? 16 : 28, right: isMobile ? 16 : 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 200 }}>
          <button onClick={() => toggle(null)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }} aria-label="Your Core">
            <img src="/axon_logo.png" alt="" style={{ width: 34, height: 34, borderRadius: 9 }} />
            <span className="title-text" style={{ fontSize: 14, letterSpacing: '0.22em', fontWeight: 600 }}>AXON</span>
          </button>
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 12.5 }}>{user.email}</span>
              <button className="ax-btn-quiet" style={{ borderRadius: 999, padding: '7px 16px', fontSize: 12 }} onClick={signOut}>Sign out</button>
            </div>
          )}
        </header>

        <AnimatePresence>
          {!facet && counts && (
            <motion.div key="core-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.6, delay: 0.6 }}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(120px + env(safe-area-inset-bottom))', textAlign: 'center', pointerEvents: 'none' }}>
              <div className="ax-eyebrow" style={{ letterSpacing: '0.3em' }}>Your Core</div>
              <div style={{ marginTop: 8, color: 'var(--color-text-secondary)', fontSize: 14 }}>
                {counts.m ? `${counts.m} ${counts.m === 1 ? 'memory' : 'memories'} · ${counts.t} ${counts.t === 1 ? 'Thread' : 'Threads'}` : 'Young. It grows with everything you keep.'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {facet && mounted && (facet === 'terrain' ? (
          <div style={{ position: 'absolute', inset: 0, opacity: arrived ? 1 : 0, transition: 'opacity 1.2s ease' }}>
            <MemoryGraph asFacet />
          </div>
        ) : (
          <FragmentPanel delay={0.05} style={{ position: 'absolute', ...panelStyle, ...(isMobile ? { clipPath: 'polygon(0 10px, calc(100% - 10px) 0, 100% calc(100% - 10px), 10px 100%)' } : {}), opacity: arrived ? 1 : 0, transition: 'opacity 1.2s ease', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div key={facet} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', margin: isMobile ? '-4px -6px' : '-6px -10px', padding: isMobile ? '4px 6px 24px' : '6px 10px 24px' }}>
              {facet === 'recall' && <RecallFacet onOpen={open} />}
              {facet === 'capture' && <CaptureFacet initial={initial} />}
              {facet === 'threads' && <ThreadsFacet initial={initial} />}
              {facet === 'connections' && <ConnectFacet />}
              {facet === 'you' && <YouFacet onOpen={open} />}
            </div>
          </FragmentPanel>
        ))}

        <nav aria-label="Facets" style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(14px + env(safe-area-inset-bottom))', zIndex: 100,
          display: 'flex', gap: isMobile ? 0 : 4, padding: isMobile ? '6px 6px' : '6px 10px', width: isMobile ? 'calc(100% - 20px)' : 'auto', justifyContent: 'space-between',
          background: 'rgba(10, 12, 16, 0.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          {FACETS.map(({ id, label, Icon }) => {
            const on = facet === id;
            return (
              <button key={id} onClick={() => toggle(id)} aria-current={on ? 'page' : undefined} aria-label={label}
                style={{
                  flex: isMobile ? 1 : undefined, minWidth: isMobile ? 0 : 76, border: 0, borderRadius: 18, padding: isMobile ? '8px 0 7px' : '9px 12px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', fontFamily: 'inherit',
                  background: on ? 'rgba(255,183,51,0.10)' : 'transparent', color: on ? 'var(--color-accent-strong)' : 'var(--color-text-secondary)',
                  boxShadow: on ? 'inset 0 0 0 1px rgba(255,183,51,0.22)' : 'none', transition: 'all 0.6s cubic-bezier(0.19,1,0.22,1)',
                }}>
                <Icon size={19} strokeWidth={on ? 2 : 1.7} />
                <span style={{ fontSize: 10.5, letterSpacing: '0.04em' }}>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
