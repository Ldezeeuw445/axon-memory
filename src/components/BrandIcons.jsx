// Real, recognizable brand marks used across Data Sources, AI Adapters, and
// Onboarding — replacing generic lucide icons/placeholder squares so
// connection cards look like a professional integrations directory instead
// of a developer's API docs page.
import React from 'react';

export const IconGoogle = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11C3.24 21.3 7.28 24 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.26a12 12 0 0 0 0 10.8l4.01-3.11z" />
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.6l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

export const IconGitHub = ({ size = 22, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.86 10.9.57.1.79-.25.79-.55 0-.27-.01-1.17-.02-2.13-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.7 1.25 3.36.95.1-.75.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.24 2.77.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.26 5.69.42.36.78 1.07.78 2.15 0 1.56-.01 2.81-.01 3.19 0 .31.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
  </svg>
);

export const IconNotion = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <rect width="24" height="24" rx="5" fill="#ffffff" />
    <rect x="5" y="5" width="14" height="14" rx="1.5" fill="none" stroke="#000000" strokeWidth="1.3" />
    <path d="M8 8v8M8 8l8 8M16 8v8" fill="none" stroke="#000000" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconSlack = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path fill="#36C5F0" d="M9.9 15.4a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0zm0-7.8a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0z" />
    <path fill="#2EB67D" d="M8.6 9.4H2.2a1.8 1.8 0 1 0 0 3.6h6.4a1.8 1.8 0 1 0 0-3.6z" />
    <path fill="#ECB22E" d="M15.4 9.9a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm-7.8 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z" />
    <path fill="#E01E5A" d="M14.6 8.6v6.4a1.8 1.8 0 1 0 3.6 0V8.6a1.8 1.8 0 1 0-3.6 0z" />
  </svg>
);

export const IconClaude = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <rect width="24" height="24" rx="6" fill="#D97757" />
    <path fill="#1A1A19" d="M7.1 15.6 10.2 8h1.7l3.1 7.6h-1.8l-.6-1.6h-3.2l-.6 1.6H7.1zm3.1-3h2.1l-1-2.9-1.1 2.9z" />
  </svg>
);

export const IconOpenAI = ({ size = 22, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M22.3 10.2a5.9 5.9 0 0 0-.5-4.8 5.9 5.9 0 0 0-6.4-2.8 5.9 5.9 0 0 0-9.9 2.1 5.9 5.9 0 0 0-4 2.9 5.9 5.9 0 0 0 .7 6.9 5.9 5.9 0 0 0 .5 4.8 5.9 5.9 0 0 0 6.4 2.8 5.9 5.9 0 0 0 4.4 2 5.9 5.9 0 0 0 5.6-4.1 5.9 5.9 0 0 0 4-2.9 5.9 5.9 0 0 0-.8-6.9zm-8.7 9.6a4.4 4.4 0 0 1-2.8-1l.1-.1 4.6-2.7c.24-.13.38-.38.38-.65v-6.6l1.9 1.1c.02.01.04.04.04.07v5.4a4.4 4.4 0 0 1-4.2 4.4zM4.9 16.5a4.35 4.35 0 0 1-.5-2.9l.1.1 4.6 2.7c.24.14.53.14.77 0l5.6-3.2v2.2c0 .03-.01.06-.04.07l-4.7 2.7a4.4 4.4 0 0 1-6-1.7zM3.6 8.6a4.4 4.4 0 0 1 2.3-1.9v5.5c0 .27.14.52.38.65l5.6 3.2-1.9 1.1a.1.1 0 0 1-.09 0l-4.7-2.7a4.4 4.4 0 0 1-1.6-6zm16 3.7-5.6-3.3 1.9-1.1a.1.1 0 0 1 .09 0l4.7 2.7a4.4 4.4 0 0 1-.68 7.9v-5.5c0-.27-.14-.51-.38-.64zm1.9-2.8-.1-.1-4.6-2.7a.8.8 0 0 0-.77 0l-5.6 3.2V7.7c0-.03.01-.06.04-.07l4.7-2.7a4.4 4.4 0 0 1 6.4 4.4zM9.7 13l-1.9-1.1c-.02-.01-.04-.04-.04-.07V6.4a4.4 4.4 0 0 1 7.2-3.4l-.1.1-4.6 2.7a.75.75 0 0 0-.38.64L9.7 13zm1.03-2.2 2.5-1.45 2.5 1.44v2.9l-2.5 1.44-2.5-1.44v-2.9z" />
  </svg>
);

export const IconGemini = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <defs>
      <linearGradient id="gemini-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4B90FF" />
        <stop offset="50%" stopColor="#9168F5" />
        <stop offset="100%" stopColor="#FF5C6C" />
      </linearGradient>
    </defs>
    <path fill="url(#gemini-grad)" d="M12 2c0 5.5 4.5 10 10 10-5.5 0-10 4.5-10 10 0-5.5-4.5-10-10-10 5.5 0 10-4.5 10-10z" />
  </svg>
);

export const IconCursor = ({ size = 22, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2 21 7.5v9L12 22 3 16.5v-9L12 2z" fill={color} opacity="0.08" stroke={color} strokeWidth="1.2" />
    <path d="M12 2v20M3 7l9 5 9-5M3 16.5l9-5 9 5" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

export const IconPerplexity = ({ size = 22, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" opacity="0.5" />
    <path d="M12 4v16M4 8l16 8M20 8 4 16" />
  </svg>
);

export const IconHttp = ({ size = 22, color = 'var(--color-neon-cyan)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
    <path d="M8 6 3 12l5 6M16 6l5 6-5 6M13 4l-2 16" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PROVIDER_ICONS = {
  gmail: IconGoogle,
  google: IconGoogle,
  github: IconGitHub,
  notion: IconNotion,
  slack: IconSlack,
};

export const CLIENT_ICONS = {
  claude: IconClaude,
  chatgpt: IconOpenAI,
  gemini: IconGemini,
  cursor: IconCursor,
  perplexity: IconPerplexity,
  http: IconHttp,
};
