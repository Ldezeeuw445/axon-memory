import React, { useRef } from 'react';
import { motion, useDragControls, useMotionValue, useTransform } from 'framer-motion';

/**
 * One floating glass card on the galaxy — no surrounding panel.
 * Idle float lives in CSS (`translate`) so it never fights drag transforms.
 * Drag arms after a short long-press OR a clear horizontal swipe so vertical
 * scroll inside the facet is never stolen. On release the card springs back.
 */
export default function FloatCard({
  children,
  className = '',
  style,
  delay = 0,
  index = 0,
  draggable = false,
  dragConstraints,
  as: Tag = 'div',
  reduceMotion = false,
  ...rest
}) {
  const controls = useDragControls();
  const MotionTag = motion[Tag] || motion.div;
  const stagger = Math.min(index, 8) * 0.04;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateY = useTransform(x, [-70, 70], [-6, 6]);
  const rotateX = useTransform(y, [-70, 70], [5, -5]);
  const armRef = useRef({ timer: null, move: null, up: null });

  const clearArm = () => {
    const a = armRef.current;
    if (a.timer) clearTimeout(a.timer);
    if (a.move) window.removeEventListener('pointermove', a.move);
    if (a.up) window.removeEventListener('pointerup', a.up);
    a.timer = a.move = a.up = null;
  };

  const armDrag = (e) => {
    if (!draggable || reduceMotion) return;
    const t = e.target;
    if (t?.closest?.('button, a, input, textarea, select, [role="button"], [data-no-drag]')) return;

    clearArm();
    const startX = e.clientX;
    const startY = e.clientY;
    let armed = false;

    const start = (ev) => {
      if (armed) return;
      armed = true;
      clearArm();
      try {
        controls.start(ev);
      } catch {
        /* pointer already released */
      }
    };

    armRef.current.timer = setTimeout(() => start(e), 240);

    armRef.current.move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (armed) return;
      if (Math.abs(dx) > 11 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        start(ev);
        return;
      }
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) clearArm();
    };
    armRef.current.up = () => clearArm();
    window.addEventListener('pointermove', armRef.current.move, { passive: true });
    window.addEventListener('pointerup', armRef.current.up, { passive: true });
  };

  return (
    <MotionTag
      className={`ax-float-card${reduceMotion ? '' : ' ax-float-card--idle'} ${className}`.trim()}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { delay: delay + stagger, duration: 0.7, ease: [0.25, 1, 0.5, 1] }
      }
      drag={draggable && !reduceMotion ? true : false}
      dragControls={draggable ? controls : undefined}
      dragListener={false}
      dragConstraints={draggable ? dragConstraints : undefined}
      dragElastic={0.14}
      dragMomentum={false}
      dragSnapToOrigin
      onPointerDown={draggable ? armDrag : undefined}
      style={{
        '--float-i': index,
        x: draggable ? x : undefined,
        y: draggable ? y : undefined,
        rotateX: draggable && !reduceMotion ? rotateX : undefined,
        rotateY: draggable && !reduceMotion ? rotateY : undefined,
        transformPerspective: draggable ? 800 : undefined,
        ...style,
      }}
      whileDrag={draggable ? { scale: 1.02, zIndex: 8 } : undefined}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}
