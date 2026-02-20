/**
 * TEMPORARY DEBUG ENDPOINT — DELETE AFTER TESTING
 * Visit: https://overlay-maps.vercel.app/api/test
 */
export default async function handler(req, res) {
  const key = process.env.PRINTFUL_API_KEY;

  if (!key) {
    return res.json({
      error: 'PRINTFUL_API_KEY is not set in Vercel environment variables',
      fix: 'Go to Vercel → Project → Settings → Environment Variables → add PRINTFUL_API_KEY'
    });
  }

  // Test 1: basic store info
  const storeRes = await fetch('https://api.printful.com/store', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const storeData = await storeRes.json();

  if (!storeRes.ok) {
    return res.json({
      error: `Printful rejected the token (HTTP ${storeRes.status})`,
      printful_response: storeData,
      key_preview: key.slice(0, 6) + '...' + key.slice(-4),
      fix: 'Regenerate your Printful token at printful.com → Settings → API'
    });
  }

  // Test 2: products list
  const prodRes = await fetch('https://api.printful.com/store/products?limit=5', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const prodData = await prodRes.json();

  return res.json({
    success: true,
    store_name: storeData.result?.name,
    store_id: storeData.result?.id,
    products_status: prodRes.status,
    products_count: prodData.result?.length ?? 0,
    first_products: (prodData.result || []).map(p => ({ id: p.id, name: p.name }))
  });
}