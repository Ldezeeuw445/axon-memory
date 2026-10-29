import React from 'react';
import { motion, useDragControls } from 'framer-motion';

/**
 * One floating glass card on the galaxy — no surrounding panel.
 * Depth via inset highlight + drop shadow. Optional subtle drag via a handle
 * so vertical scroll inside a facet is never stolen.
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

  return (
    <MotionTag
      className={`ax-float-card ${className}`.trim()}
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
      dragElastic={0.1}
      dragMomentum={false}
      whileDrag={draggable ? { scale: 1.015, zIndex: 5 } : undefined}
      style={{
        '--float-i': index,
        ...style,
      }}
      {...rest}
    >
      {draggable && (
        <div
          role="presentation"
          aria-hidden="true"
          onPointerDown={(e) => controls.start(e)}
          className="ax-float-handle"
        >
          <span />
        </div>
      )}
      {children}
    </MotionTag>
  );
}
