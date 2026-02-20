/**
 * TEMPORARY DEBUG ENDPOINT — DELETE AFTER TESTING
 * Visit: https://overlay-maps.vercel.app/api/test
 */
export default async function handler(req, res) {
  const key = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;

  if (!key) return res.json({ error: 'PRINTFUL_API_KEY is not set' });
  if (!storeId) return res.json({ error: 'PRINTFUL_STORE_ID is not set — add it in Vercel env vars' });

  const headers = {
    'Authorization': `Bearer ${key}`,
    'X-PF-Store-Id': storeId,
    'Content-Type': 'application/json',
  };

  const prodRes = await fetch('https://api.printful.com/store/products?limit=5', { headers });
  const prodData = await prodRes.json();

  if (!prodRes.ok) {
    return res.json({
      error: `Printful failed (HTTP ${prodRes.status})`,
      response: prodData,
      key_preview: key.slice(0, 6) + '...' + key.slice(-4),
      store_id_used: storeId,
    });
  }

  return res.json({
    success: true,
    store_id: storeId,
    products_count: prodData.result?.length ?? 0,
    products: (prodData.result || []).map(p => ({ id: p.id, name: p.name }))
  });
}