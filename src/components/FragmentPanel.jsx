import React from 'react';
import { motion } from 'framer-motion';

// FragmentPanel represents the new "Glass & Titanium" UI paradigm.
// It uses clip-path to look like an imperfect, physical shard.
export default function FragmentPanel({ children, delay = 0, style, instant = false }) {
  return (
    <motion.div
      // Opened directly (a link, a refresh) the panel is the first thing seen: no entrance to wait out.
      initial={instant ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        delay, 
        duration: 1.2, 
        ease: [0.25, 1, 0.5, 1] // Smooth bezier curve
      }}
      className="glass-surface"
      style={{
        position: 'relative',
        padding: '32px',
        color: 'var(--color-text-primary)',
        // A slight imperfection in the shape (asymmetrical corners)
        clipPath: 'polygon(0 16px, calc(100% - 16px) 0, 100% calc(100% - 16px), 16px 100%)',
        ...style
      }}
    >
      {/* Subtle top edge highlight (Titanium seam) */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)'
      }} />
      
      {children}
    </motion.div>
  );
}
