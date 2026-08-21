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

const GOLD = '#ffb02e';      // the accent on a card, where it belongs
const NODE = '#c98829';      // the node itself: present, not a light source
const GOLD_DIM = '#6b4310';

// Well clear of the peaks: lower down, the first nodes sat in among the summits
// and the column competed with the landscape it came out of.
export const RISE = 22;

// Spacing is fixed, and a column is as long as its source is large. Squeezing a
// hundred and sixty memories into a set height put the nodes 0.28 apart while a
// card is many times that tall, so they stacked on each other and became
// unreadable at exactly the scale where reading them is the point. A long
// thread is not a problem to compress away — its length is the honest picture
// of how much is stored.
export const STEP = 1.12;

const TWIST = 0.22;  // a slow lean for depth, not a spiral
const RADIUS = 2.4;  // how far each node stands off the axis

// Cards are DOM and cost real layout, and a hundred at once is unreadable
// whatever the machine can manage. The nodes nearest the camera carry one; the
// rest stay as points on the thread until you travel to them.
const CARDS_IN_VIEW = 14;

/**
 * Oldest at the bottom, newest at the top.
 *
 * Cards alternate strictly left and right by index, which is what keeps
 * neighbours from colliding — the previous version took the side from the helix
 * angle, so runs of consecutive cards landed on the same side, and those were
 * exactly the ones close enough together to overlap.
 */
function layout(memories, origin) {
  const n = memories.length;
  return memories.map((m, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    // Sides alternate strictly by index, so no two neighbouring cards ever
    // occupy the same half of the screen. Under the old helix the side came
    // from the angle, which left runs of consecutive cards on one side —
    // exactly the ones close enough together to collide.
    const side = i % 2 === 0 ? 1 : -1;
    // A slow lean rather than a spiral: enough to give the thread depth and
    // keep it from reading as a flat list, not enough to wind out of frame.
    const angle = i * TWIST;
    const r = RADIUS * (0.85 + t * 0.3);
    return {
      memory: m,
      index: i,
      position: new THREE.Vector3(
        origin.x + side * r,
        origin.y + RISE + i * STEP,
        origin.z + Math.sin(angle) * r,
      ),
      side,
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
              {/* Smaller and tone-mapped. Unmapped basic material sits outside
                  the exposure curve, so every node came through at full channel
                  value and then fed the bloom — which is what made them read as
                  bright yellow lamps rather than points on a thread. */}
              <sphereGeometry args={[0.085, 14, 14]} />
              <meshBasicMaterial color={NODE} transparent opacity={0} />
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
