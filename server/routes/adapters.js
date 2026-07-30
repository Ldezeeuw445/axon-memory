import { Router } from 'express';

const router = Router();

// Provider test configurations
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    testUrl: 'https://api.openai.com/v1/models',
    method: 'GET',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    name: 'Anthropic',
    testUrl: 'https://api.anthropic.com/v1/models',
    method: 'GET',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
  },
  gemini: {
    name: 'Google Gemini',
    testUrl: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    method: 'GET',
    headers: () => ({}),
  },
  perplexity: {
    name: 'Perplexity',
    testUrl: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    headers: (key) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  },
  cursor: {
    name: 'Cursor',
    // Cursor uses OpenAI-compatible API
    testUrl: 'https://api.openai.com/v1/models',
    method: 'GET',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

// POST /api/adapters/test — validates an API key for a given provider
router.post('/test', async (req, res) => {
  const { provider, apiKey } = req.body;

  if (!provider || !apiKey?.trim()) {
    return res.status(400).json({ valid: false, error: 'provider and apiKey are required' });
  }

  const config = PROVIDERS[provider.toLowerCase()];
  if (!config) {
    return res.status(400).json({ valid: false, error: `Unknown provider: ${provider}` });
  }

  try {
    const url = typeof config.testUrl === 'function'
      ? config.testUrl(apiKey)
      : config.testUrl;

    const opts = {
      method: config.method,
      headers: { 'Content-Type': 'application/json', ...config.headers(apiKey) },
      signal: AbortSignal.timeout(8000),
    };
    if (config.body) opts.body = config.body;

    const response = await fetch(url, opts);

    if (response.status === 200 || response.status === 201) {
      res.json({ valid: true, provider, message: 'Connection successful' });
    } else if (response.status === 401 || response.status === 403) {
      res.json({ valid: false, provider, message: 'Invalid API key — check your key and try again' });
    } else {
      const text = await response.text().catch(() => '');
      res.json({ valid: false, provider, message: `API returned ${response.status}${text ? ': ' + text.slice(0, 120) : ''}` });
    }
  } catch (err) {
    if (err.name === 'TimeoutError') {
      res.json({ valid: false, provider, message: 'Connection timed out — check your internet connection' });
    } else {
      res.json({ valid: false, provider, message: err.message });
    }
  }
});

export default router;
