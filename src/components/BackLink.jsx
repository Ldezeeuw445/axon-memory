import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Back to wherever the person came from; to the start when they opened this page directly.
export default function BackLink({ fallback = '/', label = 'Back' }) {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 && document.referrer.startsWith(window.location.origin) ? navigate(-1) : navigate(fallback));
  return (
    <button type="button" onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-secondary)', background: 'none', border: 'none', padding: '6px 0', marginBottom: 14, cursor: 'pointer' }}>
      <ArrowLeft size={15} /> {label}
    </button>
  );
}
