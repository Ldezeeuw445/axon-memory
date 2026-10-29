import React from 'react';
import { motion, useDragControls } from 'framer-motion';

/**
 * Glass overlay panel (Terrain detail sheets, legacy shard).
 *
 * The main product shell no longer wraps facets in a central panel — content
 * floats as individual glass cards on the persistent galaxy (see AppShell +
 * FloatCard / .ax-facet-host--float). This component remains for overlays that
 * still need a single contained surface (e.g. MemoryGraph).
 *
 * Desktop may keep the asymmetric "shard" clip-path. Mobile must NOT use
 * clip-path: on iOS Safari, clip-path + backdrop-filter silently kills the blur.
 */
export default function FragmentPanel({
  children,
  delay = 0,
  style,
  instant = false,
  shard = true,
  draggable = false,
  dragConstraints,
}) {
  const controls = useDragControls();
  const shardClip = 'polygon(0 16px, calc(100% - 16px) 0, 100% calc(100% - 16px), 16px 100%)';

  return (
    <motion.div
      initial={instant ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay,
        duration: 1.2,
        ease: [0.25, 1, 0.5, 1],
      }}
      className={`glass-surface${shard ? '' : ' glass-surface--float'}`}
      drag={draggable}
      dragControls={draggable ? controls : undefined}
      dragListener={false}
      dragConstraints={draggable ? dragConstraints : undefined}
      dragElastic={0.12}
      dragMomentum={false}
      whileDrag={draggable ? { scale: 1.01 } : undefined}
      style={{
        position: 'relative',
        padding: '32px',
        color: 'var(--color-text-primary)',
        clipPath: shard ? shardClip : 'none',
        borderRadius: shard ? undefined : 24,
        ...(shard
          ? {}
          : {
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 64px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)',
            }),
        ...style,
      }}
    >
      {draggable && (
        <div
          role="presentation"
          aria-hidden="true"
          onPointerDown={(e) => controls.start(e)}
          style={{
            position: 'absolute',
            top: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 44,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            touchAction: 'none',
            zIndex: 5,
          }}
        >
          <span
            style={{
              width: 36,
              height: 4,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.28)',
            }}
          />
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
          pointerEvents: 'none',
        }}
      />

      {children}
    </motion.div>
  );
}
