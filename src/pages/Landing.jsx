import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor, Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import AxonCore from '../components/AxonCore';
import CoreGateway from '../components/CoreGateway';
import MemoryParticle from '../components/MemoryParticle';
import FragmentPanel from '../components/FragmentPanel';
import ConnectSourceModal from '../components/ConnectSourceModal';
import ExtractionPanel from '../components/ExtractionPanel';
import Shockwave from '../components/Shockwave';
import { startAmbientHum, playGlassTick, playAxonChord } from '../lib/audio';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import MemoryGraph from './MemoryGraph';
import ConnectionsFacet from './ConnectionsFacet';
import { LayoutDashboard, Network, Link, CreditCard } from 'lucide-react';
import { callFunction } from '../lib/functions';


/**
 * Choosing a facet used to release CorePortal's panel and withdraw the shell
 * while the camera itself stayed bolted to [0,0,10] — the content in front
 * of the viewer moved, but the viewer never went anywhere, so it read as
 * watching a panel open rather than flying into the Core. This moves the
 * camera through the gap the panel leaves, forward and past where the shell
 * withdrew to. Mirrors CorePortal's own easing and open/close speed (1.25 /
 * 2.0) exactly so the dive and the release are one motion, not two things
 * that happen to run near the same time.
 */
function GalaxyBackground() {
  return (
    <>
      <color attach="background" args={['#020203']} />
      <Stars radius={100} depth={50} count={3000} factor={3} saturation={0} fade speed={0.3} />
      {/* Volumetric deep blue nebula dust */}
      <Sparkles count={400} scale={30} size={15} speed={0.1} opacity={0.03} color="#7f93b5" />
      <Sparkles count={200} scale={40} size={25} speed={0.05} opacity={0.02} color="#93a5c0" />
    </>
  );
}

export default function Landing() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const FACETS = ['dashboard', 'graph', 'connections', 'billing'];
  const requestedFacet = (() => {
    const f = new URLSearchParams(window.location.search).get('facet');
    return FACETS.includes(f) ? f : null;
  })();
  const [stage, setStage] = useState(requestedFacet ? 3 : 0); 
  // 0: Cold Open
  // 1: The Void
  // 2: Core Awakens
  // 3: Experience (UI Fragments appear)
  // 4: Extraction Phase (A panel morphs to screen)
  // 5: Injection Phase (Panel compresses and shoots into space)
  
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [injectedParticles, setInjectedParticles] = useState([]);
  const [injectionTrigger, setInjectionTrigger] = useState(0);
  const [experienceTrigger, setExperienceTrigger] = useState(0);
  const [perfDpr, setPerfDpr] = useState(1.5);
  const [showToast, setShowToast] = useState(false);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Openable straight onto a facet via ?facet=, so the app has exactly one
  // surface. The standalone /dashboard, /sources and /graph routes carried a
  // completely different visual language and dropped people out of the shell;
  // they now redirect here instead.
  const [activeFacet, setActiveFacet] = useState(requestedFacet);
  // Aperture drives geometry inside AxonCore, so it is mirrored in a ref for
  // the frame loop and in state only so React re-renders the prop. Progress
  // stays a ref alone — it changes every frame and nothing renders from it.
  const apertureRef = useRef(0);
  const arrivalRef = useRef(0);
  // The far side of the passage. Content must not exist before the camera has
  // gone through — a panel appearing mid-flight turns the journey back into a
  // page load with scenery.
  const [arrived, setArrived] = useState(!!requestedFacet);
  const arrivedRef = useRef(!!requestedFacet);
  const [facetMounted, setFacetMounted] = useState(!!requestedFacet);
  const mountedRef = useRef(!!requestedFacet);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const [typedText, setTypedText] = useState('');
  const fullText = 'As I mentioned yesterday...';

  useEffect(() => {
    if (stage === 0) {
      let i = 0;
      const interval = setInterval(() => {
        setTypedText(fullText.slice(0, i));
        i++;
        if (i > fullText.length) {
          clearInterval(interval);
          setTimeout(() => {
            setTypedText('As I mentioned...');
            setTimeout(() => setStage(1), 2000); 
          }, 1500);
        }
      }, 100);
      return () => clearInterval(interval);
    }
    
    if (stage === 1) {
      startAmbientHum();
      setTimeout(() => setStage(2), 4000); 
    }
    
    if (stage === 2) {
      playAxonChord();
    }
  }, [stage]);

  const handleExperienceClick = () => {
    playGlassTick('medium');
    setExperienceTrigger(Date.now());
    setStage(3);
  };

  const handleConnectSourceClick = () => {
    playGlassTick('light');
    setIsConnectModalOpen(true);
  };

  const handleAppConnect = (appType) => {
    playGlassTick('heavy');
    setIsConnectModalOpen(false);
    setSelectedApp(appType);
    // Transition to the Extraction Shard animation
    setStage(4);
  };

  const handleCompress = () => {
    playGlassTick('heavy');
    setStage(5);
    setInjectionTrigger(Date.now());
    
    // Spawn a new injected particle
    const newParticle = {
      id: `injected-${Date.now()}`,
      position: [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8],
      weight: 'heavy',
      isNewInjection: true
    };
    setInjectedParticles(prev => [...prev, newParticle]);
    
    // Return to default UI state after the particle has flown in (1.5 seconds)
    setTimeout(() => {
      setStage(3);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    }, 1500);
  };

  const particlesData = React.useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      position: [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12],
      weight: i % 3 === 0 ? 'heavy' : 'light'
    }));
  }, []);

  return (
    <div className="full-screen">
      {/* The 3D Field */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Canvas dpr={[0.75, perfDpr]} camera={{ position: [0, 0, 10], fov: 35 }}>
          {/* Same trade as the terrain: full resolution while it is affordable,
              stepped down only when frames actually slip. The transmission
              material on the Core is the expensive part, and it scales with
              pixel count. */}
          <PerformanceMonitor
            onDecline={() => setPerfDpr((d) => Math.max(0.75, d - 0.25))}
            onIncline={() => setPerfDpr((d) => Math.min(1.75, d + 0.25))}
          />
          <AdaptiveDpr pixelated={false} />
          <ambientLight intensity={0.1} />
          <spotLight position={[0, 10, 5]} angle={0.3} penumbra={1} intensity={2} color="#ffffff" />
          
          <GalaxyBackground />

          {stage >= 1 && (
            <>
              {particlesData.map((data) => (
                <MemoryParticle 
                  key={data.id} 
                  position={data.position} 
                  weight={data.weight}
                  stage={stage}
                />
              ))}
              {injectedParticles.map((data) => (
                <MemoryParticle 
                  key={data.id} 
                  position={data.position} 
                  weight={data.weight}
                  stage={stage}
                  isNewInjection={data.isNewInjection}
                />
              ))}
            </>
          )}

          {/* 3D SCENE */}
          <CoreGateway
            active={!!activeFacet}
            baseScale={isMobile ? 0.65 : 1}
            apertureRef={apertureRef}
            onProgress={(p, through) => {
              arrivalRef.current = p;
              // Mounted well before it is shown. Building the terrain is the
              // most expensive thing in the sequence, and doing it at the
              // moment of arrival put a stutter exactly where the motion had to
              // be smoothest. It now happens mid-flight, behind the Core, where
              // a dropped frame is invisible.
              if (p > 0.4 && !mountedRef.current) { mountedRef.current = true; setFacetMounted(true); }
              if (p === 0 && mountedRef.current) { mountedRef.current = false; setFacetMounted(false); }
              if (through !== arrivedRef.current) { arrivedRef.current = through; setArrived(through); }
            }}
          >
            <AxonCore stage={stage} injectionPulseTime={injectionTrigger} experiencePulseTime={experienceTrigger} opening={!!activeFacet} apertureRef={apertureRef} />
            <Shockwave position={isMobile ? [0, 4, 8.5] : [3.5, 0, 8.5]} triggerTime={injectionTrigger} />
          </CoreGateway>

          {/*
            Was <Environment preset="city" />, which fetches an HDR from a CDN —
            and that URL now 404s, so the Core was refracting an empty
            environment. A transmission material with nothing around it reads
            as dull grey plastic no matter how its own parameters are tuned.

            Built here instead: no network dependency, and a studio shaped for
            a dark premium product rather than a generic street. The narrow
            strips matter most — they are what sweep across the facets as the
            Core turns, and sharp moving highlights are what the eye reads as
            polished mineral.
          */}
          <Environment resolution={256}>
            <Lightformer form="rect" intensity={9} position={[0, 8, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 10, 1]} color="#dfe9ff" />
            <Lightformer form="rect" intensity={5.2} position={[-8, 2, -6]} scale={[12, 9, 1]} color="#9fb6e0" />
            <Lightformer form="rect" intensity={2.8} position={[8, -1, 5]} scale={[9, 7, 1]} color="#6d7f9e" />
            <Lightformer form="rect" intensity={16} position={[-3.2, 4, 4]} scale={[0.35, 7, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={11} position={[3.6, -2, 3.5]} scale={[0.3, 6, 1]} color="#cfe2ff" />
            <Lightformer form="circle" intensity={2.2} position={[0, -6, 1]} scale={[7, 7, 1]} color="#2a3a5c" />
            <Lightformer form="rect" intensity={4.5} position={[-7, -3, 3]} scale={[11, 9, 1]} color="#8d9bb8" />
            <Lightformer form="rect" intensity={2.6} position={[0, 0, -9]} scale={[13, 11, 1]} color="#6c7893" />
            <Lightformer form="rect" intensity={3.2} position={[-6, 5, 1]} scale={[8, 7, 1]} color="#aab6cc" />
          </Environment>
        </Canvas>
      </div>

      {/* The 2D Narrative Layer */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        
        {/* Logo */}
        <div style={{ position: 'absolute', top: 24, left: 32, zIndex: 200, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/axon_logo.png" alt="AXON" style={{ width: 42, height: 42, borderRadius: 10 }} />
          <span className="title-text" style={{ fontSize: 16, letterSpacing: '2px', fontWeight: 'bold' }}>AXON</span>
        </div>

        {/* Auth Overlay */}
        <div style={{ position: 'absolute', top: 24, right: 32, zIndex: 200 }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                {user.user_metadata?.full_name || user.email}
              </span>
              <button 
                onClick={signOut}
                className="glass-button" 
                style={{ padding: '6px 16px', fontSize: 12, background: 'rgba(255,255,255,0.05)' }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '9px 22px',
                fontSize: 12.5,
                letterSpacing: '0.08em',
                fontWeight: 500,
                color: 'rgba(255,255,255,0.92)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 999,
                cursor: 'pointer',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: '0 6px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
                transition: 'background 0.25s ease, border-color 0.25s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.06))'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
            >
              Sign In
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {stage === 0 && (
            <motion.div 
              key="cold-open"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              style={{ width: '400px', fontSize: '18px', color: 'rgba(255,255,255,0.92)', textShadow: '0 1px 12px rgba(0,0,0,0.9)' }}
            >
              <div style={{ padding: '24px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                {typedText}
                <motion.span 
                  animate={{ opacity: [1, 0] }} 
                  transition={{ repeat: Infinity, duration: 0.8 }}
                >
                  |
                </motion.span>
              </div>
            </motion.div>
          )}

          {stage === 1 && (
            <motion.div
              key="void"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
              style={{ position: 'absolute', bottom: '10%', textAlign: 'center', width: '100%' }}
            >
              <p className="title-text" style={{ fontSize: '14px', letterSpacing: '1px', opacity: 0.5 }}>
                Every piece of context, scattered.
              </p>
            </motion.div>
          )}

          {stage === 2 && (
            <motion.div
              key="core"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: 2, duration: 2 }}
              style={{ position: 'absolute', bottom: '15%', textAlign: 'center', width: '100%' }}
            >
              <p className="title-text" style={{ fontSize: '14px', letterSpacing: '2px', color: 'var(--color-text-secondary)' }}>
                ONE MEMORY. EVERY APP.
              </p>
              <motion.button 
                className="glass-surface"
                whileHover={{ scale: 1.02 }}
                onClick={handleExperienceClick}
                style={{ 
                  marginTop: '32px', 
                  padding: '12px 32px', 
                  color: 'white', 
                  background: 'transparent',
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                Experience AXON
              </motion.button>
            </motion.div>
          )}

          {stage === 3 && (
            <motion.div
              key="ui-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
              style={{ width: '100%', height: '100%', position: 'absolute', pointerEvents: 'none', zIndex: 10 }}
            >
              {!activeFacet ? (
                <>
                  <FragmentPanel 
                    style={isMobile ? { position: 'absolute', top: '8%', left: '5%', right: '5%', pointerEvents: 'auto' } : { position: 'absolute', top: '26%', left: '15%', pointerEvents: 'auto' }} 
                    delay={0.2}
                  >
                    <div style={{ marginBottom: '24px' }}>
                      <h3 className="title-text" style={{ fontSize: '18px', color: 'white', marginBottom: '16px' }}>Neural Link</h3>
                      <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                        Connection established. <br/>Memory threads are stable.
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <button className="glass-button" onClick={() => setActiveFacet('connections')}>
                        + Connect Source
                      </button>
                      <button className="glass-button" onClick={() => setActiveFacet('graph')}>
                        View Constellation
                      </button>
                    </div>
                  </FragmentPanel>
    
                  <FragmentPanel 
                    style={isMobile ? { position: 'absolute', bottom: '15%', left: '5%', right: '5%', pointerEvents: 'auto' } : { position: 'absolute', bottom: '9%', right: '5%', pointerEvents: 'auto' }} 
                    delay={0.4}
                  >
                    <h3 className="title-text" style={{ fontSize: '18px', color: 'white', marginBottom: '16px' }}>Active Thread</h3>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.6', fontStyle: 'italic' }}>
                      "As I mentioned yesterday, the architecture needs to reflect the physical reality of a memory. It cannot be confined to a grid."
                    </p>
                    <div style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)' }}>
                      Source: Brainstorm Session • 14:02
                    </div>
                  </FragmentPanel>
                </>
              ) : (
                !facetMounted ? null : activeFacet === 'graph' ? (
                  /* No panel, no inset, no border: the terrain sits directly in
                     the galaxy the camera just entered. A card around it would
                     re-announce that this is a webpage, which is the one thing
                     the passage exists to avoid. */
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', opacity: arrived ? 1 : 0, transition: 'opacity 1.2s ease' }}>
                    <MemoryGraph asFacet={true} />
                  </div>
                ) : (
                <FragmentPanel
                  style={{
                    position: 'absolute',
                    opacity: arrived ? 1 : 0,
                    transition: 'opacity 1.2s ease',
                    top: '8%', bottom: '12%',
                    left: isMobile ? '5%' : '10%', right: isMobile ? '5%' : '10%',
                    pointerEvents: 'auto',
                    display: 'flex', flexDirection: 'column',
                    // The terrain runs to the panel's edge; the reading facets
                    // keep their inset. The padding was what drew the inner
                    // rectangle that made it a box inside a box.
                    padding: '24px',
                    overflow: 'hidden'
                  }}
                  delay={0.1}
                >
                  {/* A height:100% child inside an `overflow:auto` box resolves
                      against content height, not the box — so the terrain canvas
                      collapsed to nothing and the panel rendered black. This is a
                      flex column with min-height 0 so children can be given real
                      height; the graph fills it, the rest scroll on their own. */}
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {activeFacet === 'dashboard' && <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><Dashboard asFacet={true} /></div>}
                    {activeFacet === 'connections' && <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><ConnectionsFacet /></div>}
                    {activeFacet === 'billing' && (
                      <div style={{ textAlign: 'center', padding: '40px' }}>
                        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>AXON Pro</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>
                          Unlock unlimited adapters, memory nodes & data sources.
                        </p>
                        <button 
                          className="btn-primary" 
                          onClick={async () => {
                            try {
                              const data = await callFunction('stripe-checkout', { method: 'POST', body: { tier: 'pro' } });
                              if (data?.url) window.location.href = data.url;
                              else alert('Stripe is not fully configured yet!');
                            } catch {
                              navigate('/subscription');
                            }
                          }}
                        >
                          Upgrade to Pro
                        </button>
                      </div>
                    )}
                  </div>
                </FragmentPanel>
                )
              )}
            </motion.div>
          )}

          {stage === 4 && (
            <ExtractionPanel 
              appType={selectedApp} 
              onCompress={handleCompress} 
              isMobile={isMobile}
            />
          )}

        </AnimatePresence>

        {/* Dock Navigation */}
        {user && stage >= 3 && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 16px',
              background: 'rgba(10, 12, 16, 0.7)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px',
              zIndex: 100
            }}
          >
            {[
              { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
              { id: 'graph', icon: <Network size={18} />, label: 'Memory Graph' },
              { id: 'connections', icon: <Link size={18} />, label: 'Connections' },
              { id: 'billing', icon: <CreditCard size={18} />, label: 'Pro' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveFacet(activeFacet === item.id ? null : item.id)}
                style={{
                  background: activeFacet === item.id ? 'rgba(0,243,255,0.15)' : 'transparent',
                  color: activeFacet === item.id ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  boxShadow: activeFacet === item.id ? 'inset 0 0 0 1px rgba(0,243,255,0.3)' : 'none'
                }}
                title={item.label}
              >
                {item.icon}
              </button>
            ))}
          </motion.div>
        )}

        {/* TOAST NOTIFICATION */}
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: isMobile ? '-50%' : 0 }}
              animate={{ opacity: 1, y: 0, x: isMobile ? '-50%' : 0 }}
              exit={{ opacity: 0, y: -20, x: isMobile ? '-50%' : 0 }}
              className="glass-surface"
              style={{
                position: 'fixed',
                top: isMobile ? '20px' : '32px',
                right: isMobile ? 'auto' : '32px',
                left: isMobile ? '50%' : 'auto',
                background: 'rgba(196, 214, 60, 0.15)', // hex color glassmorphism
                backdropFilter: 'blur(20px)',
                border: 'none', // Removed outline as requested
                padding: '12px 32px',
                borderRadius: '0px',
                color: '#C4D63C',
                fontSize: '11px',
                fontWeight: 'normal', // sleek, not too thick
                letterSpacing: '4px',
                pointerEvents: 'none',
                boxShadow: '0 4px 30px rgba(196, 214, 60, 0.2)',
                whiteSpace: 'nowrap',
                transform: isMobile ? 'translateX(-50%)' : 'none'
              }}
            >
              DATA THREADED
            </motion.div>
          )}
        </AnimatePresence>

        <ConnectSourceModal 
          isOpen={isConnectModalOpen} 
          onClose={() => setIsConnectModalOpen(false)} 
          onConnect={handleAppConnect} 
        />
      </div>
    </div>
  );
}
