import { Router } from 'express';

const router = Router();

const SOURCE_CONFIGS = {
  notion: {
    name: 'Notion',
    verify: async (token) => {
      const res = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return {
        accountName: data.name || data.person?.email || 'Notion workspace',
        accountId: data.id,
        avatarUrl: data.avatar_url,
      };
    },
  },
  github: {
    name: 'GitHub',
    verify: async (token) => {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AXON-App',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — check your token permissions`);
      const data = await res.json();
      return {
        accountName: data.name || data.login,
        accountId: String(data.id),
        avatarUrl: data.avatar_url,
        extra: `${data.public_repos} repos`,
      };
    },
  },
  linear: {
    name: 'Linear',
    verify: async (token) => {
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: '{ viewer { id name email organization { name } } }' }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data, errors } = await res.json();
      if (errors?.length) throw new Error(errors[0].message);
      return {
        accountName: data.viewer.name || data.viewer.email,
        accountId: data.viewer.id,
        extra: data.viewer.organization?.name,
      };
    },
  },
  slack: {
    name: 'Slack',
    verify: async (token) => {
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Slack auth failed');
      return {
        accountName: data.user,
        accountId: data.user_id,
        extra: data.team,
      };
    },
  },
  gmail: {
    name: 'Gmail',
    verify: async (token) => {
      // Gmail uses OAuth2 — token must be a valid access token
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error('Invalid token — Gmail requires a Google OAuth access token');
      const data = await res.json();
      return {
        accountName: data.name || data.email,
        accountId: data.sub,
        extra: data.email,
      };
    },
  },
};

// POST /api/sources/test — validate a data source token
router.post('/test', async (req, res) => {
  const { sourceId, token } = req.body;
  if (!sourceId || !token?.trim()) {
    return res.status(400).json({ valid: false, error: 'sourceId and token are required' });
  }

  const config = SOURCE_CONFIGS[sourceId];
  if (!config) {
    // Unknown source — just mark as connected without verification
    return res.json({ valid: true, accountName: 'Connected', accountId: sourceId });
  }

  try {
    const result = await config.verify(token.trim());
    res.json({ valid: true, ...result });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      res.json({ valid: false, error: 'Connection timed out — check your internet connection' });
    } else {
      res.json({ valid: false, error: err.message });
    }
  }
});

export default router;
