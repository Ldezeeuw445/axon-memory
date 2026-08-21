/**
 * A source's memories, read against open sky.
 *
 * This replaces diving through the summit. Burying the graph under the terrain
 * meant the thing you most wanted to read was behind the thing you were
 * standing on: nodes showed through the surface from every angle, the camera
 * had to thread a gap to see them, and for most of the move they were simply
 * not visible. Nothing about that was fixable by moving the camera better — the
 * geometry was in the way by design.
 *
 * So the structure grows upward instead, into the emptiest part of the scene.
 * There is nothing to occlude it, nothing to hide behind, and the summit's beam
 * already points that way — the graph is what the beam turns out to be carrying.
 *
 * The order is chronological and the connection is literal: each memory is
 * joined to the one before it, so the column reads bottom-to-top as "this is
 * what came first, and this is what built on it".
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

const GOLD = '#ffb02e';
const GOLD_DIM = '#7a4f10';

// A column has to stay legible from one viewpoint. Past roughly this many the
// spacing collapses and it becomes a texture rather than a graph, so the rest
// are counted rather than drawn.
const MAX_NODES = 26;

const RISE = 3.4;      // clearance above the summit before the first node
const STEP = 1.62;     // vertical distance between consecutive memories
const TWIST = 0.78;    // radians of rotation per step
const RADIUS = 2.15;   // how far each node stands off the axis

/**
 * Oldest at the bottom, newest at the top, on a slow helix.
 *
 * A straight vertical line would overlap its own cards; a helix separates them
 * in depth while keeping a single readable direction of travel. The radius eases
 * outward slightly so the base reads tighter than the top — the thread widening
 * as it accumulates.
 */
function layout(memories, origin) {
  return memories.map((m, i) => {
    const t = memories.length > 1 ? i / (memories.length - 1) : 0;
    const angle = i * TWIST;
    const r = RADIUS * (0.72 + t * 0.5);
    return {
      memory: m,
      index: i,
      position: new THREE.Vector3(
        origin.x + Math.cos(angle) * r,
        origin.y + RISE + i * STEP,
        origin.z + Math.sin(angle) * r,
      ),
      side: Math.cos(angle) >= 0 ? 1 : -1,
    };
  });
}

function MemoryCard({ memory, side, onSelect }) {
  const when = memory.occurred_at ? new Date(memory.occurred_at) : null;
  const label = (memory.detail || memory.source_type || 'memory').toUpperCase();

  return (
    <Html center={false} distanceFactor={13} zIndexRange={[30, 0]}
      style={{ transform: `translate(${side > 0 ? '16px' : 'calc(-100% - 16px)'}, -50%)` }}>
      <div
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect ? () => onSelect(memory) : undefined}
        onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(memory); } : undefined}
        style={{
          width: 244, padding: '12px 15px', borderRadius: 12,
          background: 'linear-gradient(160deg, rgba(24,17,6,0.95), rgba(10,8,4,0.95))',
          border: '1px solid rgba(255,176,46,0.24)',
          boxShadow: '0 12px 38px rgba(0,0,0,0.8)',
          fontFamily: "'Inter', sans-serif",
          cursor: onSelect ? 'pointer' : 'default',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.16em', color: GOLD, fontWeight: 600 }}>{label}</span>
          {when && <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.42)' }}>
            {when.toLocaleDateString([], { day: '2-digit', month: 'short' })}
          </span>}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.42, color: 'rgba(255,255,255,0.94)' }}>{memory.label}</div>
      </div>
    </Html>
  );
}

export default function MemorySky({ hub, memories = [], surfaceY = 0, riseRef = null, onSelectMemory = null }) {
  const lineMat = useRef(null);
  const nodeGroup = useRef(null);
  const shownCards = useRef(-1);

  const { nodes, lineGeo, hidden } = useMemo(() => {
    if (!hub) return { nodes: [], lineGeo: new THREE.BufferGeometry(), hidden: 0 };

    // Oldest first: the column is a timeline, and a timeline that runs newest-
    // first reads backwards no matter how it is drawn.
    const ordered = [...memories].sort((a, b) => {
      const ta = a.occurred_at ? Date.parse(a.occurred_at) : 0;
      const tb = b.occurred_at ? Date.parse(b.occurred_at) : 0;
      return ta - tb;
    });
    const shown = ordered.slice(0, MAX_NODES);
    const placed = layout(shown, new THREE.Vector3(hub.x, surfaceY, hub.z));

    // The beam from the summit to the first node, then each memory to the one
    // it follows. The line IS the claim that these build on each other.
    const pts = [];
    if (placed.length) {
      pts.push(hub.x, surfaceY, hub.z, placed[0].position.x, placed[0].position.y, placed[0].position.z);
    }
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i - 1].position;
      const b = placed[i].position;
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));

    return { nodes: placed, lineGeo: g, hidden: Math.max(0, ordered.length - shown.length) };
  }, [hub, memories, surfaceY]);

  useFrame(() => {
    const r = riseRef ? riseRef.current : 0;
    if (lineMat.current) lineMat.current.opacity = r * 0.8;

    if (nodeGroup.current) {
      // Revealed from the bottom up, so the eye is led along the timeline in
      // the order the memories happened rather than the whole column arriving
      // at once.
      const reach = r * (nodes.length + 4);
      nodeGroup.current.children.forEach((g, i) => {
        const local = THREE.MathUtils.clamp(reach - i, 0, 1);
        const dot = g.children[0]?.material;
        if (dot) dot.opacity = local;
        g.scale.setScalar(0.4 + local * 0.6);
      });

      // Cards are DOM, and toggling them every frame thrashes layout. Only the
      // count of visible ones is tracked, and only changes to it touch the DOM.
      const cards = Math.floor(THREE.MathUtils.clamp(reach - 0.6, 0, nodes.length));
      if (cards !== shownCards.current) {
        shownCards.current = cards;
        nodeGroup.current.children.forEach((g, i) => {
          if (g.children[1]) g.children[1].visible = r > 0.25 && i < cards;
        });
      }
    }
  });

  if (!hub || !nodes.length) return null;

  return (
    <group>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial ref={lineMat} color={GOLD_DIM} transparent opacity={0} toneMapped={false} />
      </lineSegments>

      <group ref={nodeGroup}>
        {nodes.map(({ memory, position, side }, i) => (
          <group key={memory.id ?? i} position={position}>
            <mesh>
              <sphereGeometry args={[0.15, 16, 16]} />
              <meshBasicMaterial color={GOLD} toneMapped={false} transparent opacity={0} />
            </mesh>
            <group visible={false}>
              <MemoryCard memory={memory} side={side} onSelect={onSelectMemory} />
            </group>
          </group>
        ))}
      </group>

      {hidden > 0 && (
        <Html position={[hub.x, surfaceY + RISE + nodes.length * STEP + 1.4, hub.z]} center distanceFactor={13}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
            + {hidden} MORE
          </div>
        </Html>
      )}
    </group>
  );
}
