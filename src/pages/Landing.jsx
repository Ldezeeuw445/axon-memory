import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import AxonCore from '../components/AxonCore';
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
  const [stage, setStage] = useState(0); 
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
  const [showToast, setShowToast] = useState(false);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeFacet, setActiveFacet] = useState(null); // 'dashboard' | 'graph' | 'connections' | 'billing'

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
        <Canvas camera={{ position: [0, 0, 10], fov: 35 }}>
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
          <group scale={isMobile ? 0.65 : 1}>
            <AxonCore stage={stage} injectionPulseTime={injectionTrigger} />
            <Shockwave position={isMobile ? [0, 4, 8.5] : [3.5, 0, 8.5]} triggerTime={injectionTrigger} />
          </group>

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
        <div style={{ position: 'absolute', top: 24, left: 32, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/favicon.svg" alt="AXON" style={{ width: 42, height: 42, borderRadius: 10 }} />
          <span className="title-text" style={{ fontSize: 16, letterSpacing: '2px', fontWeight: 'bold' }}>AXON</span>
        </div>

        {/* Auth Overlay */}
        <div style={{ position: 'absolute', top: 24, right: 32, zIndex: 50 }}>
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
              className="glass-button" 
              style={{ padding: '8px 24px', fontSize: 13, background: 'rgba(0, 243, 255, 0.1)', color: 'var(--color-neon-cyan)', borderColor: 'rgba(0, 243, 255, 0.3)' }}
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
              style={{ width: '400px', fontSize: '18px', color: 'var(--color-text-secondary)' }}
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
              style={{ width: '100%', height: '100%', position: 'absolute', pointerEvents: 'none' }}
            >
              {!activeFacet ? (
                <>
                  <FragmentPanel 
                    style={isMobile ? { position: 'absolute', top: '8%', left: '5%', right: '5%', pointerEvents: 'auto' } : { position: 'absolute', top: '20%', left: '10%', pointerEvents: 'auto' }} 
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
                    style={isMobile ? { position: 'absolute', bottom: '15%', left: '5%', right: '5%', pointerEvents: 'auto' } : { position: 'absolute', bottom: '25%', right: '10%', pointerEvents: 'auto' }} 
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
                <FragmentPanel
                  style={{
                    position: 'absolute',
                    top: '8%', bottom: '12%',
                    left: isMobile ? '5%' : '10%', right: isMobile ? '5%' : '10%',
                    pointerEvents: 'auto',
                    display: 'flex', flexDirection: 'column',
                    padding: '24px'
                  }}
                  delay={0.1}
                >
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {activeFacet === 'dashboard' && <Dashboard asFacet={true} />}
                    {activeFacet === 'graph' && <MemoryGraph asFacet={true} />}
                    {activeFacet === 'connections' && <ConnectionsFacet />}
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
