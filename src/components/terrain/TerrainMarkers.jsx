/**
 * TerrainMarkers - gold beacons on hub summits (clickable), leaf-node rings
 * revealed around a focused hub (clickable -> opens the app's memory card),
 * and the cinematic camera rig.
 *
 * Ported unchanged from AXE CORE HQ.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, QuadraticBezierLine } from '@react-three/drei';
import { makeGlowTexture } from './terrainEngine';

const beamVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float a = pow(1.0 - vUv.y, 2.2) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function computeLeafRing(hub, leaves, engine) {
  return leaves.map((s, i) => {
    const ang = (i / Math.max(1, leaves.length)) * Math.PI * 2 + 0.7;
    const r = hub.radius * (0.85 + 0.3 * (i % 2));
    const x = hub.x + Math.cos(ang) * r;
    const z = hub.z + Math.sin(ang) * r;
    const y = engine.heightAt(x, z);
    return { ...s, x, y, z };
  });
}

function HubBeacon({ hub, engine, glowTex, hovered, selected, dimmed, onSelect, onHover }) {
  const peakY = useMemo(() => engine.heightAt(hub.x, hub.z), [hub, engine]);
  const beamH = 1.5 + hub.height * 0.4;
  const spriteRef = useRef(null);
  const beamMat = useRef(null);
  const Icon = hub.icon;
  const active = hovered || selected;

  const beamUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(hub.colorHex) }, uOpacity: { value: 0.7 } }),
    [hub.colorHex],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 1 + 0.1 * Math.sin(t * 2 + hub.x * 1.3);
    const s = (hovered || selected ? 2.9 : 2.1) * pulse;
    if (spriteRef.current) spriteRef.current.scale.set(s, s, 1);
    if (beamMat.current) {
      beamMat.current.uniforms.uOpacity.value =
        (hovered || selected ? 0.95 : 0.6) + 0.15 * Math.sin(t * 2.3 + hub.z);
    }
  });

  return (
    <group position={[hub.x, peakY, hub.z]}>
      <sprite ref={spriteRef} position={[0, 0.15, 0]} renderOrder={3}>
        <spriteMaterial
          map={glowTex}
          color={hub.colorHex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={dimmed ? 0.35 : 0.9}
          toneMapped={false}
        />
      </sprite>
      <mesh position={[0, beamH / 2, 0]} renderOrder={3}>
        <cylinderGeometry args={[0.03, 0.1, beamH, 8, 1, true]} />
        <shaderMaterial
          ref={beamMat}
          uniforms={beamUniforms}
          vertexShader={beamVertex}
          fragmentShader={beamFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* invisible hitbox */}
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (e.delta <= 2) onSelect(hub);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(hub.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[1.6, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hub.name && !hub.hideLabel && (
        <Html
          center
          position={[0, 2.6, 0]}
          distanceFactor={30}
          zIndexRange={[40, 0]}
          style={{ pointerEvents: 'none', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.4s ease' }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {Icon && (
              // Matte-black app tile carrying the provider's real brand mark —
              // the same treatment as the AXON icon itself, so a summit reads
              // as "this app" at a glance.
              <div
                style={{
                  width: 54,
                  height: 54,
                  marginBottom: 7,
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(160deg, #17181a 0%, #0b0c0d 55%, #070708 100%)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  boxShadow: active
                    ? '0 6px 22px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,183,51,0.35), 0 0 26px rgba(255,183,51,0.28), inset 0 1px 0 rgba(255,255,255,0.07)'
                    : '0 6px 20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)',
                  transition: 'box-shadow 0.35s ease, transform 0.35s ease',
                  transform: active ? 'translateY(-2px)' : 'none',
                }}
              >
                <Icon size={28} />
              </div>
            )}
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, letterSpacing: 0.2, textShadow: '0 2px 14px rgba(0,0,0,0.9)' }}>
              {hub.name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5, marginTop: 1 }}>
              {hub.memories.toLocaleString()} memories
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function LeafRing({ hub, leaves, engine, glowTex, showLabels, onSelectLeaf }) {
  const group = useRef(null);
  const prog = useRef(0);
  useEffect(() => {
    prog.current = 0;
  }, [hub]);
  useFrame((_, dt) => {
    prog.current = Math.min(1, prog.current + dt * 1.3);
    const e = 1 - Math.pow(1 - prog.current, 3);
    if (group.current) {
      group.current.visible = prog.current > 0.03;
      group.current.scale.setScalar(THREE.MathUtils.lerp(0.92, 1, e));
    }
  });

  const peakY = engine.heightAt(hub.x, hub.z);
  const peakTop = [hub.x, peakY + 0.3, hub.z];

  return (
    <group ref={group}>
      {leaves.map((n) => (
        <group key={n.id}>
          <QuadraticBezierLine
            start={peakTop}
            end={[n.x, n.y + 0.25, n.z]}
            mid={[(hub.x + n.x) / 2, Math.max(peakY, n.y) + 1.5, (hub.z + n.z) / 2]}
            color={hub.colorHex}
            lineWidth={1}
            transparent
            opacity={0.45}
          />
          <sprite position={[n.x, n.y + 0.25, n.z]} scale={[1.15, 1.15, 1]} renderOrder={3}>
            <spriteMaterial
              map={glowTex}
              color={hub.colorHex}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.9}
              toneMapped={false}
            />
          </sprite>
          <mesh position={[n.x, n.y + 0.25, n.z]} renderOrder={3}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          {/* invisible hitbox - leaf opens the app's memory card */}
          <mesh
            position={[n.x, n.y + 0.25, n.z]}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              if (e.delta <= 2) onSelectLeaf(n);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            <sphereGeometry args={[0.7, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {showLabels && (
            <Html
              center
              position={[n.x, n.y + 1.05, n.z]}
              distanceFactor={20}
              zIndexRange={[40, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div style={{ textAlign: 'center', whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>{n.label}</div>
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

export function TerrainCameraRig({
  engine,
  selected,
  controlsRef,
  diveRef,
  defaultCam = [0, 18, 31],
  defaultTarget = [0, 0.5, 0],
}) {
  const { camera } = useThree();
  const anim = useRef({ active: false, t: 0 });
  const diveBase = useRef({ camY: 0, camZ: 0, tgtY: 0 });

  useEffect(() => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    let toPos;
    let toTgt;
    if (selected) {
      const peakY = engine.heightAt(selected.x, selected.z);
      toTgt = new THREE.Vector3(selected.x, peakY + 0.3, selected.z);
      const dir = new THREE.Vector3(selected.x, 0, selected.z);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize();
      const dist = selected.radius * 2.4;
      toPos = new THREE.Vector3(
        selected.x + dir.x * dist,
        peakY + selected.radius * 0.85,
        selected.z + dir.z * dist,
      );
    } else {
      toTgt = new THREE.Vector3(...defaultTarget);
      toPos = new THREE.Vector3(...defaultCam);
    }
    anim.current = {
      active: true,
      t: 0,
      fromPos: camera.position.clone(),
      toPos,
      fromTgt: ctl.target.clone(),
      toTgt,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useFrame((_, dt) => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    const a = anim.current;
    if (a.active) {
      a.t = Math.min(1, a.t + dt / 1.5);
      const e = easeInOutCubic(a.t);
      camera.position.lerpVectors(a.fromPos, a.toPos, e);
      ctl.target.lerpVectors(a.fromTgt, a.toTgt, e);
      if (a.t >= 1) a.active = false;
    }
    ctl.enabled = !a.active;

    const dive = diveRef?.current ?? 0;
    if (dive > 0.001 && selected) {
      // The descent is an absolute offset from where the fly-to left the
      // camera, not a nudge applied to wherever it happens to be. Subtracting
      // from the live position every frame made it fall forever, which is why
      // the roots flashed past and the view ended in the void below them.
      const drop = 9.5 * dive;
      camera.position.y = diveBase.current.camY - drop;
      camera.position.z = diveBase.current.camZ + 2.5 * dive;
      ctl.target.y = diveBase.current.tgtY - drop * 1.05;
    } else {
      // Remember where level flight left us, so the next dive starts from here.
      diveBase.current.camY = camera.position.y;
      diveBase.current.camZ = camera.position.z;
      diveBase.current.tgtY = ctl.target.y;
      const minY = engine.heightAt(camera.position.x, camera.position.z) + 0.7;
      if (camera.position.y < minY) camera.position.y = minY;
    }
    ctl.update();
  });

  return null;
}

export default function TerrainMarkers({
  engine,
  selected,
  leaves,
  hoveredId,
  onHover,
  onSelectHub,
  onSelectLeaf,
  showLeafLabels,
}) {
  const glowTex = useMemo(() => makeGlowTexture(), []);
  return (
    <group>
      {engine.hubs
        .filter((hub) => !hub.decorative)
        .map((hub) => (
          <HubBeacon
            key={hub.id}
            hub={hub}
            engine={engine}
            glowTex={glowTex}
            hovered={hoveredId === hub.id}
            selected={selected?.id === hub.id}
            dimmed={!!selected && selected.id !== hub.id}
            onSelect={onSelectHub}
            onHover={onHover}
          />
        ))}
      {selected && leaves.length > 0 && (
        <LeafRing
          hub={selected}
          leaves={leaves}
          engine={engine}
          glowTex={glowTex}
          showLabels={showLeafLabels}
          onSelectLeaf={onSelectLeaf}
        />
      )}
    </group>
  );
}
