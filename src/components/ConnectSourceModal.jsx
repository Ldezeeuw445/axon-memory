import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock icons for the apps
const AppIcon = ({ type, color, label, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      cursor: 'pointer',
      color: 'white'
    }}
  >
    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', boxShadow: `0 0 20px ${color}40` }}>
      {type}
    </div>
    <span style={{ fontSize: '13px', letterSpacing: '1px', opacity: 0.8 }}>{label}</span>
  </motion.button>
);

export default function ConnectSourceModal({ isOpen, onClose, onConnect }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            background: 'radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)',
            backdropFilter: 'blur(10px)',
            pointerEvents: 'auto'
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-surface"
            style={{
              padding: '40px',
              width: '600px',
              borderRadius: '24px',
              clipPath: 'polygon(0 4%, 96% 0, 100% 96%, 4% 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(5, 5, 10, 0.4)'
            }}
          >
            <h2 className="title-text" style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
              Feed AXON
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', fontSize: '14px' }}>
              Connect a source to extract and map its neural context.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <AppIcon type="S" color="#E01E5A" label="Connect Slack" onClick={() => onConnect('slack')} />
              <AppIcon type="N" color="#888888" label="Connect Notion" onClick={() => onConnect('notion')} />
              <AppIcon type="D" color="#0066FF" label="Connect Drive" onClick={() => onConnect('drive')} />
              <AppIcon type="T" color="#00ffaa" label="Paste Text" onClick={() => onConnect('text')} />
            </div>

            <div style={{ marginTop: '32px', textAlign: 'center' }}>
              <button 
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  letterSpacing: '1px'
                }}
              >
                CANCEL CONNECTION
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
