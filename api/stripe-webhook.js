// ─────────────────────────────────────────────────────────────────────────────
// stripe-webhook.js — Handles Stripe webhook events.
//
// POST /api/stripe-webhook
//
// Events handled:
//   checkout.session.completed — activates Sharp access for the subscriber
//
// Required env vars:
//   STRIPE_SECRET_KEY       — Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET   — Signing secret from Stripe webhook dashboard (whsec_...)
//   SUPABASE_URL            — Supabase project URL
//   SUPABASE_SERVICE_KEY    — Supabase service role key (bypasses RLS for upserts)
//
// Supabase table expected:
//   subscribers (
//     id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     email                text UNIQUE NOT NULL,
//     tier                 text NOT NULL DEFAULT 'sharp',  -- 'sharp' | 'annual'
//     is_active            boolean NOT NULL DEFAULT true,
//     stripe_customer_id   text,
//     stripe_subscription_id text,
//     price_id             text,
//     subscribed_at        timestamptz DEFAULT now(),
//     updated_at           timestamptz DEFAULT now()
//   )
//
// IMPORTANT: Vercel's body parser is disabled so we can read the raw bytes
// required for Stripe signature verification. Do not remove the config export.
// ─────────────────────────────────────────────────────────────────────────────

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Disable Vercel's automatic body parsing — Stripe signature verification
// requires the exact raw bytes of the request body.
export const config = {
  api: {
    bodyParser: false,
  },
};

// Map Stripe price IDs to internal tier names.
const PRICE_TO_TIER = {
  'price_1TK8ryC0lSwQdgAs9Uy8rDxA': 'sharp',   // founding $10/mo
  'price_1TK8sqC0lSwQdgAsVTujt6f6': 'sharp',   // regular $29/mo
  'price_1TK8tDC0lSwQdgAsmk7FpoiO': 'annual',  // annual $199/yr
};

// Read the raw request body as a Buffer for signature verification.
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl   = process.env.SUPABASE_URL;
  const supabaseKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || !webhookSecret || !supabaseUrl || !supabaseKey) {
    console.error('[Capy] stripe-webhook: missing required environment variables');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  // ── 1. Verify Stripe signature ────────────────────────────────────────────
  let event;
  try {
    const rawBody  = await getRawBody(req);
    const sig      = req.headers['stripe-signature'];
    const stripe   = Stripe(stripeKey);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // Invalid signature — reject immediately. Could be a spoofed request.
    console.error('[Capy] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log('[Capy] Webhook received:', event.type, '| id:', event.id);

  // ── 2. Route events ───────────────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    try {
      await handleCheckoutCompleted(event.data.object, supabaseUrl, supabaseKey);
    } catch (err) {
      // Log but still return 200 — Stripe retries on non-2xx, which could
      // cause duplicate processing if the error is downstream (e.g. Supabase).
      console.error('[Capy] handleCheckoutCompleted error:', err.message);
    }
  }

  // Always acknowledge receipt — Stripe will retry if it doesn't get a 2xx.
  return res.status(200).json({ received: true });
};

// ── Handler: checkout.session.completed ──────────────────────────────────────
async function handleCheckoutCompleted(session, supabaseUrl, supabaseKey) {
  // Extract email — customer_details.email is populated after checkout completes;
  // fall back to customer_email which is set if we pre-filled it at session creation.
  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    console.error('[Capy] checkout.session.completed: no email found in session', session.id);
    return;
  }

  // Determine tier from the price_id we embedded in session metadata.
  const priceId = session.metadata?.price_id;
  const tier    = PRICE_TO_TIER[priceId] || 'sharp'; // default to sharp if unrecognised

  const stripeCustomerId     = session.customer     || null;
  const stripeSubscriptionId = session.subscription || null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Upsert: create subscriber if new, update if email already exists.
  // ON CONFLICT (email) → update all fields so a re-subscriber is reactivated.
  const { error } = await supabase
    .from('subscribers')
    .upsert(
      {
        email:                   email.trim().toLowerCase(),
        tier,
        is_active:               true,
        stripe_customer_id:      stripeCustomerId,
        stripe_subscription_id:  stripeSubscriptionId,
        price_id:                priceId || null,
        subscribed_at:           new Date().toISOString(),
        updated_at:              new Date().toISOString(),
      },
      { onConflict: 'email' }
    );

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log(
    `[Capy] Subscriber activated — email: ${email} | tier: ${tier}` +
    ` | customer: ${stripeCustomerId} | subscription: ${stripeSubscriptionId}`
  );
}
