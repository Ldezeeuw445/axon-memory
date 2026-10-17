import React from 'react';
import '../styles/facets.css';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[AXON ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Canon: an error is an interrupted formation, said in one plain sentence.
    // No red, no warning glyph; the technical message stays selectable but quiet.
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        minHeight: '100vh', padding: '32px', flexDirection: 'column', gap: '18px', background: '#05070A',
      }}>
        <div aria-hidden style={{ width: 54, height: 54, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #d9dde2, #5d636a 55%, #15181c)', opacity: 0.85, boxShadow: '0 0 40px rgba(255,183,51,0.12)' }} />
        <h2 style={{ fontSize: 22, fontWeight: 500, color: '#E8EAEC', letterSpacing: '-0.01em' }}>This view was interrupted before it formed.</h2>
        <p style={{ color: '#8E9499', maxWidth: 420, fontSize: 14, lineHeight: 1.6 }}>Nothing you keep in AXON was touched. Opening it again usually settles it.</p>
        <code style={{ color: '#5d636a', fontSize: 11, maxWidth: 520, whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text' }}>
          {this.state.error?.message || ''}
        </code>
        <button
          className="ax-btn"
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
        >
          Open again
        </button>
      </div>
    );
  }
}
