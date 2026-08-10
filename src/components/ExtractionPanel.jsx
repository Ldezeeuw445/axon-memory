import React from 'react';
import { motion } from 'framer-motion';

export default function ExtractionPanel({ appType, onCompress, isMobile }) {
  // Simulate AI data extraction based on the connected app type
  const dataMap = {
    slack: {
      title: 'Slack Thread: Architecture',
      content: '"We need to switch from a grid-based database to a spatial vector graph. The current system is too rigid for organic memory."',
      tags: ['#VectorDatabase', '#Architecture', '#Brainstorm']
    },
    notion: {
      title: 'Notion: Project Outline',
      content: 'Phase 1: Build the Core. Phase 2: Implement the Void. Phase 3: Connect the Neural Links.',
      tags: ['#Roadmap', '#Planning']
    },
    drive: {
      title: 'Drive: design_system.pdf',
      content: '[Document Extracted] Color palette: #0044ff, #ffffff. Primary aesthetic: Glassmorphism and dark matter.',
      tags: ['#Design', '#Assets']
    },
    text: {
      title: 'Raw Text Input',
      content: 'This is a manual memory injection into the AXON core system.',
      tags: ['#Manual', '#Log']
    }
  };

  const data = dataMap[appType] || dataMap['text'];

  // Use standard grey/white aesthetic to match Neural Link panel
  const accentColor = 'var(--color-text-secondary)';
  const accentRgba = '255, 255, 255';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 1.0, duration: 0.8, ease: 'easeOut' } }}
      exit={{ opacity: 0, scale: 0, filter: 'brightness(5)', transition: { duration: 1.2, ease: 'easeIn' } }}
      className="glass-surface"
      style={{
        position: 'absolute',
        right: isMobile ? '5%' : '10%',
        left: isMobile ? '5%' : 'auto',
        top: isMobile ? '10%' : '20%',
        width: isMobile ? 'auto' : '400px',
        padding: '32px',
        pointerEvents: 'auto',
        clipPath: 'polygon(0 2%, 96% 0, 100% 98%, 4% 100%)', // matches the shard aesthetic
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.5 }}
      >
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', letterSpacing: '2px', marginBottom: '16px', fontWeight: 'bold' }}>
          DATA EXTRACTED
        </div>
        <h3 className="title-text" style={{ fontSize: '18px', color: 'white', marginBottom: '12px' }}>
          {data.title}
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: '24px' }}>
          {data.content}
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '32px' }}>
          {data.tags.map(tag => (
            <span key={tag} style={{ background: `rgba(${accentRgba}, 0.05)`, border: `1px solid rgba(${accentRgba}, 0.1)`, padding: '4px 10px', borderRadius: '4px', fontSize: '11px', color: accentColor }}>
              {tag}
            </span>
          ))}
        </div>

        <motion.button
          whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          whileTap={{ scale: 0.98 }}
          onClick={onCompress}
          style={{
            width: '100%',
            padding: '12px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
            letterSpacing: '2px',
            borderRadius: '0px'
          }}
        >
          INJECT TO CONSTELLATION
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
