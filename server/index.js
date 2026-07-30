import express from 'express';
import cors from 'cors';
import stripeRouter from './routes/stripe.js';
import adaptersRouter from './routes/adapters.js';

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || '3001', 10);

app.use(cors({ origin: '*', credentials: true }));

// Stripe webhook needs raw body — must come before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/stripe', stripeRouter);
app.use('/api/adapters', adaptersRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧠 AXON API server running on port ${PORT}`);
});
