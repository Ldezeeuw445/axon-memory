import { Router } from 'express';
import Stripe from 'stripe';

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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('✅ Checkout completed for:', session.customer_email, 'userId:', session.client_reference_id);
      // TODO (Supabase): UPDATE subscriptions SET status='active', stripe_customer_id=session.customer WHERE user_id=session.client_reference_id
      break;
    }
    case 'customer.subscription.deleted':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      console.log(`📋 Subscription ${event.type}:`, sub.id, 'status:', sub.status);
      // TODO (Supabase): UPDATE subscriptions SET status=sub.status WHERE stripe_subscription_id=sub.id
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

export default router;
