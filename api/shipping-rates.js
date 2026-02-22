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

  const pfHeaders = {
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
    'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID,
    'Content-Type': 'application/json',
  };

  try {
    // Resolve catalog variant_id for any items that only have a sync variant ID.
    // Printful's /shipping/rates only accepts the catalog variant_id, not sync_variant_id.
    const resolvedItems = await Promise.all(items.map(async (i) => {
      let catalogVariantId = i.catalogVariantId;
      if (!catalogVariantId) {
        const svRes = await fetch(
          `https://api.printful.com/store/variants/${i.variantId}`,
          { headers: pfHeaders }
        );
        const svData = await svRes.json();
        catalogVariantId = svData.result?.sync_variant?.variant_id || null;
      }
      return { variant_id: catalogVariantId, quantity: i.quantity };
    }));

    if (resolvedItems.some(i => !i.variant_id)) {
      return res.status(422).json({ error: 'Could not resolve one or more product variants' });
    }

    const pfRes = await fetch('https://api.printful.com/shipping/rates', {
      method: 'POST',
      headers: pfHeaders,
      body: JSON.stringify({
        recipient: { country_code: country_code.toUpperCase() },
        items: resolvedItems,
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
