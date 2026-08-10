/**
 * The cinematic hero. A fixed canvas behind a tall scroll track: scrolling is
 * the timeline, so the viewer sets the pacing and nothing autoplays at them.
 *
 * NOTE — if a rendered film asset is ever produced, this is where it slots in:
 * swap <MorphPoints/> for a <video> texture (or a full-bleed <video> behind
 * the caption layer) and keep the same scroll-progress plumbing below.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import MorphPoints, { Atmosphere } from './MorphPoints';

export const ACT_COUNT = 6;

// Where the camera sits for each act. Wide and cold for the problem, close
// and legible for the memory object.
const CAM = [
  [0, 0.2, 9.2],
  [0, 0, 6.4],
  [0, 0.1, 12.6],
  [0, 0.5, 11.2],
  [0, 0.1, 13.4],
  [0, 0, 7.2],
];

function CameraRig({ progressRef, reducedMotion }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const cur = useRef(new THREE.Vector3(...CAM[0]));

  useFrame(({ pointer }) => {
    const p = THREE.MathUtils.clamp(progressRef.current, 0, ACT_COUNT - 1 - 1e-4);
    const i0 = Math.floor(p);
    const i1 = Math.min(ACT_COUNT - 1, i0 + 1);
    const t = p - i0;
    target.set(
      THREE.MathUtils.lerp(CAM[i0][0], CAM[i1][0], t),
      THREE.MathUtils.lerp(CAM[i0][1], CAM[i1][1], t),
      THREE.MathUtils.lerp(CAM[i0][2], CAM[i1][2], t),
    );
    // A little parallax off the pointer keeps it feeling hand-held, not rigged.
    if (!reducedMotion) {
      target.x += pointer.x * 0.5;
      target.y += pointer.y * 0.3;
    }
    cur.current.lerp(target, 0.06);
    camera.position.copy(cur.current);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/** Scroll position of the film track, normalised to 0 .. ACT_COUNT-1. */
function useFilmProgress(trackRef) {
  const progressRef = useRef(0);
  const [act, setAct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      const el = trackRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        const scrolled = THREE.MathUtils.clamp(-rect.top, 0, Math.max(1, scrollable));
        const p = (scrolled / Math.max(1, scrollable)) * (ACT_COUNT - 1);
        progressRef.current = p;
        const a = Math.round(p);
        setAct((prev) => (prev === a ? prev : a));
      }
      raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [trackRef]);

  return { progressRef, act };
}

export default function Film({ captions }) {
  const trackRef = useRef(null);
  const { progressRef, act } = useFilmProgress(trackRef);

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

  return (
    <div ref={trackRef} className="film-track" style={{ height: `${ACT_COUNT * 100}vh` }}>
      <div className="film-stage">
        <Canvas
          dpr={isMobile ? [1, 1.25] : [1, 1.75]}
          camera={{ position: CAM[0], fov: 45, near: 0.1, far: 200 }}
          gl={{ antialias: !isMobile, alpha: false, powerPreference: 'default' }}
        >
          {/* Near-true void. Depth is carried by the shader's own falloff and
              by the haze layer, not by a lifted background colour. */}
          <color attach="background" args={['#010103']} />
          <Atmosphere count={isMobile ? 700 : 1500} reducedMotion={reducedMotion} />
          <MorphPoints
            progressRef={progressRef}
            count={isMobile ? 7000 : 16000}
            reducedMotion={reducedMotion}
          />
          <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} />
          <EffectComposer multisampling={0}>
            {/* High threshold, low intensity: only the hottest cores bloom, so
                it reads as light in air rather than a glow filter. */}
            <Bloom intensity={0.42} luminanceThreshold={0.62} luminanceSmoothing={0.5} mipmapBlur radius={0.9} />
            <Vignette eskil={false} offset={0.3} darkness={0.92} />
          </EffectComposer>
        </Canvas>

        <div className="film-captions">
          {captions.map((c, i) => (
            <figure key={c.title} className={`caption ${act === i ? 'is-live' : ''}`} aria-hidden={act !== i}>
              <figcaption className="caption-eyebrow">{c.eyebrow}</figcaption>
              <h2 className="caption-title">{c.title}</h2>
              <p className="caption-body">{c.body}</p>
            </figure>
          ))}
        </div>

        <div className="film-progress" role="presentation">
          {Array.from({ length: ACT_COUNT }, (_, i) => (
            <span key={i} className={i === act ? 'is-live' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
