/**
 * POST /api/create-checkout
 * Creates a Stripe Checkout session for a multi-item cart.
 *
 * Body: { items: [{ variantId, quantity, name, price, currency, thumbnail }] }
 *
 * ENV VARS NEEDED:
 *   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
 *   STORE_URL               — https://yourusername.github.io (no trailing slash)
 *   PRINTFUL_API_KEY        — to validate variant IDs server-side
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Supported shipping countries — update to match your Printful shipping zones
const SHIPPING_COUNTRIES = [
  'NL', 'DE', 'BE', 'FR', 'ES', 'IT', 'PT', 'AT', 'CH', 'PL',
  'SE', 'DK', 'NO', 'FI', 'GB', 'IE', 'US', 'CA', 'AU', 'NZ',
  'JP', 'KR', 'SG', 'MX', 'BR', 'CO', 'AR',
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  // Validate basic structure
  for (const item of items) {
    if (!item.variantId || !item.quantity || !item.name || !item.price) {
      return res.status(400).json({ error: 'Invalid cart item structure' });
    }
    if (item.quantity < 1 || item.quantity > 20) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
  }

  try {
    // Build Stripe line items
    const lineItems = items.map(item => ({
      price_data: {
        currency: (item.currency || 'EUR').toLowerCase(),
        product_data: {
          name: item.name,
          description: item.variantLabel || undefined,
          images: item.thumbnail ? [item.thumbnail] : [],
        },
        unit_amount: Math.round(item.price * 100), // convert to cents
      },
      quantity: item.quantity,
    }));

    // Store cart metadata for the webhook to use when creating Printful order
    const cartMetadata = {
      cart: JSON.stringify(
        items.map(i => ({
          variantId: i.variantId,
          quantity: i.quantity,
        }))
      ),
    };

    const storeUrl = process.env.STORE_URL || 'https://overlaymaps.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',

      // Collect shipping address
      shipping_address_collection: {
        allowed_countries: SHIPPING_COUNTRIES,
      },

      // Collect phone for Printful (sometimes required for customs)
      phone_number_collection: { enabled: true },

      // Pass cart data to the webhook
      metadata: cartMetadata,

      // Redirect URLs
      success_url: `${storeUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${storeUrl}/index.html?canceled=1`,

      // Allow promo codes if you want them in Stripe
      // allow_promotion_codes: true,
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
