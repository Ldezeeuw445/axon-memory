import React from 'react';
import { FileText } from 'lucide-react';

const Section = ({ title, children }) => (
  <div style={{ marginBottom: '32px' }}>
    <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--color-text-primary)' }}>{title}</h2>
    <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, fontSize: '15px' }}>{children}</div>
  </div>
);

export default function Terms() {
  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <FileText size={32} color="var(--color-neon-cyan)" />
        <div>
          <h1 className="page-title">Terms of Service</h1>
          <p className="page-subtitle">Last updated: July 2025</p>
        </div>
      </header>

      <div className="glass-card" style={{ maxWidth: '760px', lineHeight: 1.7 }}>
        <Section title="1. Acceptance of Terms">
          <p>By accessing or using AXON ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
        </Section>

        <Section title="2. Description of Service">
          <p>AXON is a universal AI memory layer that stores structured personal context and injects it into connected AI tools. The Service includes a web application, API, and (optionally) mobile applications for iOS and Android.</p>
        </Section>

        <Section title="3. Account Registration">
          <p>You must provide a valid email address and create a secure password. You are responsible for all activity under your account. Notify us immediately of any unauthorised access at security@axon.app.</p>
        </Section>

        <Section title="4. Subscription & Billing">
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>The AXON Pro plan is billed at <strong>$5 USD per month</strong>.</li>
            <li>Subscriptions auto-renew unless cancelled before the renewal date.</li>
            <li>On web, billing is handled by Stripe. On iOS/Android, billing is handled by Apple/Google in-app purchase — subject to their respective refund policies.</li>
            <li>Refunds for web subscriptions may be requested within 7 days of a charge by contacting support@axon.app.</li>
          </ul>
        </Section>

        <Section title="5. Your Data & API Keys">
          <p>You retain full ownership of all memory data stored in AXON. You grant AXON a limited licence to process that data solely to provide the Service. API keys you provide for third-party AI services remain yours; AXON stores them only to fulfil adapter requests on your behalf and never sells or shares them.</p>
        </Section>

        <Section title="6. Acceptable Use">
          <p>You may not use AXON to: violate any laws, infringe intellectual property rights, transmit malware, attempt to access other users' data, or reverse-engineer the Service. Violations may result in immediate account termination.</p>
        </Section>

        <Section title="7. Service Availability">
          <p>We aim for 99.9% uptime but do not guarantee uninterrupted access. Planned maintenance will be announced via email where possible. We are not liable for third-party AI provider outages.</p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>AXON is provided "as is". To the maximum extent permitted by law, AXON shall not be liable for indirect, incidental, or consequential damages arising from use of the Service. Our total liability shall not exceed the amount you paid in the 12 months preceding the claim.</p>
        </Section>

        <Section title="9. Termination & Account Deletion">
          <p>You may delete your account at any time from within the app (Settings → Delete Account). This permanently removes all your data. We may terminate accounts that violate these Terms with or without notice.</p>
        </Section>

        <Section title="10. Changes to Terms">
          <p>We may update these Terms. Continued use after notification of changes constitutes acceptance. Material changes will be emailed to your registered address.</p>
        </Section>

        <Section title="11. Governing Law">
          <p>These Terms are governed by the laws of the Netherlands. Disputes shall be submitted to the competent courts of Amsterdam.</p>
        </Section>

        <Section title="12. Contact">
          <p>Questions? Email <a href="mailto:legal@axon.app" style={{ color: 'var(--color-neon-cyan)' }}>legal@axon.app</a>.</p>
        </Section>
      </div>
    </div>
  );
}
