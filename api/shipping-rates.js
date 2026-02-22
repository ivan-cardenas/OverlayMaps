/**
 * POST /api/shipping-rates
 * Estimates Printful shipping costs for a cart to a given destination country.
 *
 * Body: { country_code: "NL", items: [{ variantId: 123, quantity: 1 }] }
 * Returns: { rates: [{ id, name, rate, currency, minDays, maxDays }] }
 *
 * ENV VARS: PRINTFUL_API_KEY, PRINTFUL_STORE_ID
 */

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { country_code, items } = req.body;

  if (!country_code || typeof country_code !== 'string') {
    return res.status(400).json({ error: 'country_code is required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  try {
    const pfRes = await fetch('https://api.printful.com/shipping/rates', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
        'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { country_code: country_code.toUpperCase() },
        items: items.map(i => ({
          // catalogVariantId is the Printful catalog variant_id (what /shipping/rates needs)
          // variantId is the sync variant ID (fallback for legacy cart items)
          ...(i.catalogVariantId
            ? { variant_id: i.catalogVariantId }
            : { sync_variant_id: i.variantId }),
          quantity: i.quantity,
        })),
        currency: 'EUR',
        locale: 'en_US',
      }),
    });

    const data = await pfRes.json();

    if (!pfRes.ok) {
      const msg = data.error?.message || String(data.result || 'Shipping calculation failed');
      return res.status(422).json({ error: msg });
    }

    const rates = (data.result || []).map(r => ({
      id: r.id,
      name: r.name,
      rate: parseFloat(r.rate),
      currency: r.currency || 'EUR',
      minDays: r.minDeliveryDays ?? null,
      maxDays: r.maxDeliveryDays ?? null,
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json({ rates });
  } catch (err) {
    console.error('Shipping rates error:', err);
    return res.status(500).json({ error: 'Failed to calculate shipping rates' });
  }
}
