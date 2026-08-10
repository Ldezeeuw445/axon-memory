import { Router } from 'express';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

// Create Stripe checkout session for $5/month Pro subscription
router.post('/create-checkout-session', async (req, res) => {
  try {
    const stripe = getStripe();
    const { email, userId } = req.body;
    const origin = req.headers.origin || 'http://localhost:5000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      client_reference_id: userId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'AXON Pro',
            description: 'Universal AI Memory Layer — unlimited adapters, memory nodes & data sources',
            images: [],
          },
          unit_amount: 500, // $5.00
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: `${origin}/dashboard?upgraded=true`,
      cancel_url: `${origin}/subscription?cancelled=true`,
      metadata: { userId: userId || '' },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook — update subscription status in your DB here
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const stripe = getStripe();
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook parse error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('⚠️  Supabase admin not configured — skipping subscription persistence for event:', event.type);
    return res.json({ received: true, persisted: false });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        console.log('✅ Checkout completed for:', session.customer_email, 'userId:', userId);

        if (!userId) {
          console.warn('⚠️  checkout.session.completed had no client_reference_id — cannot link to a user');
          break;
        }

        // Pull the subscription for period-end + plan confirmation when available
        let currentPeriodEnd = null;
        if (session.subscription) {
          try {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            currentPeriodEnd = sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null;
          } catch (fetchErr) {
            console.error('Could not retrieve subscription for period end:', fetchErr.message);
          }
        }

        const { error } = await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription || null,
            plan: 'pro',
            status: 'active',
            current_period_end: currentPeriodEnd,
          },
          { onConflict: 'user_id' }
        );

        if (error) console.error('Supabase upsert error (checkout.session.completed):', error.message);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        console.log(`📋 Subscription ${event.type}:`, sub.id, 'status:', sub.status);

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: sub.status,
            plan: ['active', 'trialing'].includes(sub.status) ? 'pro' : 'free',
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('stripe_subscription_id', sub.id);

        if (error) console.error('Supabase update error (subscription.updated):', error.message);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        console.log(`📋 Subscription ${event.type}:`, sub.id, 'status:', sub.status);

        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled', plan: 'free' })
          .eq('stripe_subscription_id', sub.id);

        if (error) console.error('Supabase update error (subscription.deleted):', error.message);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    // Still ack the webhook — Stripe will retry on non-2xx, and we've already
    // logged the failure; a persistent DB outage shouldn't cause infinite retries.
  }

  res.json({ received: true });
});

export default router;
