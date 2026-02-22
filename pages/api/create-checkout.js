import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

  for (const item of items) {
    if (!item.variantId || !item.quantity || !item.name || !item.price) {
      return res.status(400).json({ error: 'Invalid cart item structure' });
    }
    if (item.quantity < 1 || item.quantity > 20) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
  }

  try {
    const lineItems = items.map((item) => ({
      price_data: {
        currency: (item.currency || 'EUR').toLowerCase(),
        product_data: {
          name: item.name,
          description: item.variantLabel || undefined,
          images: item.thumbnail ? [item.thumbnail] : [],
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const cartMetadata = {
      cart: JSON.stringify(
        items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
      ),
    };

    const storeUrl = process.env.STORE_URL || 'https://overlaymaps.com';

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: 'payment',
      shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
      phone_number_collection: { enabled: true },
      metadata: cartMetadata,
      success_url: `${storeUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${storeUrl}/?canceled=1`,
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
