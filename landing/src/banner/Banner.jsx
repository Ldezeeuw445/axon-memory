/**
 * The banner: one continuous move from opening the app to a memory arriving
 * somewhere else. Scroll is the shutter — it never cuts, it travels.
 *
 * The terrain, the summits, the brand marks and the memory column are the
 * app's own renderer (vendored under ../terrain), not a mockup of it. What is
 * different here is the camera: the app's rig answers a pointer, this one
 * answers scroll position, so the same world can be walked on rails.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Sparkles, AdaptiveDpr, QuadraticBezierLine, Html, Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { buildTerrainEngine } from '../terrain/terrainEngine';
import TerrainSceneMesh from '../terrain/TerrainSceneMesh';
import TerrainMarkers from '../terrain/TerrainMarkers';
import { FACTS, RECALLED_BY, OPEN_CLUSTER, CLUSTER_FACTS, FACT_ITEMS } from './mockGraph';
import AxonCore from '../terrain/AxonCore';
import { buildConfig, ROUTE, CARD_STOPS, CORE_COUNT, SOURCES } from './mockGraph';

const byId = (id) => SOURCES.find((s) => s.id === id);

/* ── the timeline ──────────────────────────────────────────────────────────
   Every number below is a scroll position. Beats overlap by design: the next
   move starts before the last one settles, which is what keeps it one take. */
const BEATS = [
  { id: 'coldopen', from: 0.000, to: 0.035 },
  { id: 'void',     from: 0.035, to: 0.068 },
  { id: 'core',     from: 0.068, to: 0.108 },
  { id: 'facets',   from: 0.108, to: 0.140 },
  { id: 'choose',   from: 0.140, to: 0.165 },
  { id: 'enter',    from: 0.165, to: 0.250 },
  { id: 'orbit',    from: 0.250, to: 0.395 },
  { id: 'summit',   from: 0.395, to: 0.460 },
  { id: 'climb',    from: 0.460, to: 0.520 },
  { id: 'open',     from: 0.520, to: 0.578 },
  { id: 'unfold',   from: 0.578, to: 0.628 },
  { id: 'cross1',   from: 0.628, to: 0.690 },
  { id: 'cross2',   from: 0.690, to: 0.745 },
  { id: 'descend',  from: 0.745, to: 0.805 },
  { id: 'exit',     from: 0.805, to: 0.855 },
  { id: 'sources',  from: 0.855, to: 0.945 },
  { id: 'vision',   from: 0.945, to: 0.985 },
  { id: 'mark',     from: 0.985, to: 1.000 },
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (p, a, b) => clamp01((p - a) / (b - a));
/* Nothing moves at a constant rate — canon §5. */
const ease = (t) => t * t * (3 - 2 * t);
const beatAt = (p) => BEATS.find((b) => p < b.to) ?? BEATS[BEATS.length - 1];

/* Which source is open. Before the climb nothing is: the landscape on its own
   is the first thing to understand, and six conclusions hanging over every
   summit while the camera is still circling is the answer arriving before
   anyone has asked. */
/* How far into the source you are.
   0 — the six categories it concludes in.
   1 — one of them come apart into the conclusions it is made of.
   2 — one of those come apart into the items it was drawn from.
   Then back up, because the crossing is a claim about conclusions, and you
   cannot see it while looking at raw material. */
function drillAt(p) {
  if (p < 0.520) return 0;
  if (p < 0.578) return ease(span(p, 0.520, 0.578));
  if (p < 0.612) return 1 + ease(span(p, 0.578, 0.612));
  if (p < 0.628) return 2;
  return 2 * (1 - ease(span(p, 0.628, 0.668)));
}

function focusAt(p) {
  if (p < 0.460 || p >= 0.790) return null;
  if (p < 0.660) return ROUTE[0];
  if (p < 0.715) return ROUTE[1];
  return ROUTE[2];
}
/* The far end of a crossing shows only the conclusion being reached — enough
   to see it arrive somewhere real, without a second full fan in the sky. */
function reachingAt(p) {
  if (p >= 0.628 && p < 0.660) return ROUTE[1];
  if (p >= 0.690 && p < 0.715) return ROUTE[2];
  return null;
}

/* How far the camera has left the ground. One value: the column reveals off
   it, the terrain falls away off it, and the links between columns fade in on
   it — so the climb stays one move instead of four animations kept in step. */
function riseAt(p) {
  if (p < 0.460) return 0;
  if (p < 0.520) return ease(span(p, 0.460, 0.520));
  if (p < 0.745) return 1;
  return 1 - ease(span(p, 0.745, 0.805));
}

/* Where a source's conclusions stand.
   The first version put them on an ascending turn through the scene, which
   looked like something but could not be read: every label sat at a different
   depth, so they came out at different sizes and crossed each other.

   They stand on a fan instead, in the plane facing where the camera arrives.
   Every conclusion is then the same distance away, the same size, and none of
   them overlap — the whole source is one glance rather than a thing to hunt
   through. The biggest sits nearest the top and they work outward from there,
   so the shape itself says which one the source rests on. */
const FACT_BASE = 11;
const FACT_R = 7.4;
const CENTRE_OUT = [2, 3, 1, 4, 0, 5];

function factFan(hub, surfaceY, k, n) {
  const slot = (CENTRE_OUT[k] ?? k) / Math.max(1, n - 1);
  const a = -1.16 + slot * 2.32;
  const d = new THREE.Vector3(hub.x, 0, hub.z);
  if (d.lengthSq() < 0.01) d.set(0, 0, 1);
  d.normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(d).normalize();
  return new THREE.Vector3(hub.x, surfaceY + FACT_BASE, hub.z)
    .add(right.multiplyScalar(Math.sin(a) * FACT_R))
    .add(new THREE.Vector3(0, Math.cos(a) * FACT_R * 0.66, 0));
}

/* A conclusion, as the same object the app opens on.
   The point-cloud sphere is lifted from src/components/MemoryParticle.jsx —
   the Fibonacci shell plus a random inner volume — so a cluster is a small
   Core rather than a ball that happens to be here. It is not decoration that
   it is made of points: the count is how many items the conclusion was drawn
   from, so the thing you are looking at is literally the material it came out
   of, held together.

   Solid spheres read as markers dropped onto the scene. These read as
   something the landscape produced. */
function FactOrb({ n, items, hue, matRef }) {
  const g = useRef(null);
  const geo = useMemo(() => {
    // Was up to 900 per orb, and sixteen of them are built in the same frame
    // the moment a source opens — a quarter-second hitch on exactly the beat
    // that has to feel calm. Half the points, no visible difference at this
    // distance.
    const count = Math.min(420, 110 + items * 2.5);
    const R = 0.40 + n * 0.019;
    const pos = new Float32Array(count * 3 * 2);
    for (let i = 0; i < count; i++) {
      // Outer shell — evenly spread, so the silhouette is a clean edge.
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      pos[i * 6] = R * Math.cos(theta) * Math.sin(phi);
      pos[i * 6 + 1] = R * Math.sin(theta) * Math.sin(phi);
      pos[i * 6 + 2] = R * Math.cos(phi);
      // Inner volume — cube-rooted so density is even rather than crowding
      // the centre, which is what gives it weight instead of a hot core.
      const ri = R * 0.8 * Math.cbrt(Math.random());
      const ti = Math.random() * Math.PI * 2;
      const pi = Math.acos(2 * Math.random() - 1);
      pos[i * 6 + 3] = ri * Math.sin(pi) * Math.cos(ti);
      pos[i * 6 + 4] = ri * Math.sin(pi) * Math.sin(ti);
      pos[i * 6 + 5] = ri * Math.cos(pi);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return bg;
  }, [n, items]);

  // Slow enough to read as alive rather than as motion — canon's breathing,
  // never a fast pulse.
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.055; });

  return (
    <points ref={g} geometry={geo}>
      <pointsMaterial
        ref={matRef}
        size={0.028}
        sizeAttenuation
        color={hue}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

/* Six conclusions over a summit, and what they are made of.
   Three layers on one fan. Nothing slides in from off-screen and nothing cuts:
   a child starts inside the thing it came out of and travels to its own place,
   while the parent thins out. Fusion is the resting state here, so opening is
   just that run backwards. */
function FactCloud({ hub, surfaceY, facts, hue, riseRef, drillRef, mode, canDrill }) {
  const group = useRef(null);
  const cats = useRef([]);   const catLabels = useRef([]);
  const kids = useRef([]);   const kidGroups = useRef([]);  const kidLabels = useRef([]);
  const bits = useRef([]);   const bitGroups = useRef([]);  const bitLabels = useRef([]);
  const leadCard = useRef(null);

  const placed = useMemo(
    () => facts.map((f, i) => ({ ...f, i, pos: factFan(hub, surfaceY, i, facts.length) })),
    [hub, surfaceY, facts],
  );
  const shown = mode === 'lead' ? placed.slice(0, 1) : placed;

  // Where the opened cluster sits, and where its children are going.
  const parent = placed[0]?.pos ?? new THREE.Vector3();
  const kidSlots = useMemo(
    () => CLUSTER_FACTS.map((_, i) => factFan(hub, surfaceY, i, CLUSTER_FACTS.length)),
    [hub, surfaceY],
  );
  const bitSlots = useMemo(
    () => FACT_ITEMS.map((_, i) => factFan(hub, surfaceY, i, FACT_ITEMS.length)),
    [hub, surfaceY],
  );

  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const r = riseRef.current;
    const d = canDrill ? (drillRef?.current ?? 0) : 0;
    if (group.current) group.current.visible = r > 0.02;

    const a1 = THREE.MathUtils.clamp(d, 0, 1);
    const a2 = THREE.MathUtils.clamp(d - 1, 0, 1);

    // Level 0 — the categories. They thin out as the one you opened becomes
    // the things it is made of.
    cats.current.forEach((m, i) => {
      if (!m) return;
      const arrive = THREE.MathUtils.clamp((r - 0.28 - i * 0.055) / 0.22, 0, 1);
      const o = arrive * (1 - a1);
      m.opacity = o; m.visible = o > 0.01;
    });
    catLabels.current.forEach((el, i) => {
      if (!el) return;
      const arrive = THREE.MathUtils.clamp((r - 0.28 - i * 0.055) / 0.22, 0, 1);
      el.style.opacity = String(arrive * (1 - a1));
    });
    if (leadCard.current) leadCard.current.style.opacity = String((1 - a1) * THREE.MathUtils.clamp((r - 0.4) / 0.25, 0, 1));

    // Level 1 — the conclusions inside it, travelling out from where it stood.
    const o1 = a1 * (1 - a2);
    kids.current.forEach((m) => { if (m) { m.opacity = o1; m.visible = o1 > 0.01; } });
    kidLabels.current.forEach((el) => { if (el) el.style.opacity = String(o1); });
    kidGroups.current.forEach((g, i) => {
      if (!g || !kidSlots[i]) return;
      g.position.copy(tmp.copy(parent).lerp(kidSlots[i], a1));
    });

    // Level 2 — the items the leading conclusion was drawn from.
    bits.current.forEach((m) => { if (m) { m.opacity = a2; m.visible = a2 > 0.01; } });
    bitLabels.current.forEach((el) => { if (el) el.style.opacity = String(a2); });
    bitGroups.current.forEach((g, i) => {
      if (!g || !bitSlots[i]) return;
      g.position.copy(tmp.copy(kidSlots[0] ?? parent).lerp(bitSlots[i], a2));
    });
  });

  return (
    <group ref={group}>
      {shown.map((f) => (
        <group key={f.cat} position={f.pos.toArray()}>
          <FactOrb n={f.n} items={f.items} hue={hue} matRef={(m) => { cats.current[f.i] = m; }} />
          <Html center distanceFactor={22} zIndexRange={[30, 5]}>
            <div ref={(el) => { catLabels.current[f.i] = el; }} style={{
              transform: 'translateY(20px)', textAlign: 'center', whiteSpace: 'nowrap',
              fontFamily: "'Inter', sans-serif", pointerEvents: 'none',
              textShadow: '0 1px 10px rgba(0,0,0,.95)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', color: '#fff' }}>{f.cat}</div>
              <div style={{ fontSize: 10.5, color: hue, marginTop: 3 }}>{f.n} facts &middot; {f.items} items</div>
            </div>
          </Html>
        </group>
      ))}

      {canDrill && CLUSTER_FACTS.map((k, i) => (
        <group key={`k${i}`} ref={(g) => { kidGroups.current[i] = g; }}>
          <FactOrb n={k.items} items={k.items * 6} hue={hue} matRef={(m) => { kids.current[i] = m; }} />
          <Html center distanceFactor={19} zIndexRange={[32, 6]}>
            <div ref={(el) => { kidLabels.current[i] = el; }} style={{
              transform: 'translateY(18px)', width: 190, textAlign: 'center',
              fontFamily: "'Inter', sans-serif", pointerEvents: 'none', opacity: 0,
              textShadow: '0 1px 10px rgba(0,0,0,.95)',
            }}>
              <div style={{ fontSize: 10.5, lineHeight: 1.4, color: '#fff' }}>{k.say}</div>
              <div style={{ fontSize: 9, color: hue, marginTop: 3 }}>from {k.items} items</div>
            </div>
          </Html>
        </group>
      ))}

      {canDrill && FACT_ITEMS.map((it, i) => (
        <group key={`b${i}`} ref={(g) => { bitGroups.current[i] = g; }}>
          <FactOrb n={1} items={22} hue={byId(it.src)?.hue ?? hue} matRef={(m) => { bits.current[i] = m; }} />
          <Html center distanceFactor={17} zIndexRange={[34, 7]}>
            <div ref={(el) => { bitLabels.current[i] = el; }} style={{
              transform: 'translateY(14px)', width: 170, textAlign: 'center',
              fontFamily: "'Inter', sans-serif", pointerEvents: 'none', opacity: 0,
              textShadow: '0 1px 10px rgba(0,0,0,.95)',
            }}>
              <div style={{ fontSize: 9.5, lineHeight: 1.35, color: '#c9ced8' }}>{it.label}</div>
              <div style={{ fontSize: 8.5, color: byId(it.src)?.hue ?? hue, marginTop: 2 }}>
                {byId(it.src)?.name ?? ''}
              </div>
            </div>
          </Html>
        </group>
      ))}

      {placed[0]?.say && (
        <Html position={placed[0].pos.toArray()} center distanceFactor={20} zIndexRange={[40, 10]}>
          <div ref={leadCard} style={{
            transform: 'translate(0, -104px)', width: 250, padding: '12px 14px', borderRadius: 12,
            background: 'linear-gradient(160deg,rgba(16,14,12,.96),rgba(8,8,10,.96))',
            border: `1px solid ${hue}44`, boxShadow: '0 16px 46px rgba(0,0,0,.85)',
            fontFamily: "'Inter', sans-serif", pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: '#fff' }}>{placed[0].say}</div>
            <div style={{
              marginTop: 10, paddingTop: 9, borderTop: `1px solid ${hue}26`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {(RECALLED_BY[hub.id] ?? []).length ? (
                <>
                  {(RECALLED_BY[hub.id] ?? []).map((id) => (
                    <span key={id} style={{
                      width: 12, height: 12, borderRadius: 4,
                      background: byId(id)?.hue ?? '#888',
                    }} />
                  ))}
                  <span style={{ fontSize: 9.5, color: '#9aa2b2' }}>Recalled elsewhere</span>
                </>
              ) : (
                <span style={{ fontSize: 9.5, color: '#5c6373' }}>
                  Nothing here has been recalled by another app yet.
                </span>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/* The room the whole banner sits in.
   Values are the app's own GalaxyBackground (src/pages/Landing.jsx) — same
   black, same star field, same two layers of nebula dust — so the space around
   the phone is the space inside it. It lives on its own canvas because the
   terrain canvas is clipped to the screen of the device: clip both and the
   galaxy would stop at the phone's edge, which is exactly the seam this is
   meant to remove. */
function GalaxyBackdrop() {
  const g = useRef(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.006; });
  return (
    <>
      <color attach="background" args={['#020203']} />
      <group ref={g}>
        <Stars radius={100} depth={50} count={1600} factor={3} saturation={0} fade speed={0.3} />
        <Sparkles count={150} scale={30} size={15} speed={0.1} opacity={0.03} color="#7f93b5" />
        <Sparkles count={80} scale={40} size={25} speed={0.05} opacity={0.02} color="#93a5c0" />
      </group>
    </>
  );
}

/* Above the landscape the terrain markers have faded out, and with them every
   brand mark on the map — so at exactly the altitude where the question is
   "whose memory is this", nothing answered it. */
function ColumnHead({ hub, surfaceY, total, source, riseRef }) {
  const ref = useRef(null);
  const y = surfaceY + FACT_BASE + FACT_R * 0.66 + 6.5;
  useFrame(() => {
    if (!ref.current) return;
    const o = THREE.MathUtils.clamp((riseRef.current - 0.3) / 0.35, 0, 1);
    ref.current.style.opacity = String(o);
  });
  const Icon = source?.icon;
  return (
    <Html position={[hub.x, y, hub.z]} center distanceFactor={16} zIndexRange={[40, 10]}>
      <div ref={ref} style={{
        opacity: 0, display: 'grid', justifyItems: 'center', gap: 6,
        fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', pointerEvents: 'none',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(160deg,rgba(20,22,30,0.96),rgba(8,9,14,0.96))',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 10px 34px rgba(0,0,0,0.7)',
        }}>{Icon && <Icon size={24} />}</div>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.14em', color: '#fff' }}>{hub.name}</div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', color: '#ffb733' }}>
          {total.toLocaleString('en-US')} memories
        </div>
      </div>
    </Html>
  );
}

/* The conclusion two apps share.
   Not a wire between logos — a line between two specific conclusions, because
   that is what the claim actually is: the same thing was concluded in both
   places, not that two files mention the same string. */
function SkyLinks({ engine, riseRef }) {
  const links = useMemo(() => {
    const out = [];
    for (let k = 0; k < ROUTE.length - 1; k++) {
      const a = engine.hubs.find((h) => h.id === ROUTE[k]);
      const b = engine.hubs.find((h) => h.id === ROUTE[k + 1]);
      if (!a || !b) continue;
      if (!(FACTS[ROUTE[k]] ?? []).length || !(FACTS[ROUTE[k + 1]] ?? []).length) continue;
      const from = factFan(a, engine.heightAt(a.x, a.z), 0, (FACTS[ROUTE[k]] ?? []).length);
      const to = factFan(b, engine.heightAt(b.x, b.z), 0, (FACTS[ROUTE[k + 1]] ?? []).length);
      const mid = from.clone().lerp(to, 0.5);
      mid.y += from.distanceTo(to) * 0.22;
      out.push({ key: `${ROUTE[k]}-${ROUTE[k + 1]}`, from, to, mid });
    }
    return out;
  }, [engine]);

  const lines = useRef([]);
  useFrame(({ clock }) => {
    const r = riseRef.current;
    for (let i = 0; i < lines.current.length; i++) {
      const m = lines.current[i]?.material;
      if (!m) continue;
      const local = THREE.MathUtils.clamp((r - 0.5 - i * 0.14) / 0.3, 0, 1);
      m.opacity = local * (0.55 + 0.3 * Math.sin(clock.elapsedTime * 1.1 + i));
      m.visible = local > 0.01;
    }
  });

  return links.map((l, i) => (
    <QuadraticBezierLine
      key={l.key}
      ref={(el) => { lines.current[i] = el; }}
      start={l.from.toArray()}
      end={l.to.toArray()}
      mid={l.mid.toArray()}
      color="#ffb733"
      lineWidth={1.7}
      transparent
      opacity={0}
      toneMapped={false}
    />
  ));
}

/* Where the orbit leaves the camera: angle pi/2 after a full turn, radius 30,
   height 22. The next move starts here so the join is invisible. */
const ORBIT_END = [Math.cos(Math.PI / 2) * 30, 22, Math.sin(Math.PI / 2) * 30 - 2];

/* ── camera ───────────────────────────────────────────────────────────────*/
function CameraRig({ pRef, engine, riseRef }) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(0, 74, 26));
  const tgt = useRef(new THREE.Vector3(0, 0, -2));
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpT = useMemo(() => new THREE.Vector3(), []);

  const H = useMemo(() => {
    const find = (id) => engine.hubs.find((h) => h.id === id);
    const out = {};
    ROUTE.forEach((id) => {
      const h = find(id);
      const y = engine.heightAt(h.x, h.z);
      // The group the camera has to frame is the six clusters, not a column
      // whose height was the number of raw items.
      out[id] = {
        h, surfaceY: y,
        topY: y + FACT_BASE + FACT_R * 0.66,
        midY: y + FACT_BASE + FACT_R * 0.3,
      };
    });
    return out;
  }, [engine]);

  // Standing-off point for a column: outside it, level with its middle.
  const standOff = (k, out) => {
    const { h, midY } = H[k];
    const d = new THREE.Vector3(h.x, 0, h.z);
    if (d.lengthSq() < 0.01) d.set(0, 0, 1);
    d.normalize();
    return out.set(h.x + d.x * 17.5, midY, h.z + d.z * 17.5);
  };

  useFrame((_, dt) => {
    const p = pRef.current;
    riseRef.current = riseAt(p);

    if (p < 0.250) {
      // The Core is the real object here — src/components/AxonCore.jsx, roughly
      // two units across — so the camera sits a few units off it and closes in
      // while the app's opening plays. When View Constellation is pressed it
      // pulls back to the whole map, and the screen then opens out around it.
      const approach = ease(span(p, 0.000, 0.140));
      const reveal = ease(span(p, 0.140, 0.170));
      const drop = ease(span(p, 0.170, 0.250));
      const nearZ = THREE.MathUtils.lerp(25, 16.5, approach);
      tmpP.set(
        0,
        THREE.MathUtils.lerp(0.35, 74, reveal) - 40 * drop,
        THREE.MathUtils.lerp(nearZ, 26, reveal) + 6 * drop,
      );
      tmpT.set(0, THREE.MathUtils.lerp(0, 0, reveal) + 0.5 * drop, THREE.MathUtils.lerp(0, -2, reveal));
    } else if (p < 0.395) {
      // Starts at +z, where the descent left the camera. It used to start at
      // -z, which put a sixty-eight unit jump on the first frame of the orbit
      // — damped into a lurch rather than removed by it.
      const t = ease(span(p, 0.250, 0.395));
      const a = Math.PI / 2 + t * Math.PI * 2;
      const r = 34 - 4 * t;
      tmpP.set(Math.cos(a) * r, 30 - 8 * t, Math.sin(a) * r - 2);
      tmpT.set(0, 1.2, -2);
    } else if (p < 0.460) {
      // Onto the first summit.
      // From where the orbit actually ends, not from a number that happened to
      // be written here: the two were thirty units apart and the camera jumped
      // the gap every time.
      const t = ease(span(p, 0.395, 0.460));
      const { h, surfaceY } = H[ROUTE[0]];
      const d = new THREE.Vector3(h.x, 0, h.z).normalize();
      const near = 6 + h.radius * 1.6;
      tmpP.set(
        THREE.MathUtils.lerp(ORBIT_END[0], h.x + d.x * near, t),
        THREE.MathUtils.lerp(ORBIT_END[1], surfaceY + 4, t),
        THREE.MathUtils.lerp(ORBIT_END[2], h.z + d.z * near, t),
      );
      tmpT.set(
        THREE.MathUtils.lerp(0, h.x, t),
        THREE.MathUtils.lerp(1.2, surfaceY + 1, t),
        THREE.MathUtils.lerp(-2, h.z, t),
      );
    } else if (p < 0.628) {
      // Straight up the column. The landscape leaves on its own, off rise.
      const t = ease(span(p, 0.460, 0.520));
      const { h, surfaceY, midY, topY } = H[ROUTE[0]];
      const d = new THREE.Vector3(h.x, 0, h.z).normalize();
      const near = 6 + h.radius * 1.6;
      tmpP.set(
        THREE.MathUtils.lerp(h.x + d.x * near, h.x + d.x * 17.5, t),
        THREE.MathUtils.lerp(surfaceY + 4, midY, t),
        THREE.MathUtils.lerp(h.z + d.z * near, h.z + d.z * 17.5, t),
      );
      tmpT.set(h.x, THREE.MathUtils.lerp(surfaceY + 1, (midY + topY) / 2, t), h.z);
    } else if (p < 0.745) {
      // Across the sky, column to column, following the shared memory.
      const leg = p < 0.690 ? 0 : 1;
      const t = ease(leg === 0 ? span(p, 0.628, 0.690) : span(p, 0.690, 0.745));
      const A = H[ROUTE[leg]];
      const B = H[ROUTE[leg + 1]];
      const pa = standOff(ROUTE[leg], new THREE.Vector3());
      const pb = standOff(ROUTE[leg + 1], new THREE.Vector3());
      const lift = Math.sin(t * Math.PI) * 7;
      tmpP.set(
        THREE.MathUtils.lerp(pa.x, pb.x, t),
        THREE.MathUtils.lerp(pa.y, pb.y, t) + lift,
        THREE.MathUtils.lerp(pa.z, pb.z, t),
      );
      tmpT.set(
        THREE.MathUtils.lerp(A.h.x, B.h.x, t),
        THREE.MathUtils.lerp(A.midY, B.midY, t),
        THREE.MathUtils.lerp(A.h.z, B.h.z, t),
      );
    } else {
      // Back down, and the terrain comes up to meet the camera again.
      const t = ease(span(p, 0.745, 0.840));
      const C = H[ROUTE[2]];
      const pc = standOff(ROUTE[2], new THREE.Vector3());
      tmpP.set(
        THREE.MathUtils.lerp(pc.x, 0, t),
        THREE.MathUtils.lerp(pc.y, 62, t),
        THREE.MathUtils.lerp(pc.z, 26, t),
      );
      tmpT.set(
        THREE.MathUtils.lerp(C.h.x, 0, t),
        THREE.MathUtils.lerp(C.midY, 0.5, t),
        THREE.MathUtils.lerp(C.h.z, -2, t),
      );
    }

    const k = 1 - Math.pow(0.0016, dt);
    pos.current.lerp(tmpP, k);
    tgt.current.lerp(tmpT, k);
    camera.position.copy(pos.current);
    camera.lookAt(tgt.current);
  });

  return null;
}

/* ── scene ────────────────────────────────────────────────────────────────*/
function Scene({ pRef, showMarkers, showCore, focusId, reachId, drillRef, veilRef }) {
  const engine = useMemo(() => buildTerrainEngine(buildConfig()), []);
  const riseRef = useRef(0);

  // All three columns stand at once from the moment the climb starts: the
  // crossing only means something if the far end is already there to be
  // crossed to.
  const routeHubs = useMemo(
    () => ROUTE.map((id) => engine.hubs.find((h) => h.id === id)).filter(Boolean),
    [engine],
  );
  const focusHub = useMemo(
    () => engine.hubs.find((h) => h.id === focusId) ?? null,
    [engine, focusId],
  );

  return (
    <>
      {/* No background of its own: this canvas is transparent and the galaxy
          behind it is the same one that surrounds the device, so entering the
          screen never swaps one sky for another. Fog resolves to the backdrop's
          black so distant terrain sinks into it rather than ending on a line. */}
      <fog attach="fog" args={['#020203', 70, 210]} />
      <ambientLight intensity={0.3} />

      {/* Rebuilt from the app's own local Environment: it used to be
          preset="city", which fetched an HDR that now 404s, and a transmission
          material with nothing around it reads as dull grey plastic however
          its own parameters are tuned.

          Mounted only while the Core is on screen. It is an environment map,
          so it lights everything — left up, it washed the terrain's rock from
          dark slate to near-white and the landscape stopped looking like the
          product. The Core needs it; the terrain has its own lights and does
          not. */}
      {showCore && (
        <>
          <ambientLight intensity={0.1} />
          <Environment resolution={256}>
            <Lightformer form="rect" intensity={9} position={[0, 8, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 10, 1]} color="#dfe9ff" />
            <Lightformer form="rect" intensity={5.2} position={[-8, 2, -6]} scale={[12, 9, 1]} color="#9fb6e0" />
            <Lightformer form="rect" intensity={2.8} position={[8, -1, 5]} scale={[9, 7, 1]} color="#6d7f9e" />
            <Lightformer form="rect" intensity={16} position={[-3.2, 4, 4]} scale={[0.35, 7, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={11} position={[3.6, -2, 3.5]} scale={[0.3, 6, 1]} color="#cfe2ff" />
            <Lightformer form="circle" intensity={2.2} position={[0, -6, 1]} scale={[7, 7, 1]} color="#2a3a5c" />
          </Environment>
        </>
      )}

      {showCore && <AxonCore stage={2} />}
      {showMarkers && <TerrainSceneMesh engine={engine} resolution={170} shadowsEnabled={false} diveRef={veilRef} />}
      {/* Held back until View Constellation is pressed. Two reasons, and both
          matter: the constellation is what that button is for, so showing it
          beforehand gives the press nothing to do — and these labels are DOM,
          which escapes the clip-path holding the render inside the phone, so
          before the screen opens they would hang in the air beside the device. */}
      {showMarkers && <TerrainMarkers
        engine={engine}
        selected={focusHub}
        leaves={[]}
        hoveredId={null}
        onHover={() => {}}
        onSelectHub={() => {}}
        onSelectLeaf={() => {}}
        showLeafLabels={false}
        riseRef={veilRef}
      />}
      {showMarkers && routeHubs.filter((h) => h.id === focusId).map((h) => (
        <ColumnHead
          key={`head-${h.id}`}
          hub={h}
          surfaceY={engine.heightAt(h.x, h.z)}
          total={byId(h.id)?.count ?? 0}
          source={byId(h.id)}
          riseRef={riseRef}
        />
      ))}
      {showMarkers && routeHubs.map((h) => {
        const mode = h.id === focusId ? 'full' : h.id === reachId ? 'lead' : null;
        if (!mode) return null;
        return (
          <FactCloud
            key={h.id}
            hub={h}
            surfaceY={engine.heightAt(h.x, h.z)}
            facts={FACTS[h.id] ?? []}
            hue={byId(h.id)?.hue ?? '#ffb733'}
            riseRef={riseRef}
            drillRef={drillRef}
            canDrill={h.id === OPEN_CLUSTER.hub}
            mode={mode}
          />
        );
      })}
      <SkyLinks engine={engine} riseRef={riseRef} />

      <CameraRig pRef={pRef} engine={engine} riseRef={riseRef} />
      <AdaptiveDpr pixelated />
      {/* multisampling={0}: with the default the composer renders to a
          multisampled target this context never resolves, and the whole scene
          comes back black — terrain, stars and beacons all gone, leaving only
          drei's DOM labels floating on nothing. */}
      <EffectComposer multisampling={0} disableNormalPass>
        <Bloom intensity={0.62} luminanceThreshold={0.26} luminanceSmoothing={0.5} mipmapBlur />
      </EffectComposer>
    </>
  );
}

/* ── the page-side furniture over the canvas ──────────────────────────────*/
/* How big the picture is. At either end the camera is inside a phone on a
   desk, so the render is clipped to that screen; through the middle the phone
   is gone and the terrain is the whole banner. Clipping rather than resizing
   the canvas keeps the field of view constant, so going in and coming out is
   one continuous move instead of a lens change. */
function stageRect(p) {
  const open = Math.max(ease(span(p, 0.165, 0.250)), 0) * (1 - ease(span(p, 0.805, 0.855)));
  // A 622px device on a 720px window leaves 49px above and below, which is
  // less than one orbiting card — so the ring ends up behind the phone rather
  // than around it. The device gives way to the window, not the other way
  // round, and everything drawn on its screen is scaled from this one number.
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  const fit = Math.min(1, Math.max(0.62, (vh - 250) / 622));
  const w = THREE.MathUtils.lerp(300 * fit, 4200, open);
  const h = THREE.MathUtils.lerp(622 * fit, 4200, open);
  const r = THREE.MathUtils.lerp(44 * fit, 0, open);
  return { w, h, r, open };
}

function PhoneFrame({ p }) {
  const { w, h, r, open } = stageRect(p);
  const vis = 1 - open;
  if (vis < 0.02) return null;
  const island = { w: w * 0.30, h: Math.max(17, h * 0.041) };
  const lens = Math.max(5, w * 0.026);
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'relative', width: w, height: h, borderRadius: r, opacity: vis,
        /* The band, as three sub-pixel lines rather than one stroke: a hairline
           catching light on the outside, a soft halo where the metal rolls
           away, and a hard dark line where the glass sits down into it. A
           single 1px border reads as a drawing of a phone; this reads as an
           edge. */
        boxShadow: [
          '0 0 0 1px rgba(255,255,255,0.17)',
          '0 0 0 4.5px rgba(255,255,255,0.032)',
          'inset 0 0 0 1px rgba(0,0,0,0.88)',
          'inset 0 1px 0 rgba(255,255,255,0.09)',
          '0 60px 140px rgba(0,0,0,0.78)',
        ].join(','),
      }}>
        {/* The camera. Hardware, not interface — there is no clock and no
            battery here, because a painted status bar sits doubled under the
            real one the moment this is seen on a phone. */}
        <div style={{
          position: 'absolute', top: h * 0.021, left: '50%', transform: 'translateX(-50%)',
          width: island.w, height: island.h, borderRadius: 999, background: '#04050a',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.055)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          paddingRight: island.w * 0.17,
        }}>
          <span style={{
            width: lens, height: lens, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #1d2739, #04060b 72%)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.07)',
          }} />
        </div>
      </div>
    </div>
  );
}

/* The app's own opening, played inside the screen.
   Copy and controls are the real ones from src/pages/Landing.jsx — "Neural
   Link", "+ Connect Source", "View Constellation", and the four-item dock —
   so the first thing a visitor sees is the product, not an impression of it.
   The presses happen on their own: this is a film of someone using it, and a
   button that waits for a click nobody is going to give stalls the story. */

/* The four lucide glyphs the app's dock renders — LayoutDashboard, Network,
   Link, CreditCard — transcribed rather than approximated, because lucide-react
   is a dependency of the app and not of this landing build. Same geometry, no
   extra package. */
const DOCK = [
  { id: 'dashboard', d: 'M3 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM14 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1zM14 13a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1zM3 17a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' },
  { id: 'graph', d: 'M9 3h6v5H9zM2 16h6v5H2zM16 16h6v5h-6zM5 16v-3h14v3M12 13V8' },
  { id: 'link', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  { id: 'billing', d: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20' },
];

/* The dock stays from the moment it first appears. It is the app's own
   furniture, and furniture that comes and goes with every beat reads as a
   slideshow of screens rather than one device being used. */
function Dock({ active }) {
  return (
    <div style={{
      position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 13px',
      background: 'rgba(10,12,16,0.7)', backdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22,
    }}>
      {DOCK.map((d) => {
        const on = d.id === active;
        return (
          <div key={d.id} style={{
            padding: 6, borderRadius: 13,
            background: on ? 'rgba(0,243,255,0.13)' : 'transparent',
            boxShadow: on ? 'inset 0 0 0 1px rgba(0,243,255,0.32)' : 'none',
            transition: 'all 0.3s ease',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={on ? '#5de6f5' : 'rgba(255,255,255,0.5)'} strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round">
              <path d={d.d} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/* The connect screen, as the app draws it on a phone: one card per source,
   staggered so the column reads as depth rather than a table, and the ones
   already connected carrying the app's own cyan rather than the gold that
   belongs to memory. */
const CONNECTABLE = [
  { id: 'notion', name: 'Notion', on: true },
  { id: 'github', name: 'GitHub', on: true },
  { id: 'linear', name: 'Linear', on: false },
  { id: 'slack', name: 'Slack', on: true },
  { id: 'gmail', name: 'Gmail', on: false },
  { id: 'obsidian', name: 'Obsidian', on: false },
];

function ConnectList({ reveal }) {
  return (
    <div style={{ position: 'absolute', left: 16, right: 16, top: 64, display: 'grid', gap: 9 }}>
      {CONNECTABLE.map((c, i) => {
        const src = byId(c.id);
        const Icon = src?.icon;
        const shown = clamp01((reveal - i * 0.08) / 0.18);
        return (
          <div key={c.id} style={{
            transform: `translate(${(i % 2 ? 16 : -8)}px, ${(1 - shown) * 14}px)`,
            opacity: shown,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 13,
            background: c.on
              ? 'linear-gradient(160deg,rgba(0,243,255,0.055),rgba(10,12,16,0.9))'
              : 'linear-gradient(160deg,rgba(255,255,255,0.035),rgba(10,12,16,0.9))',
            border: `1px solid ${c.on ? 'rgba(0,243,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: 'rgba(255,255,255,0.05)',
            }}>{Icon && <Icon size={15} />}</span>
            <span style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{c.name}</span>
              <span style={{ fontSize: 9, color: c.on ? '#5de6f5' : '#7d8698' }}>
                {c.on ? '✓ Connected' : '+ Connect'}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{
      padding: 12, borderRadius: 13,
      background: 'linear-gradient(160deg,rgba(9,10,15,0.93),rgba(5,6,10,0.90))',
      border: '1px solid rgba(255,255,255,0.11)',
      backdropFilter: 'blur(16px)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      ...style,
    }}>{children}</div>
  );
}

function GlassButton({ label, pressed, dim }) {
  return (
    <div style={{
      width: '100%', minHeight: 30, padding: '7px 12px', borderRadius: 999,
      textAlign: 'center', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.04em',
      color: pressed ? '#fff' : 'rgba(255,255,255,0.86)',
      background: pressed
        ? 'linear-gradient(180deg,rgba(255,183,51,0.22),rgba(255,183,51,0.07))'
        : 'linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))',
      border: `1px solid ${pressed ? 'rgba(255,176,46,0.55)' : 'rgba(255,255,255,0.13)'}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 6px 20px rgba(0,0,0,0.45)',
      backdropFilter: 'blur(14px)',
      opacity: dim ? 0.45 : 1,
      transform: pressed ? 'scale(0.97)' : 'scale(1)',
      transition: 'all 0.28s cubic-bezier(0.4,0,0.2,1)',
    }}>{label}</div>
  );
}

function PhoneScreen({ p }) {
  const { w, h, open } = stageRect(p);
  // Two windows on the same screen: the app's opening on the way in, and the
  // connect screen on the way back out. In between the camera is inside it and
  // there is no screen to draw on.
  const intro = 1 - ease(span(p, 0.165, 0.215));
  const outro = ease(span(p, 0.826, 0.856));
  const vis = Math.max(intro, outro);
  const isOutro = p >= 0.820;
  if (open > 0.6 || vis < 0.02) return null;

  const scale = w / 300;
  // The app's own four stages, in the app's order and in its own words.
  const stage =
    p < 0.035 ? 0 :
    p < 0.068 ? 1 :
    p < 0.108 ? 2 : 3;
  const line = 'As I mentioned yesterday';
  const typed = line.slice(0, Math.round(clamp01(span(p, 0.004, 0.030)) * line.length));
  const experiencePressed = p >= 0.098;
  const constellationPressed = p >= 0.146;
  // Pressed while the device is still re-forming, so the screen you land on is
  // already the one that press asked for.
  const connectPressed = p >= 0.840;
  const listReveal = clamp01(span(p, 0.856, 0.905));

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      pointerEvents: 'none', opacity: vis,
    }}>
      <div style={{
        position: 'relative', width: w, height: h, overflow: 'hidden',
        borderRadius: 44 * scale,
      }}>
        <div style={{
          position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: 'top left',
          width: 300, height: 622, fontFamily: "'Inter', sans-serif",
        }}>
          {isOutro ? (
            <>
              <div style={{
                position: 'absolute', top: 22, left: 20, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85,
              }}>
                <img src="/app-icon-72.png" alt="" width="17" height="17" style={{ borderRadius: 5, display: 'block' }} />
                <span style={{ fontSize: 9.5, letterSpacing: '0.24em', color: '#fff' }}>AXON</span>
              </div>

              {listReveal > 0.01 ? (
                <ConnectList reveal={listReveal} />
              ) : (
                <div style={{
                  position: 'absolute', left: 22, right: 22, top: 176,
                  padding: 15, borderRadius: 14,
                  background: 'linear-gradient(160deg,rgba(9,10,15,0.93),rgba(5,6,10,0.90))',
                  border: '1px solid rgba(255,255,255,0.11)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
                }}>
                  <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 600, letterSpacing: '0.04em' }}>Neural Link</div>
                  <div style={{ marginTop: 7, fontSize: 10, lineHeight: 1.55, color: '#9aa2b2' }}>
                    Connection established.<br />Memory threads are stable.
                  </div>
                  <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                    <GlassButton label="+ Connect Source" pressed={connectPressed} />
                    <GlassButton label="View Constellation" dim={connectPressed} />
                  </div>
                </div>
              )}

              <Dock active={connectPressed ? 'link' : 'graph'} />
            </>
          ) : (<>
          {/* the mark, from the moment the Core is there to be named */}
          {stage >= 2 && (
            <div style={{
              position: 'absolute', top: 22, left: 20, display: 'flex', alignItems: 'center', gap: 8,
              opacity: 0.85,
            }}>
              <img src="/app-icon-72.png" alt="" width="17" height="17" style={{ borderRadius: 5, display: 'block' }} />
              <span style={{ fontSize: 9.5, letterSpacing: '0.24em', color: '#fff' }}>AXON</span>
            </div>
          )}

          {/* 0 — the cold open: a sentence typed to a machine that has heard it before */}
          {stage === 0 && (
            <div style={{
              position: 'absolute', left: 26, right: 26, top: '38%',
              padding: 14, borderLeft: '1px solid rgba(255,255,255,0.1)',
              fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.92)',
              textShadow: '0 1px 12px rgba(0,0,0,0.9)',
            }}>
              {typed}<span style={{ opacity: Math.round(p * 400) % 2 ? 1 : 0.15 }}>|</span>
            </div>
          )}

          {/* 1 — the void */}
          {stage === 1 && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: '10%', textAlign: 'center',
              fontSize: 10.5, letterSpacing: '1px', color: 'rgba(255,255,255,0.5)',
            }}>
              Every piece of context, scattered.
            </div>
          )}

          {/* 2 — the Core, named, with the one way in */}
          {stage === 2 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '15%', textAlign: 'center' }}>
              <div style={{ fontSize: 10.5, letterSpacing: '2px', color: '#8b93a3' }}>ONE MEMORY. EVERY APP.</div>
              <div style={{
                display: 'inline-block', marginTop: 22, padding: '9px 26px', borderRadius: 12,
                fontSize: 11, color: '#fff', background: experiencePressed ? 'rgba(255,183,51,0.12)' : 'transparent',
                border: `1px solid ${experiencePressed ? 'rgba(255,176,46,0.5)' : 'rgba(255,255,255,0.1)'}`,
                transform: experiencePressed ? 'scale(0.97)' : 'scale(1)',
                transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
              }}>Experience AXON</div>
            </div>
          )}

          {/* 3 — Neural Link and the Active Thread, both smaller than before and
              parked at the top and bottom of the screen: two panels centred on
              a phone cover the Core entirely, and the object they are talking
              about stops being in the shot. */}
          {stage === 3 && (
            <>
              <Panel style={{ position: 'absolute', left: 18, right: 18, top: 84 }}>
                <div style={{ fontSize: 11.5, color: '#fff', fontWeight: 600, letterSpacing: '0.04em' }}>Neural Link</div>
                <div style={{ marginTop: 5, fontSize: 9, lineHeight: 1.5, color: '#9aa2b2' }}>
                  Connection established.<br />Memory threads are stable.
                </div>
                <div style={{ marginTop: 11, display: 'grid', gap: 6 }}>
                  <GlassButton label="+ Connect Source" dim={constellationPressed} />
                  <GlassButton label="View Constellation" pressed={constellationPressed} />
                </div>
              </Panel>

              {/* The sentence the cold open was typing, finished — and it was
                  stored the first time it was said. Nobody clocks that on a
                  first pass; it is the reason the opening reads differently on
                  a second one. */}
              <Panel style={{ position: 'absolute', left: 18, right: 18, bottom: 84 }}>
                <div style={{ fontSize: 11.5, color: '#fff', fontWeight: 600, letterSpacing: '0.04em' }}>Active Thread</div>
                <div style={{
                  marginTop: 6, fontSize: 9, lineHeight: 1.55, color: '#c2c9d6', fontStyle: 'italic',
                }}>
                  &ldquo;As I mentioned yesterday, the architecture needs to reflect the physical
                  reality of a memory. It cannot be confined to a grid.&rdquo;
                </div>
                <div style={{ marginTop: 8, fontSize: 8, color: '#6a7383' }}>
                  Source: Brainstorm Session &middot; 14:02
                </div>
              </Panel>

              <Dock active={constellationPressed ? 'graph' : null} />
            </>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}

const fmt = (n) => n.toLocaleString('en-US');

function Caption({ p }) {
  const b = beatAt(p).id;
  const lines = {
    coldopen: ['', ''],
    void:     ['', ''],
    core:     ['', ''],
    facets:   ['', ''],
    choose:   ['', ''],
    enter:    ['Go in', 'The screen stops being a screen.'],
    orbit:    ['Every source is a summit', 'Height is how much of you it holds. AXON sits at the centre, tallest.'],
    summit:   ['Claude — 412 memories', 'One summit, and the decisions made on it.'],
    climb:    ['Above the landscape', 'Every memory this source holds, oldest at the base, newest at the top.'],
    cross1:   ['These two are the same memory', 'The decision made in Claude, and the commit in Cursor that answers it.'],
    cross2:   ['And it reaches ChatGPT', 'Third tool, same thread. You typed it once.'],
    descend:  ['Come back down', 'Nothing was copied. It was all one memory the whole time.'],
    exit:     ['Back on the desk', 'What the layer has actually saved you.'],
    sources:  ['Ten sources, one account', 'Connect once. The count is cumulative — every source adds to the same you.'],
    vision:   ['', ''],
    mark:     ['', ''],
  }[b] ?? ['', ''];
  if (!lines[0]) return null;
  return (
    <div style={{
      position: 'absolute', left: 'clamp(1.25rem,5vw,5rem)', bottom: 'clamp(3rem,10vh,7rem)',
      maxWidth: '34ch', pointerEvents: 'none',
    }}>
      <h2 style={{
        margin: 0, fontSize: 'clamp(1.5rem,3.4vw,2.6rem)', fontWeight: 600,
        letterSpacing: '-0.022em', lineHeight: 1.1, color: '#fff',
      }}>{lines[0]}</h2>
      <p style={{
        margin: '0.9rem 0 0', fontSize: 'clamp(0.95rem,1.4vw,1.1rem)',
        lineHeight: 1.65, color: '#9aa2b2',
      }}>{lines[1]}</p>
    </div>
  );
}

/* The sources, orbiting the desk.
   Same objects the app floats in its own galaxy — connection cards with the
   real mark on them — but arranged around the phone rather than loose in
   space. Scroll turns the ring; whichever card reaches the top is the one
   being counted, and the totals below it are cumulative, so each turn adds a
   source to the same account rather than replacing the last one. */
const RING = SOURCES.slice(0, 9);
const STEP_DEG = 360 / RING.length;

/* Where the ring is between its three stops. Holds at each one long enough to
   read the number before it moves again. */
function ringPos(p) {
  const t = span(p, 0.855, 0.945);
  const stops = [0.16, 0.5, 0.84];
  if (t <= stops[0]) return 0;
  if (t >= stops[2]) return 2;
  if (t < stops[1]) return ease(span(t, stops[0], stops[1]));
  return 1 + ease(span(t, stops[1], stops[2]));
}

function AppRing({ p }) {
  const vis = ease(span(p, 0.833, 0.877)) * (1 - ease(span(p, 0.930, 0.952)));
  if (vis < 0.01) return null;

  const dev = stageRect(p);
  const posv = ringPos(p);
  const active = Math.round(posv);
  // ROUTE order is the order they come to the top, so the ring is rotated to
  // bring the routed app to twelve o'clock rather than whatever sits there.
  const indexOf = (id) => RING.findIndex((r) => r.id === id);
  const from = indexOf(ROUTE[Math.min(2, Math.floor(posv))]);
  const to = indexOf(ROUTE[Math.min(2, Math.ceil(posv))]);
  const frac = posv - Math.floor(posv);
  const rot = -STEP_DEG * THREE.MathUtils.lerp(from, to, frac);

  // The totals count up as the ring turns rather than snapping on arrival.
  const s0 = CARD_STOPS[Math.min(2, Math.floor(posv))];
  const s1 = CARD_STOPS[Math.min(2, Math.ceil(posv))];
  const n = (k) => Math.round(THREE.MathUtils.lerp(s0[k], s1[k], frac));

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: vis }}>
      {/* the orbit — an ellipse, because a circle wide enough to clear a
          tall phone is also wide enough to leave the frame sideways */}
      {RING.map((src, i) => {
        const Icon = src.icon;
        const activeId = ROUTE[active];
        const isActive = src.id === activeId;
        const deg = -90 + i * STEP_DEG + rot;
        const rad = (deg * Math.PI) / 180;
        // The orbit is measured from the device, not guessed: it has to clear
        // the phone by at least half a card, or twelve and six o'clock end up
        // behind it. Capped by the window so nothing leaves the frame.
        const rx = Math.min(Math.max(dev.w / 2 + 240, 320), window.innerWidth * 0.34);
        const ry = Math.min(Math.max(dev.h / 2 + 112, 260), window.innerHeight * 0.46);
        const x = Math.cos(rad) * rx;
        const y = Math.sin(rad) * ry;
        return (
          <div key={src.id} style={{
            position: 'absolute', left: '50%', top: 'calc(50% - 34px)',
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
            transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <div style={{
              width: 112, display: 'grid', justifyItems: 'center', gap: 7,
              padding: '13px 10px', borderRadius: 15,
              background: isActive
                ? 'linear-gradient(160deg,rgba(255,183,51,0.10),rgba(255,255,255,0.02))'
                : 'linear-gradient(160deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))',
              border: `1px solid ${isActive ? 'rgba(255,183,51,0.42)' : 'rgba(255,255,255,0.09)'}`,
              backdropFilter: 'blur(9px)',
              boxShadow: isActive ? '0 16px 46px rgba(0,0,0,0.7)' : '0 10px 30px rgba(0,0,0,0.5)',
              opacity: isActive ? 1 : 0.5,
              transform: isActive ? 'scale(1.08)' : 'scale(1)',
              transition: 'opacity 0.45s ease, border-color 0.45s ease, background 0.45s ease, transform 0.45s ease',
            }}>
              {Icon && <Icon size={26} />}
              <span style={{ fontSize: 10.5, letterSpacing: '0.14em', color: '#c9ced8' }}>{src.name}</span>
            </div>
          </div>
        );
      })}

      {/* the running account — bottom right, opposite the caption and clear
          of the twelve o'clock slot the active card occupies */}
      <div style={{
        position: 'absolute', right: 'clamp(1.25rem,5vw,5rem)',
        bottom: 'clamp(2rem,7vh,4.5rem)', display: 'grid', gap: 9, width: 232, zIndex: 5,
      }}>
        {[['Memories held', n('memories')], ['Context packs delivered', n('packs')], ['Tokens saved', n('tokens')]].map(([k, v]) => (
          <div key={k} style={{
            padding: '12px 15px', borderRadius: 13,
            border: '1px solid rgba(255,255,255,0.09)',
            background: 'linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.012))',
            backdropFilter: 'blur(9px)',
          }}>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#5c6373' }}>{k}</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', marginTop: 3 }}>
              {v.toLocaleString('en-US')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Vision({ p }) {
  const vis = ease(span(p, 0.952, 0.968)) * (1 - ease(span(p, 0.978, 0.992)));
  if (vis < 0.01) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      padding: '0 clamp(1.25rem,5vw,5rem)', opacity: vis, pointerEvents: 'none',
    }}>
      <p style={{
        margin: 0, maxWidth: '30ch', textAlign: 'center', color: '#fff',
        fontSize: 'clamp(1.4rem,3.2vw,2.5rem)', fontWeight: 600,
        letterSpacing: '-0.022em', lineHeight: 1.3,
      }}>
        Open Cursor on a Monday. It already knows the decision you made with Claude last Thursday.
      </p>
    </div>
  );
}

function Mark({ p }) {
  const vis = ease(span(p, 0.978, 1.0));
  if (vis < 0.01) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      opacity: vis, pointerEvents: 'none',
    }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 22 }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
          <path d="M6.5 17.5c-3.1-1.4-4-5.3-1.6-7.9 2.1-2.3 5.4-2 7.9-.6 2.9 1.6 6.4 1.3 7.1-1.4.5-2-1.1-3.9-3.2-3.9-2.6 0-4.1 2.4-4.4 5-.5 4.6-2.2 8.6-5.8 9.3"
            stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 15, letterSpacing: '0.3em', color: '#fff' }}>AXON MEMORY</span>
      </div>
    </div>
  );
}

/* ── the banner ───────────────────────────────────────────────────────────*/
/* Scroll is not the film — it is one way of driving it.
   Everything in here reads a single number between 0 and 1 and knows nothing
   about where it came from. So the same timeline runs off a clock as easily as
   off a finger, and the two are a toggle rather than two builds. Useful while
   making it, and the clock is also what a screen recording would run on. */
// Long enough that no single move has to hurry. A film nobody is scrubbing
// can afford to let each beat land.
const FILM_SECONDS = 135;
const SPEEDS = [0.5, 1, 2];

export default function Banner() {
  const wrapRef = useRef(null);
  const pRef = useRef(0);
  // Depth reads off scroll the same way the climb does — a ref, so opening a
  // cluster costs no re-render at sixty frames a second.
  const drillRef = useRef(0);
  // Kept separate from the climb: near the end the landscape has to go, and
  // unmounting a 170x170 heightfield mid-film drops a frame every time.
  const veilRef = useRef(0);
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // The loop is started once and never re-created, so it reads the controls
  // through refs rather than closing over stale state.
  const playRef = useRef(false);
  const speedRef = useRef(1);
  const tRef = useRef(0);
  const lastRef = useRef(0);
  playRef.current = playing;
  speedRef.current = speed;

  useEffect(() => {
    let raf = 0;
    const read = (now) => {
      const el = wrapRef.current;
      const dt = lastRef.current ? Math.min(0.1, (now - lastRef.current) / 1000) : 0;
      lastRef.current = now;

      if (el && playRef.current) {
        // Clock-driven: the stage is held pinned so the sticky frame stays
        // filled, and the timeline advances on its own.
        tRef.current = Math.min(FILM_SECONDS, tRef.current + dt * speedRef.current);
        const top = el.offsetTop;
        if (Math.abs(window.scrollY - top) > 2) window.scrollTo(0, top);
        const v = clamp01(tRef.current / FILM_SECONDS);
        pRef.current = v;
        drillRef.current = drillAt(v);
        veilRef.current = Math.max(riseAt(v), clamp01(span(v, 0.815, 0.858)));
        setP((prev) => (Math.abs(prev - v) > 0.003 ? v : prev));
        if (v >= 1) {
          // Hand back to scroll AT THE END, not at the beginning. Releasing it
          // while the window was still pinned to the top made the scroll
          // branch read zero, and the last frame of the film jumped to the
          // first — which read as a freeze, then a restart.
          playRef.current = false;
          const total = el.getBoundingClientRect().height - window.innerHeight;
          window.scrollTo(0, top + Math.max(0, total));
          setPlaying(false);
        }
        raf = requestAnimationFrame(read);
        return;
      }

      if (el) {
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        const v = total > 0 ? clamp01(-r.top / total) : 0;
        pRef.current = v;
        drillRef.current = drillAt(v);
        veilRef.current = Math.max(riseAt(v), clamp01(span(v, 0.815, 0.858)));
        // State is stepped, not per frame: the furniture over the canvas does
        // not need sixty updates a second, and the camera reads the ref.
        setP((prev) => (Math.abs(prev - v) > 0.002 ? v : prev));
      }
      raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Starting the film picks up where the scroll left it, rather than snapping
  // back to the beginning.
  const toggle = () => {
    if (!playing) {
      tRef.current = (pRef.current >= 0.999 ? 0 : pRef.current) * FILM_SECONDS;
      const el = wrapRef.current;
      if (el) window.scrollTo(0, el.offsetTop);
    }
    setPlaying((v) => !v);
  };

  const { w, h, r } = stageRect(p);
  const clip = `inset(calc(50% - ${h / 2}px) calc(50% - ${w / 2}px) round ${r}px)`;

  return (
    <section ref={wrapRef} style={{ height: '900vh', position: 'relative', background: '#04050a' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canvas dpr={[0.6, 1]} camera={{ position: [0, 0, 12], fov: 62 }} gl={{ alpha: false, antialias: false }}>
            <GalaxyBackdrop />
          </Canvas>
        </div>
        <div style={{ position: 'absolute', inset: 0, clipPath: clip, WebkitClipPath: clip }}>
          <Canvas
            dpr={[0.75, 1.25]}
            camera={{ position: [0, 74, 26], fov: 48, near: 0.1, far: 520 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
          >
            <Scene
              pRef={pRef}
              showMarkers={p >= 0.145}
              showCore={p >= 0.032 && p < 0.175}
              focusId={focusAt(p)}
              reachId={reachingAt(p)}
              drillRef={drillRef}
              veilRef={veilRef}
            />
          </Canvas>
        </div>
        <PhoneScreen p={p} />
        <PhoneFrame p={p} />
        <Caption p={p} />
        <AppRing p={p} />
        <Vision p={p} />
        <Mark p={p} />

        {/* Driver switch. Deliberately plain — this is a control, not part of
            the film, and it should never be mistaken for one. */}
        <div style={{
          position: 'absolute', left: 20, top: 20, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 9px', borderRadius: 11,
          background: 'rgba(10,12,16,0.78)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
          <button
            type="button"
            onClick={toggle}
            style={{
              cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)',
              background: playing ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: '#fff', borderRadius: 7, padding: '4px 10px', fontSize: 11,
              fontFamily: 'inherit', minWidth: 62,
            }}
          >{playing ? 'Film' : 'Scroll'}</button>

          <button
            type="button"
            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
            style={{
              cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)',
              background: 'transparent', color: playing ? '#fff' : 'rgba(255,255,255,0.4)',
              borderRadius: 7, padding: '4px 8px', fontSize: 11, fontFamily: 'inherit',
            }}
          >{speed}&times;</button>

          <div style={{ width: 96, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }}>
            <div style={{
              width: `${Math.round(p * 100)}%`, height: '100%', borderRadius: 2,
              background: '#ffb733',
            }} />
          </div>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', minWidth: 30, textAlign: 'right' }}>
            {Math.round(p * 100)}%
          </span>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.32)' }}>
            {beatAt(p).id}
          </span>
        </div>

        {p > 0.250 && p < 0.815 && (
          <div style={{
            position: 'absolute', top: 'clamp(1.25rem,5vw,3rem)', right: 'clamp(1.25rem,5vw,5rem)',
            textAlign: 'right', pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#5c6373' }}>AXON Memory</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#ffb733', letterSpacing: '-0.02em' }}>{fmt(CORE_COUNT)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
