/**
 * The cinematic hero: a premium product film embedded in the page.
 *
 * Scroll is the timeline and scroll is the camera — the visitor moves through
 * one continuous black studio rather than down a stack of sections. The memory
 * plate is carried between sets; it is never cut to a new position.
 *
 * Shots 01 and 02 are generated video plates layered over the canvas. Their
 * files live in public/shots/ and are listed in public/shots/README.md; until
 * they are supplied the layer stays black and the film simply opens on shot 03.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import MemoryPlate from './MemoryPlate';
import { Archive, Core, Device, Docks, Fragments } from './props';
import { SHOTS, SHOT_COUNT, SHOT_TO_ACT } from './shots';

/* ── stage ────────────────────────────────────────────────────── */

/**
 * A black studio. One soft backlight for the rim that defines every silhouette,
 * a low fill so the anodised faces are not pure black, and lightformers to give
 * the polished chamfers something to reflect. Without reflections the metal
 * reads as flat plastic.
 */
function Stage() {
  return (
    <>
      <ambientLight intensity={0.16} />
      <directionalLight position={[-4.5, 3.2, -5]} intensity={2.2} color="#dce6ff" />
      <directionalLight position={[3, 1.4, 4]} intensity={0.5} color="#8fa2c4" />
      {/*
        Anodised titanium is almost entirely reflective, so what it looks like
        is decided here, not by the lights above. A sparse environment gives it
        nothing to return and the metal reads as flat black — which is exactly
        what happened on the first pass. These are the softboxes of the studio:
        a big key overhead, a long rim behind, and a warm bounce from below.
      */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={7} position={[0, 6, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 8, 1]} color="#e8f0ff" />
        <Lightformer form="rect" intensity={5} position={[-6, 2, -5]} scale={[10, 7, 1]} color="#cfe0ff" />
        <Lightformer form="rect" intensity={2.6} position={[6.5, 1, 3.5]} scale={[7, 5, 1]} color="#93a4c4" />
        <Lightformer form="rect" intensity={2.2} position={[0, -4, 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[8, 6, 1]} color="#ffb974" />
        {/* narrow strips read as specular lines travelling along the chamfers */}
        <Lightformer form="rect" intensity={9} position={[-2.5, 3.5, 2.5]} scale={[0.4, 5, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={5} position={[3, -1.5, 2]} scale={[0.3, 4, 1]} color="#ffd9a8" />
      </Environment>
    </>
  );
}

/* ── camera ───────────────────────────────────────────────────── */

function CameraRig({ progressRef, reducedMotion }) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(...SHOTS[0].cam));
  const tgt = useRef(new THREE.Vector3(...SHOTS[0].look));
  const wantP = useMemo(() => new THREE.Vector3(), []);
  const wantT = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ pointer }) => {
    const p = THREE.MathUtils.clamp(progressRef.current, 0, SHOT_COUNT - 1 - 1e-4);
    const i0 = Math.floor(p);
    const i1 = Math.min(SHOT_COUNT - 1, i0 + 1);
    const t = p - i0;
    const a = SHOTS[i0];
    const b = SHOTS[i1];

    wantP.set(
      THREE.MathUtils.lerp(a.cam[0], b.cam[0], t),
      THREE.MathUtils.lerp(a.cam[1], b.cam[1], t),
      THREE.MathUtils.lerp(a.cam[2], b.cam[2], t),
    );
    wantT.set(
      THREE.MathUtils.lerp(a.look[0], b.look[0], t),
      THREE.MathUtils.lerp(a.look[1], b.look[1], t),
      THREE.MathUtils.lerp(a.look[2], b.look[2], t),
    );

    // A hair of parallax so the move feels operated rather than keyframed.
    if (!reducedMotion) {
      wantP.x += pointer.x * 0.16;
      wantP.y += pointer.y * 0.1;
    }

    pos.current.lerp(wantP, 0.075);
    tgt.current.lerp(wantT, 0.09);
    camera.position.copy(pos.current);
    camera.lookAt(tgt.current);
  });

  return null;
}

/* ── the plate, carried across the whole film ─────────────────── */

function lerpArr(a, b, t) {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  ];
}

function TravellingPlate({ progressRef }) {
  const ref = useRef(null);
  const [state, setState] = useState('gathering');
  const [fill, setFill] = useState(0.35);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const p = THREE.MathUtils.clamp(progressRef.current, 0, SHOT_COUNT - 1 - 1e-4);
    const i0 = Math.floor(p);
    const i1 = Math.min(SHOT_COUNT - 1, i0 + 1);
    const t = p - i0;

    // Shots where the plate is absent (it is inside the screen) still need a
    // position to travel through, so fall back to the nearest defining shot.
    const findPlate = (i, dir) => {
      for (let k = i; k >= 0 && k < SHOT_COUNT; k += dir) if (SHOTS[k].plate) return SHOTS[k].plate;
      return SHOTS[2].plate;
    };
    const a = SHOTS[i0].plate ?? findPlate(i0, -1);
    const b = SHOTS[i1].plate ?? findPlate(i1, 1);

    const pp = lerpArr(a.pos, b.pos, t);
    const rr = lerpArr(a.rot, b.rot, t);
    g.position.set(pp[0], pp[1], pp[2]);
    g.rotation.set(rr[0], rr[1], rr[2]);
    const s = THREE.MathUtils.lerp(a.scale, b.scale, t);
    g.scale.setScalar(s);

    // Hidden only while it is genuinely inside the device screen.
    g.visible = !(SHOTS[i0].plate === null && t < 0.5) && !(SHOTS[i1].plate === null && t > 0.5);

    const nearer = t < 0.5 ? SHOTS[i0] : SHOTS[i1];
    // The one flare in the film: shot 10, and only across its centre.
    const flaring = nearer.flare && Math.abs(p - 9) < 0.18;
    const next = flaring ? 'recalled' : (nearer.plate ?? a).state;
    setState((prev) => (prev === next ? prev : next));
    const nf = THREE.MathUtils.lerp(a.fill ?? 1, b.fill ?? 1, t);
    setFill((prev) => (Math.abs(prev - nf) < 0.01 ? prev : nf));
  });

  return <MemoryPlate ref={ref} state={state} fill={fill} />;
}

/* ── set dressing, shown only near the shots that use it ──────── */

function Sets({ progressRef, screenTexture }) {
  const [vis, setVis] = useState({ core: false, device: false, docks: false, archive: false });
  const fragRef = useRef(0);
  const gatherRef = useRef(0);
  const [, force] = useState(0);

  useFrame(() => {
    const p = progressRef.current;
    const near = (i, w = 1.6) => Math.abs(p - i) < w;
    const next = {
      core: near(4),
      device: near(5, 1.4) || near(6, 1.4) || near(9, 1.4) || near(10, 2),
      docks: near(7, 1.6) || near(10, 2),
      archive: near(8, 1.6),
    };
    setVis((prev) =>
      prev.core === next.core && prev.device === next.device && prev.docks === next.docks && prev.archive === next.archive
        ? prev
        : next,
    );
    fragRef.current = THREE.MathUtils.clamp((p - 2.4) / 1.1, 0, 1);
    gatherRef.current = THREE.MathUtils.clamp((p - 8.05) / 0.85, 0, 1);
    force((n) => (n + 1) % 1000);
  });

  const p = progressRef.current;
  const seated = p > 6.7 && p < 7.9 ? Math.min(2, Math.floor((p - 6.9) * 3.2)) : -1;

  return (
    <>
      {fragRef.current > 0 && fragRef.current < 1 && <Fragments progress={fragRef.current} />}
      <Core visible={vis.core} />
      <Device visible={vis.device} screenTexture={screenTexture} />
      <Docks visible={vis.docks} seatedIndex={seated} />
      <Archive visible={vis.archive} gather={gatherRef.current} />
    </>
  );
}

/* ── scroll → progress ────────────────────────────────────────── */

function useFilmProgress(trackRef) {
  const progressRef = useRef(0);
  const [shot, setShot] = useState(0);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      const el = trackRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        const scrolled = THREE.MathUtils.clamp(-rect.top, 0, Math.max(1, scrollable));
        const p = (scrolled / Math.max(1, scrollable)) * (SHOT_COUNT - 1);
        progressRef.current = p;
        const s = Math.round(p);
        setShot((prev) => (prev === s ? prev : s));
      }
      raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [trackRef]);

  return { progressRef, shot };
}

/* ── the film ─────────────────────────────────────────────────── */

export default function Film({ captions }) {
  const trackRef = useRef(null);
  const { progressRef, shot } = useFilmProgress(trackRef);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mob = window.matchMedia('(max-width: 820px), (pointer: coarse)');
    const sync = () => {
      setReducedMotion(mq.matches);
      setIsMobile(mob.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    mob.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      mob.removeEventListener('change', sync);
    };
  }, []);

  // Real product screenshot for shots 07 and 10. Absent until supplied — the
  // device screen stays dark rather than showing a fabricated interface.
  const [screenTexture, setScreenTexture] = useState(null);
  useEffect(() => {
    const img = new Image();
    img.src = '/shots/memory-screen.png';
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      setScreenTexture(t);
    };
    return () => {
      img.onload = null;
    };
  }, []);

  // The two generated plates. On mobile they fall back to their approved
  // keyframe stills — the narrative is identical, only the motion is dropped.
  const plateShot = shot <= 1 ? shot + 1 : null;

  return (
    <div ref={trackRef} className="film-track" style={{ height: `${SHOT_COUNT * 88}vh` }}>
      <div className="film-stage">
        <Canvas
          shadows={false}
          dpr={isMobile ? [1, 1.4] : [1, 1.9]}
          camera={{ position: SHOTS[0].cam, fov: 38, near: 0.1, far: 120 }}
          gl={{ antialias: !isMobile, alpha: false, powerPreference: 'default' }}
        >
          <color attach="background" args={['#010103']} />
          <Stage />
          <TravellingPlate progressRef={progressRef} />
          <Sets progressRef={progressRef} screenTexture={screenTexture} />
          <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} />
          <EffectComposer multisampling={0}>
            {/* Restrained on purpose: only the channel light is hot enough to
                bloom, so it reads as light escaping a slot, not a filter. */}
            <Bloom intensity={0.7} luminanceThreshold={0.52} luminanceSmoothing={0.45} mipmapBlur radius={0.75} />
            <Vignette eskil={false} offset={0.28} darkness={0.9} />
          </EffectComposer>
        </Canvas>

        {/* generated plates for shots 01–02 */}
        <div className={`film-plates ${plateShot ? 'is-live' : ''}`} aria-hidden="true">
          {[1, 2].map((n) => (
            <video
              key={n}
              className={plateShot === n ? 'is-live' : ''}
              src={isMobile ? undefined : `/shots/0${n}.mp4`}
              poster={`/shots/0${n}.jpg`}
              muted
              playsInline
              loop
              autoPlay={!reducedMotion}
              preload="none"
            />
          ))}
        </div>

        <div className="film-captions">
          {captions.map((c, i) => {
            const live = SHOT_TO_ACT[shot] === i;
            return (
              <figure key={c.title} className={`caption ${live ? 'is-live' : ''}`} aria-hidden={!live}>
                <figcaption className="caption-eyebrow">{c.eyebrow}</figcaption>
                <h2 className="caption-title">{c.title}</h2>
                <p className="caption-body">{c.body}</p>
              </figure>
            );
          })}
        </div>

        <div className="film-progress" role="presentation">
          {SHOTS.map((s, i) => (
            <span key={s.id} className={i === shot ? 'is-live' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
