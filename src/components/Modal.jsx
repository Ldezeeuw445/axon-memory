import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, width = '480px' }) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    // Prevent body scroll when modal open
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-sheet" style={{ '--modal-max-width': width }}>
        {/* Drag handle (mobile) */}
        <div className="modal-handle" />

        {/* Header */}
        <div className="modal-header">
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {children}
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0,0,0,0.72);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .modal-sheet {
          width: 100%;
          max-width: var(--modal-max-width, 480px);
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 20px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          animation: modalIn 0.18s cubic-bezier(0.32, 0.72, 0, 1);
          max-height: 90vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .modal-handle { display: none; }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 20px 0;
          margin-bottom: 16px;
        }

        .modal-body {
          padding: 0 20px 20px;
        }

        .modal-close {
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--color-border);
          cursor: pointer;
          color: var(--color-text-secondary);
          padding: 6px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
          min-width: 36px;
          min-height: 36px;
          flex-shrink: 0;
        }
        .modal-close:hover { background: rgba(255,255,255,0.1); }

        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(-6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* ── Mobile: slide up as bottom sheet ── */
        @media (max-width: 768px) {
          .modal-overlay {
            align-items: flex-end;
            padding: 0;
          }

          .modal-sheet {
            border-radius: 20px 20px 0 0;
            border-bottom: none;
            max-width: 100%;
            max-height: 92vh;
            padding-bottom: env(safe-area-inset-bottom, 0px);
            animation: sheetUp 0.28s cubic-bezier(0.32, 0.72, 0, 1);
          }

          .modal-handle {
            display: block;
            width: 36px;
            height: 4px;
            background: rgba(255,255,255,0.18);
            border-radius: 2px;
            margin: 10px auto 4px;
          }

          @keyframes sheetUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        }
      `}</style>
    </div>
  );
}
