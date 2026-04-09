// ─────────────────────────────────────────────────────────────────────────────
// create-checkout.js — Creates a Stripe Checkout session and returns the URL.
//
// POST /api/create-checkout
// Body: { priceId: string, email?: string }
// Returns: { url: string }
//
// Required env vars:
//   STRIPE_SECRET_KEY — Stripe secret key (sk_live_... or sk_test_...)
// ─────────────────────────────────────────────────────────────────────────────

const Stripe = require('stripe');

// Valid price IDs — whitelist to prevent arbitrary price injection
const ALLOWED_PRICE_IDS = new Set([
  'price_1TK8ryC0lSwQdgAs9Uy8rDxA', // Sharp founding ($10/mo)
  'price_1TK8sqC0lSwQdgAsVTujt6f6', // Sharp regular ($29/mo)
  'price_1TK8tDC0lSwQdgAsmk7FpoiO', // Annual ($199/yr)
]);

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('[Capy] STRIPE_SECRET_KEY is not set');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  try {
    const { priceId, email } = req.body || {};

    // Validate priceId against the whitelist
    if (!priceId || !ALLOWED_PRICE_IDS.has(priceId)) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    const stripe = Stripe(stripeKey);

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://getcapy.co/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://getcapy.co/odds.html',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      // Passed through to checkout.session.completed webhook so the handler
      // can determine tier without an extra line_items expand call.
      metadata: { price_id: priceId },
    };

    // Pre-fill email if provided — reduces friction
    if (email && typeof email === 'string' && email.includes('@')) {
      sessionParams.customer_email = email.trim().toLowerCase();
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Capy] Checkout session created:', session.id, '| price:', priceId);
    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('[Capy] Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
