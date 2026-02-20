/**
 * GET /api/products
 * Fetches all sync products + their variants from Printful.
 * Returns a normalized catalog the frontend can render.
 *
 * ENV VARS NEEDED:
 *   PRINTFUL_API_KEY  — your Printful private token
 */

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const products = await fetchPrintfulCatalog();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache 5 min on CDN
    return res.status(200).json({ products });
  } catch (err) {
    console.error('Printful catalog error:', err);
    return res.status(500).json({ error: 'Failed to load catalog' });
  }
}

async function fetchPrintfulCatalog() {
  const headers = {
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // 1. Get all sync products in the store
  const listRes = await fetch('https://api.printful.com/store/products?limit=100', { headers });
  if (!listRes.ok) throw new Error(`Printful list error: ${listRes.status}`);
  const { result: productList } = await listRes.json();

  // 2. For each product, fetch full details (variants + pricing)
  const products = await Promise.all(
    productList.map(async (p) => {
      const detailRes = await fetch(`https://api.printful.com/store/products/${p.id}`, { headers });
      if (!detailRes.ok) return null;
      const { result } = await detailRes.json();

      const { sync_product, sync_variants } = result;

      // Determine category from product name or tags
      const category = inferCategory(sync_product.name);

      // Build clean variant list
      const variants = sync_variants
        .filter(v => v.is_enabled)
        .map(v => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: parseFloat(v.retail_price), // your set retail price
          currency: v.currency,
          // Extract size/color from variant name (e.g. "Black / S" or "30x40 cm")
          options: parseVariantName(v.name, sync_product.name),
          available: v.availability_status === 'active',
        }));

      if (variants.length === 0) return null;

      // Min price for display
      const prices = variants.map(v => v.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      return {
        id: sync_product.id,
        name: sync_product.name,
        thumbnail: sync_product.thumbnail_url,
        category,
        minPrice,
        maxPrice,
        currency: variants[0]?.currency || 'EUR',
        variants,
        // Group variants by their primary option (size, dimension, etc.)
        variantGroups: groupVariants(variants),
      };
    })
  );

  return products.filter(Boolean);
}

/**
 * Infer category from product name
 */
function inferCategory(name) {
  const lower = name.toLowerCase();
  if (lower.includes('t-shirt') || lower.includes('hoodie') || lower.includes('apparel') || lower.includes('shirt')) return 'apparel';
  if (lower.includes('poster') || lower.includes('print')) return 'posters';
  if (lower.includes('sticker')) return 'stickers';
  if (lower.includes('notebook') || lower.includes('stationary') || lower.includes('mug') || lower.includes('tote')) return 'stationary';
  return 'other';
}

/**
 * Parse variant name into structured options
 * Printful variant names are typically "Product Name - Size" or "Color / Size"
 */
function parseVariantName(variantName, productName) {
  // Remove product name prefix if present
  let optionStr = variantName.replace(productName, '').replace(/^[\s\-\/]+/, '').trim();
  if (!optionStr) optionStr = variantName;

  // Try splitting by " / " for color/size combos
  const parts = optionStr.split(' / ').map(s => s.trim()).filter(Boolean);

  if (parts.length === 2) {
    return { primary: parts[0], secondary: parts[1] };
  }
  if (parts.length === 1) {
    return { primary: parts[0], secondary: null };
  }
  return { primary: optionStr, secondary: null };
}

/**
 * Group variants by primary option for UI rendering
 */
function groupVariants(variants) {
  const groups = {};
  variants.forEach(v => {
    const key = v.options.primary;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  });
  return groups;
}
