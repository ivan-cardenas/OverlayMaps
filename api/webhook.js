/**
 * POST /api/webhook
 * Receives Stripe webhook events and creates Printful orders on successful payment.
 *
 * IMPORTANT: This endpoint needs the RAW request body to verify Stripe signatures.
 * The export config below disables Vercel's body parser for this route.
 *
 * ENV VARS NEEDED:
 *   STRIPE_SECRET_KEY       — sk_live_...
 *   STRIPE_WEBHOOK_SECRET   — whsec_... (from Stripe Dashboard > Webhooks)
 *   PRINTFUL_API_KEY        — your Printful token
 *   ALERT_EMAIL_URL         — optional: a webhook URL to notify you of failures
 */

import Stripe from 'stripe';

// Disable body parser — we need raw bytes for Stripe signature verification
export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Read raw body
  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Only handle completed payments
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Don't process if payment is still pending (e.g. bank transfer)
    if (session.payment_status !== 'paid') {
      console.log(`Session ${session.id} payment_status is ${session.payment_status} — skipping`);
      return res.status(200).json({ received: true });
    }

    try {
      const orderId = await createPrintfulOrder(session);
      console.log(`Printful order created: ${orderId} for Stripe session: ${session.id}`);
    } catch (err) {
      console.error('Failed to create Printful order:', err);
      // Return 200 to Stripe so it doesn't retry — handle failure notification separately
      // In production, send yourself an email alert here
    }
  }

  return res.status(200).json({ received: true });
}

/**
 * Create a Printful order from a completed Stripe session
 */
async function createPrintfulOrder(session) {
  const shipping = session.shipping_details;
  const customer = session.customer_details;

  if (!shipping?.address) {
    throw new Error('No shipping address in session');
  }

  // Parse cart from metadata
  let cartItems;
  try {
    cartItems = JSON.parse(session.metadata.cart);
  } catch {
    throw new Error('Could not parse cart metadata');
  }

  // Build Printful order payload
  const order = {
    // Use the Stripe session ID as the external reference
    external_id: session.id,

    recipient: {
      name: shipping.name || customer.name,
      email: customer.email,
      phone: customer.phone || '',
      address1: shipping.address.line1,
      address2: shipping.address.line2 || '',
      city: shipping.address.city,
      state_code: shipping.address.state || '',
      country_code: shipping.address.country,
      zip: shipping.address.postal_code,
    },

    items: cartItems.map(item => ({
      sync_variant_id: item.variantId,
      quantity: item.quantity,
    })),

    // Optional: set retail costs for proper packing slips
    retail_costs: {
      currency: session.currency?.toUpperCase() || 'EUR',
      subtotal: (session.amount_subtotal / 100).toFixed(2),
      shipping: '0.00', // Stripe collects this — Printful uses its own shipping costs
      total: (session.amount_total / 100).toFixed(2),
    },
  };

  const response = await fetch('https://api.printful.com/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Printful API error ${response.status}: ${JSON.stringify(data)}`);
  }

  // Auto-confirm the order so Printful starts production immediately
  // Remove this if you want to review orders manually first
  const confirmRes = await fetch(`https://api.printful.com/orders/${data.result.id}/confirm`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
    },
  });

  if (!confirmRes.ok) {
    console.warn(`Could not auto-confirm order ${data.result.id}`);
  }

  return data.result.id;
}

/**
 * Read raw request body as a Buffer (needed for Stripe signature verification)
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
