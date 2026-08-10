/**
 * MemoryTerrainMap - volumetric memory terrain, ported from AXE CORE HQ.
 *
 * The rendering, lighting and camera work are byte-for-byte the AXE CORE
 * version (that terrain is the better-looking one, so it is the shared
 * house style now). Only the data layer differs: AXE CORE feeds it
 * BrainHub[], AXON feeds it real `source_connections` / `memory_items`
 * rows via `hubsFromAxonSources` below.
 *
 *   - click a gold summit -> onFocusHub(id)   (camera flies in, leaf ring appears)
 *   - click a leaf node   -> onSelectLeaf(item)  (opens the memory card)
 *   - click empty / ESC   -> onBackground()   (camera returns to overview)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { buildTerrainEngine, TERRAIN_GOLD } from './terrainEngine';
import TerrainSceneMesh from './TerrainSceneMesh';
import TerrainMarkers, { TerrainCameraRig, computeLeafRing } from './TerrainMarkers';

/**
 * Turn AXON's real data into terrain hubs.
 *
 * `sources` rows come straight from `source_connections` (provider, status,
 * item_count) plus the connected AI adapters; `totalItems` is the live
 * `memory_items` count that gives the central AXON summit its height.
 */
export function hubsFromAxonSources(sources, totalItems) {
  const hubs = [
    {
      id: 'axon-core',
      label: 'AXON',
      memoryCount: totalItems,
      isCore: true,
    },
  ];
  sources.forEach((s) => {
    hubs.push({
      id: s.id,
      label: s.name,
      memoryCount: s.count ?? 0,
      status: s.status,
      kind: s.type,
      icon: s.icon,
    });
  });
  return hubs;
}

/** Convert normalized hubs into a terrain config (gold caps + decorative rock). */
function configFromHubs(hubs) {
  const core = hubs.find((h) => h.isCore) ?? null;
  const rest = hubs.filter((h) => !h.isCore);
  const n = Math.max(rest.length, 1);
  const maxCount = Math.max(1, ...rest.map((h) => h.memoryCount || 0));

  const cfgHubs = [];
  if (core) {
    cfgHubs.push({
      id: core.id,
      name: core.label,
      memories: core.memoryCount,
      color: TERRAIN_GOLD,
      position: [0, -2],
      height: 5.8,
      radius: 8,
      hideLabel: true, // the center-title overlay already announces AXON
      source: core,
    });
  }
  rest.forEach((h, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + ((i * 17) % 5) * 0.05;
    const ring = i % 2 === 0 ? 15 : 21;
    const jitter = (((i * 53) % 7) / 7 - 0.5) * 2.4;
    const r = ring + jitter;
    const t = Math.min(1, (h.memoryCount || 0) / maxCount);
    cfgHubs.push({
      id: h.id,
      name: h.label,
      memories: h.memoryCount || 0,
      color: TERRAIN_GOLD,
      position: [Math.cos(angle) * r, Math.sin(angle) * r * 0.82],
      height: 2.1 + 1.4 * t,
      radius: 3.8 + 1.8 * t,
      icon: h.icon,
      source: h,
    });
  });
  // decorative rock mountains (no caps) for a fuller range
  cfgHubs.push(
    { id: 'deco-1', name: null, memories: 0, position: [26, 12], height: 1.8, radius: 3.5 },
    { id: 'deco-2', name: null, memories: 0, position: [-25, 14], height: 1.7, radius: 3.5 },
    { id: 'deco-3', name: null, memories: 0, position: [6, 24], height: 1.6, radius: 3.2 },
    { id: 'deco-4', name: null, memories: 0, position: [-24, -16], height: 1.5, radius: 3.2 },
    { id: 'deco-5', name: null, memories: 0, position: [27, -14], height: 1.6, radius: 3.4 },
  );
  return { seed: 7, size: 64, baseHeight: 1.1, hubs: cfgHubs };
}

/** Cinematic entrance: terrain + markers rise smoothly from flat. */
function RiseIn({ children, duration = 2.4 }) {
  const ref = useRef(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (t.current < duration && ref.current) {
      t.current += dt;
      const p = Math.min(1, t.current / duration);
      const e = 1 - Math.pow(1 - p, 3);
      ref.current.scale.set(1, Math.max(0.002, e), 1);
    }
  });
  return (
    <group ref={ref} scale={[1, 0.002, 1]}>
      {children}
    </group>
  );
}

export default function MemoryTerrainMap({
  hubs,
  focusHubId,
  onFocusHub,
  onSelectLeaf,
  onBackground,
  leaves: leafData = [],
  autoRotate = false,
  showLeafLabels = true,
}) {
  const [canvasKey, setCanvasKey] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const controlsRef = useRef(null);

  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const coarse =
      typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return ua || coarse;
  }, []);

  const config = useMemo(() => configFromHubs(hubs), [hubs]);
  const engine = useMemo(() => buildTerrainEngine(config), [config]);

  const selected = useMemo(
    () => engine.hubs.find((h) => h.id === focusHubId) ?? null,
    [engine, focusHubId],
  );

  const placedLeaves = useMemo(() => {
    if (!selected) return [];
    return computeLeafRing(selected, leafData, engine);
  }, [selected, leafData, engine]);

  const handleSelectHub = useCallback((hub) => onFocusHub(hub.id), [onFocusHub]);

  const handleSelectLeaf = useCallback(
    (leaf) => {
      if (leaf.source) onSelectLeaf(leaf.source);
    },
    [onSelectLeaf],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onBackground();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBackground]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#020409' }}>
      <Canvas
        key={canvasKey}
        shadows={!isMobile}
        dpr={isMobile ? [1, 1.25] : [1, 1.6]}
        camera={{ position: [0, 18, 31], fov: 48, near: 0.1, far: 500 }}
        gl={{
          antialias: !isMobile,
          powerPreference: 'default',
          alpha: false,
          stencil: false,
          depth: true,
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener(
            'webglcontextlost',
            (e) => {
              e.preventDefault();
              setTimeout(() => setCanvasKey((k) => k + 1), 300);
            },
            false,
          );
        }}
        onPointerMissed={() => onBackground()}
      >
        <color attach="background" args={['#020409']} />
        <fog attach="fog" args={['#020409', 55, 130]} />
        <RiseIn>
          <TerrainSceneMesh engine={engine} resolution={isMobile ? 128 : 200} shadowsEnabled={!isMobile} />
          <TerrainMarkers
            engine={engine}
            selected={selected}
            leaves={placedLeaves}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelectHub={handleSelectHub}
            onSelectLeaf={handleSelectLeaf}
            showLeafLabels={showLeafLabels}
          />
        </RiseIn>
        <Stars radius={150} depth={70} count={isMobile ? 1200 : 3000} factor={3.2} saturation={0} fade speed={0.5} />
        <TerrainCameraRig engine={engine} selected={selected} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={58}
          maxPolarAngle={1.42}
          autoRotate={autoRotate}
          autoRotateSpeed={0.35}
          target={[0, 0.5, 0]}
        />
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={isMobile ? 0.95 : 1.1}
            luminanceThreshold={0.35}
            luminanceSmoothing={0.25}
            mipmapBlur
            radius={0.8}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
