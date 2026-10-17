import React, { Suspense, useEffect, useRef, useState } from 'react';
import { lazyPage } from '../lib/lazyPage';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Plus, Spline, Mountain, Link2, CircleUser } from 'lucide-react';
import FragmentPanel from '../components/FragmentPanel';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import RecallFacet from './facets/RecallFacet';
import CaptureFacet from './facets/CaptureFacet';
import ThreadsFacet from './facets/ThreadsFacet';
import YouFacet from './facets/YouFacet';
import { flushCaptureQueue } from '../lib/axonApi';
// Heavy parts load after the facet has painted: the 3D void/Core and Terrain.
const AppScene = lazyPage(() => import('./AppScene'));
const MemoryGraph = lazyPage(() => import('./MemoryGraph'));
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

/** The scene is decoration: if its code or WebGL fails, the void stays and the facets keep working. */
class SceneBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Waits for the first paint and a quiet moment before the scene is fetched. */
function useAfterFirstPaint(delay = 250) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let id; let idle;
    const go = () => setReady(true);
    const raf = requestAnimationFrame(() => {
      id = setTimeout(() => {
        if ('requestIdleCallback' in window) idle = window.requestIdleCallback(go, { timeout: 1500 });
        else go();
      }, delay);
    });
    return () => { cancelAnimationFrame(raf); clearTimeout(id); if (idle) window.cancelIdleCallback?.(idle); };
  }, [delay]);
  return ready;
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
  // Opened onto a facet, the facet comes first and the scene after; opened
  // onto the Core, the scene is the content and loads straight away.
  const [coldFacet] = useState(() => !!requested);
  const [moved, setMoved] = useState(false);
  const sceneReady = useAfterFirstPaint(coldFacet ? 600 : 0);
  const [sceneShown, setSceneShown] = useState(false);
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

  // Outbox (A2-2): what was captured offline goes up on sign-in and whenever
  // the connection returns — nobody has to press anything for it.
  useEffect(() => {
    if (!user) return undefined;
    const run = async () => {
      const r = await flushCaptureQueue();
      window.dispatchEvent(new CustomEvent('axon:outbox', { detail: r }));
    };
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [user]);
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

  const open = (id, init = null) => { setMoved(true); setInitial(init); setFacet(id); };
  const toggle = (id) => { setMoved(true); setInitial(null); setFacet((f) => (f === id ? null : id)); };

  if (!user) return <div className="full-screen" style={{ background: '#020203' }} />;

  const panelStyle = isMobile
    ? { top: 'calc(64px + env(safe-area-inset-top))', bottom: 'calc(88px + env(safe-area-inset-bottom))', left: 10, right: 10, padding: '22px 18px' }
    : { top: 84, bottom: 104, left: 'max(32px, calc(50% - 420px))', right: 'max(32px, calc(50% - 420px))', padding: '34px 36px' };

  return (
    <div className="full-screen">
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#020203' }}>
        {sceneReady && (
          <SceneBoundary><Suspense fallback={null}>
            <div style={{ position: 'absolute', inset: 0, opacity: sceneShown ? 1 : 0, transition: 'opacity 1.2s ease' }} ref={(el) => { if (el && !sceneShown) requestAnimationFrame(() => setSceneShown(true)); }}>
              <AppScene
                facet={facet}
                isMobile={isMobile}
                apertureRef={apertureRef}
                onProgress={(p, through) => {
                  if (p > 0.4 && !mountedRef.current) { mountedRef.current = true; setMounted(true); }
                  if (p === 0 && mountedRef.current) { mountedRef.current = false; setMounted(false); }
                  if (through !== arrivedRef.current) { arrivedRef.current = through; setArrived(through); }
                }}
              />
            </div>
          </Suspense></SceneBoundary>
        )}
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
            <Suspense fallback={null}><MemoryGraph asFacet /></Suspense>
          </div>
        ) : (
          <FragmentPanel delay={0.05} instant={coldFacet && !moved} style={{ position: 'absolute', ...panelStyle, ...(isMobile ? { clipPath: 'polygon(0 10px, calc(100% - 10px) 0, 100% calc(100% - 10px), 10px 100%)' } : {}), opacity: arrived ? 1 : 0, transition: 'opacity 1.2s ease', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
