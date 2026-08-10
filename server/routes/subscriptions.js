import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

// GET /api/subscriptions/status?userId=xxx
// Returns plan/status for a user via the service-role client, so the
// frontend never needs elevated Supabase privileges to check Pro access.
router.get('/status', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId query param is required' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Demo mode / not configured — treat everyone as free plan rather than erroring.
    return res.json({ plan: 'free', status: 'inactive', configured: false });
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Supabase subscription lookup error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    // No row yet — user has never checked out, so they're on the free plan.
    return res.json({ plan: 'free', status: 'inactive', configured: true });
  }

  res.json({ ...data, configured: true });
});

export default router;
