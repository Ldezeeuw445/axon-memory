import React from 'react';
import { ShieldCheck } from 'lucide-react';

const Section = ({ title, children }) => (
  <div style={{ marginBottom: '32px' }}>
    <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--color-text-primary)' }}>{title}</h2>
    <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, fontSize: '15px' }}>{children}</div>
  </div>
);

export default function Privacy() {
  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <ShieldCheck size={32} color="var(--color-neon-cyan)" />
        <div>
          <h1 className="page-title">Privacy Policy</h1>
          <p className="page-subtitle">Last updated: July 2025</p>
        </div>
      </header>

      <div className="glass-card" style={{ maxWidth: '760px', lineHeight: 1.7 }}>
        <Section title="1. Who We Are">
          <p>AXON ("we", "us", "our") is a universal AI memory layer that securely stores and structures your personal context, making every AI tool you use smarter over time. This policy explains how we collect, use, and protect your data.</p>
        </Section>

        <Section title="2. Data We Collect">
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li><strong>Account data:</strong> Email address, full name, and authentication tokens when you create an account.</li>
            <li><strong>Memory data:</strong> Nodes and relationships you create or that are automatically ingested from connected data sources (e.g. Notion, GitHub, Gmail).</li>
            <li><strong>AI adapter credentials:</strong> API keys you provide for third-party AI services (OpenAI, Anthropic, etc.). These are stored encrypted and are never readable in plain text by our team.</li>
            <li><strong>Usage data:</strong> Aggregate statistics about memory operations, adapter usage, and app interactions — never sold to third parties.</li>
            <li><strong>Billing data:</strong> Subscription status. Payment details are handled entirely by Stripe and never stored on our servers.</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Data">
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>To provide the AXON memory layer service.</li>
            <li>To inject relevant memory context into your connected AI adapters.</li>
            <li>To send you essential service communications (account confirmation, billing receipts).</li>
            <li>To improve AXON's quality via anonymised, aggregate usage patterns.</li>
          </ul>
        </Section>

        <Section title="4. Data Storage & Security">
          <p>Your data is stored in Supabase's EU-region PostgreSQL database, protected by Row Level Security (RLS) — meaning your data is cryptographically isolated from all other users at the database level. API keys are encrypted before storage and decrypted only inside our secure server environment to make AI calls on your behalf.</p>
        </Section>

        <Section title="5. Third-Party Services">
          <p>We use the following third-party services. Each has its own privacy policy:</p>
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            <li><strong>Supabase</strong> — database and authentication (<a href="https://supabase.com/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--color-neon-cyan)' }}>supabase.com/privacy</a>)</li>
            <li><strong>Stripe</strong> — payment processing (<a href="https://stripe.com/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--color-neon-cyan)' }}>stripe.com/privacy</a>)</li>
            <li><strong>AI providers</strong> (OpenAI, Anthropic, Google) — only your memory context queries are sent; no personal account data is shared.</li>
          </ul>
        </Section>

        <Section title="6. Your Rights">
          <p>You have the right to: access your data, correct inaccuracies, export your memory graph, and permanently delete your account and all associated data. Account deletion is available inside the app under Settings → Delete Account. Deletion removes all memory nodes, adapter connections, and your Supabase Auth record within 30 days.</p>
        </Section>

        <Section title="7. Cookies">
          <p>AXON uses only essential session cookies required for authentication. No tracking or advertising cookies are used.</p>
        </Section>

        <Section title="8. Children's Privacy">
          <p>AXON is not directed at children under 13. We do not knowingly collect data from children under 13.</p>
        </Section>

        <Section title="9. Contact">
          <p>Questions about this policy? Email us at <a href="mailto:privacy@axon.app" style={{ color: 'var(--color-neon-cyan)' }}>privacy@axon.app</a>.</p>
        </Section>
      </div>
    </div>
  );
}
