import React from 'react';

// ── AI Provider Logos ────────────────────────────────────────────

export const OpenAILogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
    <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 3.99-2.9 6.06 6.06 0 0 0-.74-7.07zM13.26 22.43a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68V11.4l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.23zM3.6 18.31a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.78.78 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.9a4.5 4.5 0 0 1-6.14-1.59zM2.34 7.9A4.48 4.48 0 0 1 4.7 5.93v5.7a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L3.61 14.1A4.5 4.5 0 0 1 2.34 7.9zm16.1 3.86L12.6 8.38V6.05a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66 4.48 4.48 0 0 1-.54 1.97l-4.79-2.75a.77.77 0 0 0-.77 0zm3.31-.84l-2.13-1.23-2.13 1.23v2.45l2.13 1.23 2.13-1.23V10.92z"/>
  </svg>
);

export const AnthropicLogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
    <path d="M17.304 3.541 13.766 13.6h-3.487L6.696 3.541H3L8.891 20.46h6.218L21 3.541h-3.696z"/>
  </svg>
);

export const GeminiLogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <path d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z" fill="url(#geminiGrad)"/>
    <defs>
      <linearGradient id="geminiGrad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4285F4"/>
        <stop offset="50%" stopColor="#9B72CB"/>
        <stop offset="100%" stopColor="#EA4335"/>
      </linearGradient>
    </defs>
  </svg>
);

export const PerplexityLogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
    <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.236L19.764 8 12 11.764 4.236 8 12 4.236zM3.5 9.382l7.5 3.75v7.236L3.5 16.618V9.382zm9.5 3.75l7.5-3.75v7.236L13 20.368v-7.236z"/>
  </svg>
);

export const CursorLogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
    <path d="M13.5 3L3 12l3.75 3.75L3 21h18L13.5 3zm0 4.5L18.75 18H7.5l2.25-2.25-3.75-3.75L13.5 7.5z"/>
  </svg>
);

// ── Data Source Logos ────────────────────────────────────────────

export const NotionLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <rect width="100" height="100" rx="16" fill="white"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M22 18.7c3.2 2.6 4.4 2.4 10.4 2l56.3-3.3c1.2 0 .2-1.2-.4-1.4L79.8 9c-2.2-1.7-5.2-3.6-10.8-3.2L14.3 9.5c-2.2.2-2.6 1.3-1.8 2.2L22 18.7zm4 14.7v59.5c0 3.2 1.6 4.4 5.2 4.2l61.7-3.5c3.6-.2 4-2.4 4-5V29c0-2.6-1-4-3.2-3.8l-64.5 3.8c-2.4.2-3.2 1.4-3.2 4.4zm57.5 1.6c.4 1.8 0 3.6-1.8 3.8l-3 .6v44c-2.6 1.4-5 2.2-7 2.2-3.2 0-4-1-6.4-4L47 57.1v26.4l6.4 1.4s0 3.6-5 3.6L35.3 89c-.4-1-.2-3.4 1.2-3.8L40 84.3V43.5l-4.6-.4c-.4-1.8.6-4.4 3.4-4.6L53.7 38 73 67.5V43.1l-5.4-.6c-.4-2.2.8-3.8 3.2-4l11.6-.8.2-3z" fill="#000"/>
  </svg>
);

export const GitHubLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

export const SlackLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
    <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
    <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
    <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
    <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
    <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
    <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
  </svg>
);

export const GmailLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
  </svg>
);

export const LinearLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="white">
    <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857l36.0115 36.0115c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.2355 5.7645 79.9485 1.22541 61.5228zM.00189135 46.8891c-.01764375.3927.14825635.7703.43991235 1.0619l50.6189 50.6189c.2916.2917.6692.4576 1.0619.4399 2.7069-.1221 5.3681-.4136 7.9668-.861L1.20344 38.8952c-.448 2.6007-.739 5.2619-.861 7.9939zM4.08189 27.0981c-.5523.3823-.6955 1.1316-.3116 1.6839l66.3169 66.3169c.5523.3839 1.3016.2407 1.6839-.3116.8276-1.1927 1.6065-2.4317 2.3287-3.7148L7.81166 24.7693c-1.2831.7223-2.5221 1.5011-3.7298 2.3288zM12.9938 15.8967c-.4788.3394-.5805 1.0016-.2357 1.4745l69.7611 69.7611c.4729.3448 1.1351.2431 1.4745-.2357.9443-1.3331 1.8271-2.7128 2.6427-4.1347L17.128 13.254c-1.4219.8156-2.8017 1.6984-4.1342 2.6427zM25.0073 7.12337c-.3876.2462-.5093.7623-.2693 1.1543l66.9284 66.9284c.392.24.9081.1183 1.1543-.2693.9535-1.5007 1.8433-3.0449 2.6675-4.6242L29.6315 4.45601c-1.5793.8242-3.1235 1.71396-4.6242 2.66736zM40.0074 1.96448c-.3416.1776-.468.6183-.2813.9623L97.0736 59.2732c.344.1867.7847.0603.9623-.2813.7032-1.3501 1.3597-2.7337 1.9678-4.1479L44.1553.00184c-1.4142.60811-2.7978 1.26461-4.1479 1.96264zM57.0893.117132c-.3621.1062-.5874.4791-.5072.8461L98.9419 42.2568c.367.0802.74-.1451.8461-.5072.4576-1.5567.8365-3.1438 1.1327-4.7573L61.8466 1.00197c-1.6135.29625-3.2006.6752-4.7573 1.13268z"/>
  </svg>
);

export const GoogleDriveLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M22.84 17.17 15.68 4.27A4.23 4.23 0 0 0 12 2a4.23 4.23 0 0 0-3.67 2.12L1.16 17.17A4.35 4.35 0 0 0 1 18.24 4.2 4.2 0 0 0 5.2 22.5h13.6a4.2 4.2 0 0 0 4.2-4.26 4.35 4.35 0 0 0-.16-1.07zM12 4.5a1.74 1.74 0 0 1 1.5.88l5 8.62H5.5l5-8.62A1.74 1.74 0 0 1 12 4.5z" fill="#4285F4"/>
    <path d="M5.5 14l-4.34 7.5h10.59L5.5 14z" fill="#34A853"/>
    <path d="M18.5 14l4.34 7.5H12.25L18.5 14z" fill="#FBBC05"/>
    <path d="M12 4.5a1.74 1.74 0 0 1 1.5.88l5 8.62h2.25L13.5 3.38A4.23 4.23 0 0 0 12 2a4.23 4.23 0 0 0-1.5.88L3.25 14h2.25l5-8.62A1.74 1.74 0 0 1 12 4.5z" fill="#EA4335"/>
  </svg>
);

export const ObsidianLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M 8 0 C 5 0 3.5 3 4 6 L 4 7 C 2 7 0 9.5 0 12 C 0 14 1 15.5 2.5 16.5 L 6 23 L 9.5 20 L 13 23 L 16 20.5 L 19 23.5 L 24 12 C 24 5.4 19.5 0 14 0 Z" fill="#7c3aed"/>
    <path d="M 9 5 L 6 12 L 10 10.5 L 9 16 L 15 9 L 11 10 Z" fill="white" opacity="0.7"/>
  </svg>
);

export const AppleNotesLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
    <path d="M18.5 2H5.5C4.1 2 3 3.1 3 4.5v15C3 20.9 4.1 22 5.5 22h13c1.4 0 2.5-1.1 2.5-2.5v-15C21 3.1 19.9 2 18.5 2zM7 7h10v1.5H7V7zm0 3.5h10V12H7v-1.5zm0 3.5h7V15.5H7V14z"/>
  </svg>
);

// ── AI Provider Config (with logos) ─────────────────────────────

export const AI_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'GPT-4o, o1, DALL·E and all OpenAI models',
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'platform.openai.com/api-keys',
    color: '#10a37f',
    bg: 'linear-gradient(135deg, #10a37f, #1a7f64)',
    Logo: OpenAILogo,
    guide: [
      'Go to platform.openai.com/api-keys',
      'Click "Create new secret key"',
      'Copy the key (starts with sk-proj-)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'anthropic',
    name: 'Claude',
    tagline: 'Claude 3.5 Sonnet, Haiku and Opus',
    placeholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'console.anthropic.com/settings/keys',
    color: '#d97706',
    bg: 'linear-gradient(135deg, #d97706, #b45309)',
    Logo: AnthropicLogo,
    guide: [
      'Go to console.anthropic.com → Settings → API Keys',
      'Click "Create Key"',
      'Copy the key (starts with sk-ant-)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Gemini 1.5 Pro, Flash and Nano',
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'aistudio.google.com/app/apikey',
    color: '#4285F4',
    bg: 'linear-gradient(135deg, #4285F4, #1a73e8)',
    Logo: GeminiLogo,
    guide: [
      'Go to Google AI Studio → Get API Key',
      'Select or create a Google Cloud project',
      'Copy the API key (starts with AIzaSy)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    tagline: 'Sonar models with real-time web search',
    placeholder: 'pplx-...',
    docsUrl: 'https://www.perplexity.ai/settings/api',
    docsLabel: 'perplexity.ai/settings/api',
    color: '#20b2aa',
    bg: 'linear-gradient(135deg, #20b2aa, #0e9490)',
    Logo: PerplexityLogo,
    guide: [
      'Go to perplexity.ai → Settings → API',
      'Generate a new API key',
      'Copy the key (starts with pplx-)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    tagline: 'Inject AXON memory into your IDE context',
    placeholder: 'sk-...',
    docsUrl: 'https://cursor.sh',
    docsLabel: 'cursor.sh',
    color: '#6366f1',
    bg: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    Logo: CursorLogo,
    guide: [
      'Open Cursor → Settings → Extensions',
      'Find "AXON Memory" and click Configure',
      'Generate an AXON API key from your dashboard',
      'Paste it below and click Test & Connect',
    ],
  },
];

// ── Data Source Config (with logos) ─────────────────────────────

export const DATA_SOURCES = [
  {
    id: 'notion',
    name: 'Notion',
    tagline: 'Pages, databases and wikis',
    bg: '#1a1a1a',
    Logo: NotionLogo,
    tokenLabel: 'Internal Integration Token',
    tokenPlaceholder: 'secret_...',
    docsUrl: 'https://www.notion.so/my-integrations',
    docsLabel: 'notion.so/my-integrations',
    canConnect: true,
    guide: [
      'Go to notion.so/my-integrations',
      'Click "+ New integration"',
      'Give it a name, select your workspace',
      'Copy the "Internal Integration Token" (starts with secret_)',
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Repos, PRs, issues and commits',
    bg: '#24292e',
    Logo: GitHubLogo,
    tokenLabel: 'Personal Access Token',
    tokenPlaceholder: 'ghp_... or github_pat_...',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'github.com/settings/tokens',
    canConnect: true,
    guide: [
      'Go to github.com → Settings → Developer settings',
      'Personal access tokens → Tokens (classic)',
      'Click "Generate new token (classic)"',
      'Select scopes: repo, read:user — then copy the token',
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    tagline: 'Issues, projects and roadmaps',
    bg: '#1d1b2e',
    Logo: LinearLogo,
    tokenLabel: 'Linear API Key',
    tokenPlaceholder: 'lin_api_...',
    docsUrl: 'https://linear.app/settings/api',
    docsLabel: 'linear.app/settings/api',
    canConnect: true,
    badge: 'New',
    guide: [
      'Go to linear.app → Settings → API',
      'Click "Create key"',
      'Give it a label and copy the key',
      'Paste it below — key starts with lin_api_',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    tagline: 'Messages, channels and threads',
    bg: '#4a154b',
    Logo: SlackLogo,
    tokenLabel: 'Bot User OAuth Token',
    tokenPlaceholder: 'xoxb-...',
    docsUrl: 'https://api.slack.com/apps',
    docsLabel: 'api.slack.com/apps',
    canConnect: true,
    guide: [
      'Go to api.slack.com/apps → Create New App',
      'Add OAuth scope: channels:read, messages.read',
      'Install to workspace → copy "Bot User OAuth Token"',
      'Token starts with xoxb-',
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Emails, threads and contacts',
    bg: '#c5221f',
    Logo: GmailLogo,
    tokenLabel: 'OAuth Access Token',
    tokenPlaceholder: 'ya29...',
    docsUrl: 'https://developers.google.com/gmail/api',
    docsLabel: 'Google Cloud Console',
    canConnect: true,
    guide: [
      'Go to Google Cloud Console → APIs & Services',
      'Enable Gmail API',
      'Create OAuth 2.0 credentials',
      'Use the playground to get an access token',
    ],
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    tagline: 'Docs, Sheets and Slides',
    bg: '#1a73e8',
    Logo: GoogleDriveLogo,
    canConnect: false,
    badge: 'Soon',
  },
  {
    id: 'apple_notes',
    name: 'Apple Notes',
    tagline: 'Notes and checklists',
    bg: '#2c2c2e',
    Logo: AppleNotesLogo,
    canConnect: false,
    badge: 'Soon',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Markdown vault and graph',
    bg: '#2d2b55',
    Logo: ObsidianLogo,
    canConnect: false,
    badge: 'Soon',
  },
];
