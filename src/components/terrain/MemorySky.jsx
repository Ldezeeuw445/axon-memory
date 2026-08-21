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
import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

const GOLD = '#ffb02e';
const GOLD_DIM = '#7a4f10';

// Every memory a source holds gets a node. What has to give instead is the
// spacing: a hundred and sixty at a fixed step would be a column three hundred
// units tall that you could only ever see a slice of.
const RISE = 3.4;        // clearance above the summit before the first node
const STEP_MAX = 1.62;   // spacing for a handful of memories
const COLUMN_HEIGHT = 46; // the tallest a column gets, however many it holds
const TWIST = 0.78;      // radians of rotation per step at full spacing
const RADIUS = 2.15;     // how far each node stands off the axis

// Cards are DOM and cost real layout, and a hundred at once is unreadable
// anyway. The nodes nearest whatever the viewer is looking at get one; the rest
// stay as points on the thread until you move to them.
const CARDS_IN_VIEW = 10;

/**
 * Oldest at the bottom, newest at the top, on a slow helix.
 *
 * A straight vertical line would overlap its own cards; a helix separates them
 * in depth while keeping a single readable direction of travel. The radius eases
 * outward slightly so the base reads tighter than the top — the thread widening
 * as it accumulates.
 */
function layout(memories, origin) {
  const n = memories.length;
  // Compressed only as far as it has to be. A short column keeps generous
  // spacing; a long one tightens until it fits, so the whole source is one
  // object you can take in rather than a scroll you have to fly along.
  const step = n > 1 ? Math.min(STEP_MAX, COLUMN_HEIGHT / (n - 1)) : STEP_MAX;
  // The twist keeps pace with the spacing, or a compressed column would wind
  // so fast it reads as noise.
  const twist = TWIST * (step / STEP_MAX) * 3.2;
  return memories.map((m, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const angle = i * twist;
    const r = RADIUS * (0.72 + t * 0.5);
    return {
      memory: m,
      index: i,
      position: new THREE.Vector3(
        origin.x + Math.cos(angle) * r,
        origin.y + RISE + i * step,
        origin.z + Math.sin(angle) * r,
      ),
      side: Math.cos(angle) >= 0 ? 1 : -1,
    };
  });
}

function MemoryCard({ memory, side, open, onToggle }) {
  const when = memory.occurred_at ? new Date(memory.occurred_at) : null;
  const label = (memory.detail || memory.source_type || 'memory').toUpperCase();

  return (
    <Html center={false} distanceFactor={13} zIndexRange={[30, 0]}
      style={{ transform: `translate(${side > 0 ? '16px' : 'calc(-100% - 16px)'}, -50%)` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        style={{
          width: open ? 320 : 244, padding: '12px 15px', borderRadius: 12,
          transition: 'width 0.25s ease',
          background: 'linear-gradient(160deg, rgba(24,17,6,0.95), rgba(10,8,4,0.95))',
          border: `1px solid rgba(255,176,46,${open ? 0.55 : 0.24})`,
          boxShadow: open ? '0 16px 50px rgba(0,0,0,0.9)' : '0 12px 38px rgba(0,0,0,0.8)',
          fontFamily: "'Inter', sans-serif",
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.16em', color: GOLD, fontWeight: 600 }}>{label}</span>
          {when && <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.42)' }}>
            {when.toLocaleDateString([], { day: '2-digit', month: 'short' })}
          </span>}
        </div>
        {/* Collapsed shows two lines so the column stays scannable; opening
            one gives the whole thing without leaving the graph. */}
        <div style={{
          fontSize: 13, lineHeight: 1.42, color: 'rgba(255,255,255,0.94)',
          display: open ? 'block' : '-webkit-box',
          WebkitLineClamp: open ? 'none' : 2,
          WebkitBoxOrient: 'vertical',
          overflow: open ? 'visible' : 'hidden',
          wordBreak: 'break-word',
        }}>{memory.label}</div>
        {open && when && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(255,176,46,0.18)', fontSize: 10.5, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)' }}>
            {when.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
            {memory.source ? ` · ${String(memory.source).toUpperCase()}` : ''}
          </div>
        )}
      </div>
    </Html>
  );
}

export default function MemorySky({ hub, memories = [], surfaceY = 0, riseRef = null }) {
  const [openId, setOpenId] = useState(null);
  // How many cards exist in the DOM. Toggling three.js visibility does nothing
  // for Html, so the count is state and the cards are conditionally rendered.
  // Which nodes currently carry a card. Held as a set of indices rather than a
  // count, because the readable window follows the camera up the column instead
  // of always starting at the bottom.
  const [cardIds, setCardIds] = useState(() => new Set());
  const { camera } = useThree();
  const lineMat = useRef(null);
  const nodeGroup = useRef(null);
  const shownKey = useRef('');

  const { nodes, lineGeo } = useMemo(() => {
    if (!hub) return { nodes: [], lineGeo: new THREE.BufferGeometry() };

    // Oldest first: the column is a timeline, and a timeline that runs newest-
    // first reads backwards no matter how it is drawn.
    const ordered = [...memories].sort((a, b) => {
      const ta = a.occurred_at ? Date.parse(a.occurred_at) : 0;
      const tb = b.occurred_at ? Date.parse(b.occurred_at) : 0;
      return ta - tb;
    });
    const placed = layout(ordered, new THREE.Vector3(hub.x, surfaceY, hub.z));

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

    return { nodes: placed, lineGeo: g };
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

      // Cards are DOM, so only a handful exist at a time — the ones nearest
      // the camera, among those the reveal has already reached. Look further up
      // the column and the window follows; nothing is unreachable, and nothing
      // is mounted that you cannot read.
      let next = new Set();
      if (r > 0.25) {
        const revealed = [];
        for (let i = 0; i < nodes.length; i++) {
          if (reach - i < 0.4) break;
          revealed.push(i);
        }
        revealed
          .sort((a, b) => camera.position.distanceToSquared(nodes[a].position)
            - camera.position.distanceToSquared(nodes[b].position))
          .slice(0, CARDS_IN_VIEW)
          .forEach((i) => next.add(i));
      }
      // Compared as a key so an unchanged window costs no re-render.
      const key = [...next].sort((a, b) => a - b).join(',');
      if (key !== shownKey.current) {
        shownKey.current = key;
        setCardIds(next);
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
            {cardIds.has(i) && (
              <MemoryCard
                memory={memory}
                side={side}
                open={openId === (memory.id ?? i)}
                onToggle={() => setOpenId((cur) => (cur === (memory.id ?? i) ? null : (memory.id ?? i)))}
              />
            )}
          </group>
        ))}
      </group>

    </group>
  );
}
