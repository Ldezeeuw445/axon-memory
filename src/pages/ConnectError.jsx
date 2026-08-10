import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const REASONS = {
  invalid_request: 'This connection link is missing required information.',
  unknown_client: "We don't recognize the app trying to connect. It may need to register again.",
  redirect_uri_mismatch: 'This connection link points somewhere unexpected, so we blocked it for your safety.',
};

export default function ConnectError() {
  const [params] = useSearchParams();
  const reason = params.get('reason') || 'invalid_request';

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: 440, padding: 36, textAlign: 'center' }}>
        <AlertTriangle size={32} color="#ff6b6b" style={{ marginBottom: 12 }} />
        <h2 style={{ marginBottom: 8 }}>Couldn't connect that app</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 20 }}>
          {REASONS[reason] || REASONS.invalid_request}
        </p>
        <Link to="/adapters" className="btn-primary" style={{ display: 'inline-block' }}>Back to AI Adapters</Link>
      </div>
    </div>
  );
}
