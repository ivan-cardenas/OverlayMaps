/**
 * lib/printful.js
 * Server-side only. Used by getStaticProps and API routes.
 */

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function getHeaders() {
  const apiKey = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!apiKey) throw new Error('PRINTFUL_API_KEY is not set');
  if (!storeId) throw new Error('PRINTFUL_STORE_ID is not set');
  return {
    Authorization: `Bearer ${apiKey}`,
    'X-PF-Store-Id': storeId,
    'Content-Type': 'application/json',
  };
}

export async function fetchPrintfulCatalog() {
  const headers = getHeaders();

  // 1. Paginate through all products
  let allProducts = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `https://api.printful.com/store/products?limit=${limit}&offset=${offset}`,
      { headers }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Printful list error: ${res.status} — ${body}`);
    }
    const data = await res.json();
    const page = data.result || [];
    allProducts = allProducts.concat(page);
    if (allProducts.length >= data.paging.total || page.length < limit) break;
    offset += limit;
  }

  // 2. Fetch full details (variants + pricing) for each product
  const products = await Promise.all(
    allProducts.map(async (p) => {
      const res = await fetch(
        `https://api.printful.com/store/products/${p.id}`,
        { headers }
      );
      if (!res.ok) return null;
      const { result } = await res.json();
      return transformProduct(result.sync_product, result.sync_variants);
    })
  );

  return products.filter(Boolean);
}

export async function fetchProductById(id) {
  const headers = getHeaders();
  const res = await fetch(
    `https://api.printful.com/store/products/${id}`,
    { headers }
  );
  if (!res.ok) return null;
  const { result } = await res.json();
  return transformProduct(result.sync_product, result.sync_variants);
}

function transformProduct(sync_product, sync_variants) {
  const variants = (sync_variants || [])
    .filter((v) => v.retail_price != null)
    .map((v) => ({
      id: v.id,
      previewUrl:
        v.files?.find((f) => f.type === 'preview')?.preview_url ||
        v.files?.[0]?.preview_url ||
        null,
      name: v.name,
      sku: v.sku || '',
      price: parseFloat(v.retail_price),
      currency: v.currency || 'EUR',
      options: parseVariantName(v.name, sync_product.name),
      available: v.availability_status !== 'discontinued',
    }));

  if (variants.length === 0) return null;

  const prices = variants.map((v) => v.price);

  return {
    id: sync_product.id,
    slug: `${sync_product.id}-${slugify(sync_product.name)}`,
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
}

function inferCategory(name) {
  const lower = name.toLowerCase();
  if (lower.includes('t-shirt') || lower.includes('hoodie') || lower.includes('shirt'))
    return 'apparel';
  if (lower.includes('poster') || lower.includes('print') || lower.includes('framed'))
    return 'posters';
  if (lower.includes('sticker')) return 'stickers';
  if (
    lower.includes('notebook') ||
    lower.includes('stationary') ||
    lower.includes('mug') ||
    lower.includes('tote')
  )
    return 'stationary';
  return 'other';
}

const KNOWN_COUNTRIES = [
  'Argentina', 'Bolivia', 'Brasil', 'Brazil', 'Canada', 'Chile', 'Colombia',
  'Costa Rica', 'Cuba', 'Ecuador', 'Guatemala', 'Mexico', 'Panama', 'Paraguay',
  'Peru', 'Uruguay', 'Venezuela', 'United States', 'USA',
  'Albania', 'Austria', 'Belgium', 'Bosnia', 'Bulgaria', 'Catalunya', 'Croatia',
  'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany',
  'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia',
  'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Montenegro', 'Netherlands',
  'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia',
  'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine',
  'United Kingdom', 'UK',
  'Afghanistan', 'China', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel',
  'Japan', 'Jordan', 'Kazakhstan', 'South Korea', 'Lebanon', 'Malaysia',
  'Mongolia', 'Myanmar', 'Nepal', 'Pakistan', 'Philippines', 'Saudi Arabia',
  'Singapore', 'Sri Lanka', 'Syria', 'Taiwan', 'Thailand', 'Turkey',
  'Vietnam', 'Yemen', 'Isfahan',
  'Algeria', 'Angola', 'Cameroon', 'Congo', 'Egypt', 'Ethiopia', 'Ghana',
  'Kenya', 'Libya', 'Morocco', 'Mozambique', 'Nigeria', 'Senegal',
  'South Africa', 'Sudan', 'Tanzania', 'Tunisia', 'Uganda', 'Zimbabwe',
  'Australia', 'New Zealand',
  'World',
];

function inferCountry(name) {
  for (const country of KNOWN_COUNTRIES) {
    if (name.toLowerCase().includes(country.toLowerCase())) return country;
  }
  return null;
}

function parseVariantName(variantName, productName) {
  let optionStr = variantName
    .replace(productName, '')
    .replace(/^[\s\-\/]+/, '')
    .trim();
  if (!optionStr) optionStr = variantName;
  const parts = optionStr
    .split(' / ')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { primary: parts[0], secondary: parts[1] };
  if (parts.length === 1) return { primary: parts[0], secondary: null };
  return { primary: optionStr, secondary: null };
}

function groupVariants(variants) {
  const groups = {};
  variants.forEach((v) => {
    const key = v.options.primary;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  });
  return groups;
}

function extractProductImages(sync_product, sync_variants) {
  const seen = new Set();
  const images = [];
  if (sync_product.thumbnail_url) {
    seen.add(sync_product.thumbnail_url);
    images.push({ variantId: null, url: sync_product.thumbnail_url, isDefault: true });
  }
  for (const v of sync_variants || []) {
    const url =
      v.files?.find((f) => f.type === 'preview')?.preview_url ||
      v.files?.[0]?.preview_url ||
      null;
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ variantId: v.id, url });
    }
  }
  return images;
}
