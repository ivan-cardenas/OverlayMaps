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
          previewUrl: v.files?.find(f => f.type === "preview")?.preview_url || v.files?.[0]?.preview_url || null,
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
        images: extractProductImages(sync_product, sync_variants),
        category: inferCategory(sync_product.name),
        country: inferCountry(sync_product.name),
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

// Known countries/regions — add more as you expand your catalog
const KNOWN_COUNTRIES = [
  // Americas
  'Argentina', 'Bolivia', 'Brasil', 'Brazil', 'Canada', 'Chile', 'Colombia',
  'Costa Rica', 'Cuba', 'Ecuador', 'Guatemala', 'Mexico', 'Panama', 'Paraguay',
  'Peru', 'Uruguay', 'Venezuela', 'United States', 'USA',
  // Europe
  'Albania', 'Austria', 'Belgium', 'Bosnia', 'Bulgaria', 'Catalunya', 'Croatia',
  'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany',
  'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia',
  'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Montenegro', 'Netherlands',
  'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia',
  'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine',
  'United Kingdom', 'UK',
  // Asia & Middle East
  'Afghanistan', 'China', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel',
  'Japan', 'Jordan', 'Kazakhstan', 'South Korea', 'Lebanon', 'Malaysia',
  'Mongolia', 'Myanmar', 'Nepal', 'Pakistan', 'Philippines', 'Saudi Arabia',
  'Singapore', 'Sri Lanka', 'Syria', 'Taiwan', 'Thailand', 'Turkey',
  'Vietnam', 'Yemen', 'Isfahan',
  // Africa
  'Algeria', 'Angola', 'Cameroon', 'Congo', 'Egypt', 'Ethiopia', 'Ghana',
  'Kenya', 'Libya', 'Morocco', 'Mozambique', 'Nigeria', 'Senegal',
  'South Africa', 'Sudan', 'Tanzania', 'Tunisia', 'Uganda', 'Zimbabwe',
  // Oceania
  'Australia', 'New Zealand',
  // World
  'World',
];

function inferCountry(name) {
  for (const country of KNOWN_COUNTRIES) {
    if (name.toLowerCase().includes(country.toLowerCase())) {
      return country;
    }
  }
  return null;
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

/**
 * Extract all unique preview images from a product's variants.
 * Collects front, back, and all other preview images.
 * Returns array of { variantId, url, type } — used for image swapping in the UI.
 */
function extractProductImages(sync_product, sync_variants) {
  // We build a structured image set:
  //   - images.byVariant[variantId] = { front, back, label } (URLs per variant)
  //   - images.shared = [{ url, type }]  (back/label that are the same across all colors)
  //   - images.list = flat array used by the modal thumb strip for the SELECTED color
  //
  // Printful file types on sync_variants:
  //   'preview'       → color mockup (one per color, changes when color changes)
  //   'default'       → front print file preview (usually same across sizes of same color)
  //   'back'          → back print file preview (shared across all colors)
  //   'label_inside'  → inner label (shared)

  const byVariant = {};   // variantId → { front, back, label }
  const seenShared = new Set();
  const shared = [];      // back/label images (same for all colors)

  // First pass: index every variant's files
  for (const v of sync_variants || []) {
    const entry = { front: null, back: null, label: null };

    for (const file of v.files || []) {
      const url = file.preview_url || null;
      if (!url) continue;

      if (file.type === 'preview') {
        entry.front = url;  // color mockup = best "front" image
      } else if (file.type === 'default' && !entry.front) {
        entry.front = url;  // fallback front if no mockup
      } else if (file.type === 'back') {
        entry.back = url;
        // Collect unique back images as shared (usually same across colors)
        if (!seenShared.has(url)) {
          seenShared.add(url);
          shared.push({ url, type: 'back', label: 'Back' });
        }
      } else if (file.type === 'label_inside') {
        entry.label = url;
        if (!seenShared.has(url)) {
          seenShared.add(url);
          shared.push({ url, type: 'label_inside', label: 'Label' });
        }
      }
    }

    byVariant[v.id] = entry;
  }

  // Build a flat `images` array for backward compatibility with the modal:
  // - One entry per variant (front mockup), keyed by variantId
  // - Plus shared back/label entries (variantId: null so they always show)
  const seen = new Set();
  const images = [];

  // Thumbnail first
  if (sync_product.thumbnail_url) {
    seen.add(sync_product.thumbnail_url);
    images.push({ variantId: null, url: sync_product.thumbnail_url, type: 'thumbnail', isDefault: true });
  }

  // One front mockup per variant
  for (const [variantId, entry] of Object.entries(byVariant)) {
    if (entry.front && !seen.has(entry.front)) {
      seen.add(entry.front);
      images.push({ variantId: parseInt(variantId), url: entry.front, type: 'front' });
    }
  }

  // Shared back + label images (always shown regardless of selected color)
  for (const s of shared) {
    images.push({ variantId: null, url: s.url, type: s.type, label: s.label, isShared: true });
  }

  return images;
}