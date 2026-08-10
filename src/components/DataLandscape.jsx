import React, { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Stars, Sparkles, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { DATA_SOURCES, AI_PROVIDERS } from '../lib/logos';
import { Activity, Radio, Database, ShieldAlert } from 'lucide-react';

const MAPPED_SOURCES = [
  { id: 'gmail', name: 'GMAIL', icon: DATA_SOURCES.find(s => s.id === 'gmail')?.Logo, type: 'source', pos: [-5, 3], count: 2451, status: 'ONLINE', freq: '2.45 GHz' },
  { id: 'openai', name: 'CHATGPT', icon: AI_PROVIDERS.find(s => s.id === 'openai')?.Logo, type: 'ai', pos: [-3, -2], count: 4782, status: 'PROCESSING', freq: '5.20 GHz' },
  { id: 'anthropic', name: 'CLAUDE', icon: AI_PROVIDERS.find(s => s.id === 'anthropic')?.Logo, type: 'ai', pos: [-6, -5], count: 3128, status: 'ONLINE', freq: '5.20 GHz' },
  { id: 'cursor', name: 'CURSOR', icon: AI_PROVIDERS.find(s => s.id === 'cursor')?.Logo, type: 'ai', pos: [-1.5, -8], count: 1986, status: 'SYNCING', freq: '1.20 GHz' },
  { id: 'perplexity', name: 'PERPLEXITY', icon: AI_PROVIDERS.find(s => s.id === 'perplexity')?.Logo, type: 'ai', pos: [2, 1], count: 2341, status: 'ONLINE', freq: '5.20 GHz' },
  { id: 'slack', name: 'SLACK', icon: DATA_SOURCES.find(s => s.id === 'slack')?.Logo, type: 'source', pos: [6, 3], count: 3457, status: 'ONLINE', freq: '2.45 GHz' },
  { id: 'linear', name: 'LINEAR', icon: DATA_SOURCES.find(s => s.id === 'linear')?.Logo, type: 'source', pos: [5, -3], count: 2019, status: 'STANDBY', freq: '1.80 GHz' },
  { id: 'github', name: 'GITHUB', icon: DATA_SOURCES.find(s => s.id === 'github')?.Logo, type: 'source', pos: [6.5, -6], count: 2894, status: 'ONLINE', freq: '2.45 GHz' },
  { id: 'apple_notes', name: 'NOTES', icon: DATA_SOURCES.find(s => s.id === 'apple_notes')?.Logo, type: 'source', pos: [3, -8], count: 1245, status: 'OFFLINE', freq: '0.00 GHz' },
];

function GalaxyBackground() {
  return (
    <>
      <color attach="background" args={['#020408']} />
      <Stars radius={100} depth={50} count={3000} factor={3} saturation={0} fade speed={0.3} />
      <Sparkles count={400} scale={30} size={10} speed={0.2} opacity={0.03} color="#ffccaa" />
      <Sparkles count={200} scale={40} size={15} speed={0.1} opacity={0.02} color="#ffffff" />
    </>
  );
}

function CinematicGoldenTerrain({ onNodeSelect }) {
  // Generate the shared geometry for both the solid base and the glowing wireframe
  const terrainGeometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(35, 35, 128, 128);
    const positions = geom.attributes.position;
    const count = positions.count;
    const colors = new Float32Array(count * 3);
    
    // Black base for invisible additive blending on valleys
    const colorBase = new THREE.Color('#000000'); 
    // Glowing gold for peaks
    const colorPeak = new THREE.Color('#ffaa00'); 
    
    for (let i = 0; i < count; i++) {
      const vx = positions.getX(i);
      const vy = positions.getY(i);
      
      let elevation = 0;
      
      // Base noise
      elevation += Math.sin(vx * 0.4) * Math.cos(vy * 0.4) * 0.4;
      elevation += Math.sin(vx * 1.5 + vy * 1.0) * 0.15;
      
      // Peaks based on data source activity
      MAPPED_SOURCES.forEach(source => {
        const dist = Math.sqrt(Math.pow(vx - source.pos[0], 2) + Math.pow(vy - source.pos[1], 2));
        if (dist < 4.5) {
          const height = (source.count / 1000) * 0.6 + 1.0;
          elevation += height * Math.exp(-(dist * dist) / 1.5);
        }
      });
      
      positions.setZ(i, elevation);

      // Color transition: dark valleys, glowing gold peaks
      const mix = Math.max(0, Math.min(1, (elevation - 0.3) / 2.5));
      const vertexColor = colorBase.clone().lerp(colorPeak, Math.pow(mix, 1.5)); // sharper transition
      
      colors[i * 3] = vertexColor.r;
      colors[i * 3 + 1] = vertexColor.g;
      colors[i * 3 + 2] = vertexColor.b;
    }
    
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <group rotation={[-Math.PI / 2.2, 0, 0]} position={[0, -2, -6]}>
      
      {/* 1. Solid Base Terrain (Matches background perfectly) */}
      <mesh geometry={terrainGeometry}>
        <meshStandardMaterial color="#020408" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* 2. Glowing Golden Wireframe Overlay */}
      <mesh geometry={terrainGeometry} position={[0, 0, 0.01]}>
        <meshBasicMaterial 
          vertexColors={true} 
          wireframe={true} 
          transparent={true}
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Peaks / Data Sources HUDs */}
      {MAPPED_SOURCES.map(source => {
        const Logo = source.icon;
        
        let elevation = Math.sin(source.pos[0] * 0.4) * Math.cos(source.pos[1] * 0.4) * 0.4;
        elevation += Math.sin(source.pos[0] * 1.5 + source.pos[1] * 1.0) * 0.15;
        const h = elevation + ((source.count / 1000) * 0.6 + 1.0);

        const offset = [1.5, 1.5, 1.8]; 
        const hudPos = [source.pos[0] + offset[0], source.pos[1] + offset[1], h + offset[2]];

        const isAlert = source.status === 'OFFLINE' || source.status === 'SYNCING';
        // Base color transitions: Gold for healthy, Red for alert
        const colorMain = isAlert ? '#ff3366' : '#ffaa00';
        const colorDim = isAlert ? 'rgba(255, 51, 102, 0.4)' : 'rgba(255, 170, 0, 0.4)';
        const glow = isAlert ? '0 0 20px rgba(255,51,102,0.5)' : '0 0 20px rgba(255,170,0,0.4)';

        return (
          <group key={source.id}>
            
            {/* Glowing Peak Node */}
            <mesh position={[source.pos[0], source.pos[1], h]}>
              <sphereGeometry args={[0.08, 16, 16]} />
              <meshBasicMaterial color={colorMain} />
            </mesh>

            {/* Vertical Light Ray */}
            <mesh position={[source.pos[0], source.pos[1], h + 1.5]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.3, 3, 16, 1, true]} />
              <meshBasicMaterial 
                color={colorMain} 
                transparent 
                opacity={0.3} 
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Connecting Laser Line to HUD */}
            <line>
              <bufferGeometry>
                <bufferAttribute 
                  attach="attributes-position" 
                  array={new Float32Array([
                    source.pos[0], source.pos[1], h,
                    hudPos[0], hudPos[1], hudPos[2] - 0.2
                  ])} 
                  count={2} 
                  itemSize={3} 
                />
              </bufferGeometry>
              <lineBasicMaterial color={colorMain} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
            </line>

            {/* Floating Glass HUD (with FragmentPanel shape) */}
            <Html position={hudPos} center zIndexRange={[100, 0]}>
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNodeSelect) onNodeSelect(source.id);
                }}
                style={{
                  width: '180px',
                  background: 'rgba(6, 10, 16, 0.75)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  borderTop: `1px solid ${colorDim}`,
                  borderBottom: `1px solid ${colorDim}`,
                  clipPath: 'polygon(0 16px, calc(100% - 16px) 0, 100% calc(100% - 16px), 16px 100%)', // The Shard Cut!
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: glow,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  transform: 'scale(1)',
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid rgba(255,255,255,0.1)`, paddingBottom: '8px' }}>
                  <div style={{ 
                    width: '24px', height: '24px', 
                    background: 'rgba(255,255,255,0.05)', 
                    borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {Logo && <Logo size={16} color="#fff" />}
                  </div>
                  <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px' }}>
                    {source.name}
                  </span>
                  {isAlert && <ShieldAlert size={12} color="#ff3366" style={{ marginLeft: 'auto' }} />}
                </div>

                {/* Data Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>VENDOR</span>
                    <span style={{ fontSize: '10px', color: '#fff', marginTop: '2px' }}>{source.type.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>FREQ</span>
                    <span style={{ fontSize: '10px', color: colorMain, marginTop: '2px' }}>{source.freq}</span>
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Database size={10} color={colorMain} />
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)' }}>Nodes:</span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>
                    {source.count.toLocaleString()}
                  </span>
                </div>

                {/* Status Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <Activity size={10} color={colorMain} />
                  <span style={{ fontSize: '9px', color: colorMain, letterSpacing: '0.5px', fontWeight: '600' }}>
                    STATUS: {source.status}
                  </span>
                </div>

              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export default function DataLandscape({ onNodeSelect }) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 6, 15], fov: 45 }}>
        <GalaxyBackground />
        
        <ambientLight intensity={0.5} />
        <spotLight position={[0, 20, 0]} intensity={2.5} angle={0.8} penumbra={1} color="#ffccaa" />
        <pointLight position={[15, 10, -5]} intensity={2} color="#ffaa00" />
        <pointLight position={[-15, 5, 5]} intensity={1.5} color="#445566" />
        
        <CinematicGoldenTerrain onNodeSelect={onNodeSelect} />
        <Environment preset="city" />
        
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          autoRotate={true}
          autoRotateSpeed={0.2}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={5}
          maxDistance={30}
          target={[0, 0, -3]}
        />
      </Canvas>
    </div>
  );
}
