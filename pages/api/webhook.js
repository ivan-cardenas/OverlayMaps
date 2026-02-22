import Stripe from 'stripe';

// Disable body parser — raw bytes needed for Stripe signature verification
export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id);
    if (session.payment_status === 'paid') {
      try {
        const orderId = await createPrintfulOrder(session);
        console.log(`Printful order created: ${orderId} for session: ${session.id}`);
      } catch (err) {
        console.error('Failed to create Printful order:', err);
      }
    }
  }

  if (event.type === 'checkout.session.async_payment_succeeded') {
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id);
    try {
      const orderId = await createPrintfulOrder(session);
      console.log(`Printful order created (async): ${orderId} for session: ${session.id}`);
    } catch (err) {
      console.error('Failed to create Printful order (async):', err);
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    console.error(`Async payment failed for session: ${session.id}, customer: ${session.customer_details?.email}`);
  }

  return res.status(200).json({ received: true });
}

async function createPrintfulOrder(session) {
  const shipping = session.shipping_details;
  const customer = session.customer_details;

  if (!shipping?.address) throw new Error('No shipping address in session');

  let cartItems;
  try {
    cartItems = JSON.parse(session.metadata.cart);
  } catch {
    throw new Error('Could not parse cart metadata');
  }

  const order = {
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
    items: cartItems.map((item) => ({
      sync_variant_id: item.variantId,
      quantity: item.quantity,
    })),
    retail_costs: {
      currency: session.currency?.toUpperCase() || 'EUR',
      subtotal: (session.amount_subtotal / 100).toFixed(2),
      shipping: '0.00',
      total: (session.amount_total / 100).toFixed(2),
    },
  };

  const response = await fetch('https://api.printful.com/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Printful API error ${response.status}: ${JSON.stringify(data)}`);
  }

  // Auto-confirm so Printful starts production immediately
  await fetch(`https://api.printful.com/orders/${data.result.id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}` },
  });

  return data.result.id;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
