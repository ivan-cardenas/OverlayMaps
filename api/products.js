/**
 * GET /api/products
 * Fetches all sync products + their variants from Printful.
 * Returns a normalized catalog the frontend can render.
 *
 * ENV VARS NEEDED:
 *   PRINTFUL_API_KEY    — your Printful private token
 *   PRINTFUL_STORE_ID   — your Printful store ID (found in dashboard URL)
 */

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const products = await fetchPrintfulCatalog();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json({ products });
  } catch (err) {
    console.error('Printful catalog error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function fetchPrintfulCatalog() {
  const apiKey = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;

  if (!apiKey) throw new Error('PRINTFUL_API_KEY environment variable is not set');
  if (!storeId) throw new Error('PRINTFUL_STORE_ID environment variable is not set');

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'X-PF-Store-Id': storeId,
    'Content-Type': 'application/json',
  };

  // 1. Get all sync products in the store
  const listRes = await fetch('https://api.printful.com/store/products?limit=100', { headers });

  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(`Printful list error: ${listRes.status} — ${body}`);
  }

  const { result: productList } = await listRes.json();

  // 2. For each product, fetch full details (variants + pricing)
  const products = await Promise.all(
    productList.map(async (p) => {
      const detailRes = await fetch(`https://api.printful.com/store/products/${p.id}`, { headers });
      if (!detailRes.ok) return null;
      const { result } = await detailRes.json();

      const { sync_product, sync_variants } = result;

      const category = inferCategory(sync_product.name);

      const variants = sync_variants
        .filter(v => v.is_enabled)
        .map(v => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: parseFloat(v.retail_price),
          currency: v.currency,
          options: parseVariantName(v.name, sync_product.name),
          available: v.availability_status === 'active',
        }));

      if (variants.length === 0) return null;

      const prices = variants.map(v => v.price);

      return {
        id: sync_product.id,
        name: sync_product.name,
        thumbnail: sync_product.thumbnail_url,
        category,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        currency: variants[0]?.currency || 'EUR',
        variants,
        variantGroups: groupVariants(variants),
      };
    })
  );

  return products.filter(Boolean);
}

function inferCategory(name) {
  const lower = name.toLowerCase();
  if (lower.includes('t-shirt') || lower.includes('hoodie') || lower.includes('shirt')) return 'apparel';
  if (lower.includes('poster') || lower.includes('print')) return 'posters';
  if (lower.includes('sticker')) return 'stickers';
  if (lower.includes('notebook') || lower.includes('stationary') || lower.includes('mug') || lower.includes('tote')) return 'stationary';
  return 'other';
}

function parseVariantName(variantName, productName) {
  let optionStr = variantName.replace(productName, '').replace(/^[\s\-\/]+/, '').trim();
  if (!optionStr) optionStr = variantName;

  const parts = optionStr.split(' / ').map(s => s.trim()).filter(Boolean);

  if (parts.length === 2) return { primary: parts[0], secondary: parts[1] };
  if (parts.length === 1) return { primary: parts[0], secondary: null };
  return { primary: optionStr, secondary: null };
}

function groupVariants(variants) {
  const groups = {};
  variants.forEach(v => {
    const key = v.options.primary;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  });
  return groups;
}