/**
 * GET /api/products
 * Fetches all sync products + their variants from Printful.
 *
 * ENV VARS NEEDED:
 *   PRINTFUL_API_KEY    — your Printful private token
 *   PRINTFUL_STORE_ID   — your Printful store ID
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

  if (!apiKey) throw new Error('PRINTFUL_API_KEY is not set');
  if (!storeId) throw new Error('PRINTFUL_STORE_ID is not set');

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'X-PF-Store-Id': storeId,
    'Content-Type': 'application/json',
  };

  // 1. Fetch all products (paginate through all pages)
  let allProducts = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const listRes = await fetch(
      `https://api.printful.com/store/products?limit=${limit}&offset=${offset}`,
      { headers }
    );
    if (!listRes.ok) {
      const body = await listRes.text();
      throw new Error(`Printful list error: ${listRes.status} — ${body}`);
    }
    const listData = await listRes.json();
    const page = listData.result || [];
    allProducts = allProducts.concat(page);

    // Stop if we've fetched everything
    if (allProducts.length >= listData.paging.total || page.length < limit) break;
    offset += limit;
  }

  // 2. Fetch full details for each product (variants + pricing)
  const products = await Promise.all(
    allProducts.map(async (p) => {
      const detailRes = await fetch(
        `https://api.printful.com/store/products/${p.id}`,
        { headers }
      );
      if (!detailRes.ok) return null;
      const { result } = await detailRes.json();

      const { sync_product, sync_variants } = result;

      // Keep all variants — don't filter by is_enabled or availability_status
      // (these fields are unreliable across Printful API versions)
      const variants = (sync_variants || [])
        .filter(v => v.retail_price != null)  // only skip variants with no price set
        .map(v => ({
          id: v.id,
          name: v.name,
          sku: v.sku || '',
          price: parseFloat(v.retail_price),
          currency: v.currency || 'EUR',
          options: parseVariantName(v.name, sync_product.name),
          available: v.availability_status !== 'discontinued',
        }));

      if (variants.length === 0) return null;

      const prices = variants.map(v => v.price);

      return {
        id: sync_product.id,
        name: sync_product.name,
        thumbnail: sync_product.thumbnail_url,
        category: inferCategory(sync_product.name),
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
  if (lower.includes('poster') || lower.includes('print') || lower.includes('framed')) return 'posters';
  if (lower.includes('sticker')) return 'stickers';
  if (lower.includes('notebook') || lower.includes('stationary') || lower.includes('mug') || lower.includes('tote')) return 'stationary';
  return 'other';
}

function parseVariantName(variantName, productName) {
  // Remove product name prefix
  let optionStr = variantName.replace(productName, '').replace(/^[\s\-\/]+/, '').trim();
  if (!optionStr) optionStr = variantName;

  const parts = optionStr.split(' / ').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { primary: parts[0], secondary: parts[1] };
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