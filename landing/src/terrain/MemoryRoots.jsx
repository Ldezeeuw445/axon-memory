/**
 * What lies under a summit.
 *
 * The terrain is a topographic map of the memory graph: height is density. That
 * makes it excellent for overview and useless for detail. Rather than switching
 * to a separate "graph view" — which would read as a second app — the camera
 * dives through the surface and the same peak continues downward as a root
 * system, with the actual memories hanging off it.
 *
 * The spatial position is kept: a hub that sat on the right of the terrain has
 * its roots on the right too, so the visitor keeps their bearings across the
 * dive. Same starfield, same grade, one continuous space.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

const GOLD = '#ffb02e';
const GOLD_DIM = '#8a5a12';

/** Deterministic jitter so a given hub always grows the same root. */
function seeded(n) {
  let s = Math.abs(Math.floor(n * 9973)) + 17;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

/**
 * Grow a branching root from the summit down. Memories are hung on the tips,
 * so the structure is the data rather than decoration around it.
 */
function buildRoots(origin, memories, seedBase) {
  const rand = seeded(seedBase);
  const segments = [];
  const nodes = [];

  const count = Math.max(memories.length, 1);
  // Enough tips for every memory, grown over two or three splits.
  const branches = Math.min(Math.max(2, Math.ceil(Math.sqrt(count))), 4);

  const grow = (from, dir, depth, budget, tipsWanted) => {
    const len = 2.6 - depth * 0.45 + rand() * 0.8;
    const to = from.clone().add(dir.clone().multiplyScalar(len));
    segments.push([from, to]);

    if (depth >= 2 || tipsWanted <= 1) {
      nodes.push(to);
      return;
    }
    const kids = Math.min(tipsWanted, branches);
    const per = Math.ceil(tipsWanted / kids);
    for (let i = 0; i < kids; i++) {
      const spread = 0.55 + rand() * 0.35;
      const ang = (i / kids) * Math.PI * 2 + rand() * 0.6;
      const next = new THREE.Vector3(
        Math.cos(ang) * spread,
        -1,
        Math.sin(ang) * spread,
      ).normalize();
      // Bias downward so the whole thing reads as descending, not exploding.
      next.y = Math.min(next.y, -0.55);
      grow(to, next.normalize(), depth + 1, budget, per);
    }
  };

  grow(origin.clone(), new THREE.Vector3(0, -1, 0), 0, count, count);

  // A tip per memory, in the order they came in.
  const tips = nodes.slice(0, memories.length);
  return { segments, tips };
}

function MemoryCard({ memory, side, onSelect }) {
  const label = (memory.detail || memory.source_type || 'memory').toUpperCase();
  const when = memory.occurred_at ? new Date(memory.occurred_at) : null;

  return (
    <Html
      center={false}
      distanceFactor={14}
      zIndexRange={[30, 0]}
      style={{ transform: `translateX(${side > 0 ? '18px' : 'calc(-100% - 18px)'})` }}
    >
      <div
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect ? () => onSelect(memory) : undefined}
        onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(memory); } : undefined}
        style={{
          width: 232,
          padding: '13px 15px',
          borderRadius: 12,
          background: 'linear-gradient(160deg, rgba(24,17,6,0.94), rgba(11,8,4,0.94))',
          border: '1px solid rgba(255,176,46,0.22)',
          boxShadow: '0 10px 34px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,205,120,0.09)',
          fontFamily: "'Inter', sans-serif",
          backdropFilter: 'blur(3px)',
          cursor: onSelect ? 'pointer' : 'default',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.16em', color: GOLD, fontWeight: 600 }}>{label}</span>
          {when && (
            <span style={{ fontSize: 9.5, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.42)' }}>
              {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div style={{ height: 1, background: 'rgba(255,176,46,0.18)', marginBottom: 9 }} />
        <div style={{ fontSize: 13.5, lineHeight: 1.42, color: 'rgba(255,255,255,0.94)', fontWeight: 500 }}>
          {memory.label}
        </div>
        {when && (
          <div style={{ marginTop: 9, fontSize: 10, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.34)' }}>
            {when.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
          </div>
        )}
      </div>
    </Html>
  );
}

export default function MemoryRoots({ hub, memories = [], surfaceY = 0, diveRef = null, onSelectMemory = null }) {
  const lineMat = useRef(null);
  const nodeGroup = useRef(null);
  const cardsOn = useRef(false);
  const { segments, tips } = useMemo(() => {
    if (!hub) return { segments: [], tips: [] };
    const origin = new THREE.Vector3(hub.x, surfaceY - 0.4, hub.z);
    return buildRoots(origin, memories, hub.x * 3.1 + hub.z);
  }, [hub, memories, surfaceY]);

  const lineGeo = useMemo(() => {
    const pts = [];
    segments.forEach(([a, b]) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [segments]);

  useFrame(() => {
    // Only the hub you opened. Every hub used to draw its roots at a 0.55
    // baseline so each one "stood on its own" — but nine hubs all showing their
    // memories at once buries the terrain under cards nobody asked for, and
    // they read through the surface as clutter rather than as depth. diveRef is
    // set only on the selected hub; everything else stays at zero.
    const d = diveRef ? diveRef.current : 0;
    if (lineMat.current) lineMat.current.opacity = d * 0.85;
    if (nodeGroup.current) {
      nodeGroup.current.children.forEach((g) => {
        const m = g.children[0]?.material;
        if (m) m.opacity = d;
      });
      // Cards readable by default; diving into a hub just brings them fully up.
      const want = d > 0.3;
      if (want !== cardsOn.current) {
        cardsOn.current = want;
        nodeGroup.current.children.forEach((g) => {
          if (g.children[1]) g.children[1].visible = want;
        });
      }
    }
  });

  if (!hub) return null;

  return (
    <group>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial ref={lineMat} color={GOLD_DIM} transparent opacity={0} toneMapped={false} />
      </lineSegments>

      <group ref={nodeGroup}>
      {tips.map((p, i) => {
        const m = memories[i];
        if (!m) return null;
        // Alternate sides so cards never stack on one another.
        const side = i % 2 === 0 ? 1 : -1;
        return (
          <group key={m.id ?? i} position={p}>
            <mesh>
              <sphereGeometry args={[0.13, 14, 14]} />
              <meshBasicMaterial color={GOLD} toneMapped={false} transparent opacity={0} />
            </mesh>
            <group visible={false}><MemoryCard memory={m} side={side} onSelect={onSelectMemory} /></group>
          </group>
        );
      })}
      </group>
    </group>
  );
}
