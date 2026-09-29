import React from 'react';
import { Brain } from 'lucide-react';

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

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: '32px', flexDirection: 'column', gap: '24px',
      }}>
        <div style={{ color: 'var(--color-neon-cyan)' }}>
          <Brain size={48} />
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 700 }}>Something went wrong</h2>
        <p style={{ color: 'var(--color-text-secondary)', maxWidth: '400px', textAlign: 'center' }}>
          AXON encountered an unexpected error. Your memory data is safe.
        </p>
        <code style={{
          background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '8px',
          fontSize: '13px', color: '#ff6b6b', maxWidth: '600px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {this.state.error?.message || 'Unknown error'}
        </code>
        <button
          className="btn-primary"
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
        >
          Reload App
        </button>
      </div>
    );
  }
}
