#!/usr/bin/env node
/**
 * build-seo.js
 * Generates static product pages + sitemap.xml + robots.txt from your Printful catalog.
 *
 * Usage:
 *   node scripts/build-seo.js
 *
 * Requires:
 *   PRINTFUL_API_KEY and PRINTFUL_STORE_ID env vars (same as your Vercel env)
 *   Or set API_BASE to your live Vercel API to use the /api/products endpoint
 *
 * Output:
 *   public/products/[slug]/index.html  — one page per product
 *   public/sitemap.xml                 — full sitemap
 *   public/robots.txt                  — robots file
 *
 * Run this script locally or as part of your GitHub Actions CI after each push.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════
const STORE_URL = 'https://www.overlaymaps.com';
const API_BASE  = 'https://overlay-maps.vercel.app';
const OUTPUT_DIR = path.join(__dirname, '..', 'public');

// ═══════════════════════════════════════════
// SLUGIFY
// ═══════════════════════════════════════════
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
}

// ═══════════════════════════════════════════
// FETCH PRODUCTS
// ═══════════════════════════════════════════
async function fetchProducts() {
  console.log('Fetching products from API...');
  const res = await fetch(`${API_BASE}/api/products`);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const { products } = await res.json();
  console.log(`Found ${products.length} products.`);
  return products;
}

// ═══════════════════════════════════════════
// GENERATE PRODUCT PAGE HTML
// ═══════════════════════════════════════════
function generateProductPage(product, allProducts) {
  const slug = slugify(product.name);
  const url = `${STORE_URL}/products/${slug}/`;
  const thumb = product.thumbnail || '';
  const price = product.minPrice
    ? new Intl.NumberFormat('nl-NL', { style: 'currency', currency: product.currency || 'EUR' }).format(product.minPrice)
    : '';
  const description = buildDescription(product);

  // Related products (same category, different product)
  const related = allProducts
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: description,
    image: thumb ? [thumb] : [],
    url: url,
    brand: { '@type': 'Brand', name: 'Overlay Maps' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: product.currency || 'EUR',
      lowPrice: product.minPrice || 0,
      highPrice: product.maxPrice || product.minPrice || 0,
      offerCount: product.variants?.length || 1,
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'Overlay Maps' },
    },
    ...(product.category && {
      category: product.category,
    }),
  };

  // Breadcrumb structured data
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: STORE_URL },
      { '@type': 'ListItem', position: 2, name: capitalize(product.category || 'Products'), item: `${STORE_URL}/?category=${product.category}` },
      { '@type': 'ListItem', position: 3, name: product.name, item: url },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta -->
  <title>${product.name} — Overlay Maps</title>
  <meta name="description" content="${escapeAttr(description)}" />
  <link rel="canonical" href="${url}" />

  <!-- Open Graph -->
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeAttr(product.name)} — Overlay Maps" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${url}" />
  ${thumb ? `<meta property="og:image" content="${escapeAttr(thumb)}" />` : ''}
  <meta property="og:site_name" content="Overlay Maps" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(product.name)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  ${thumb ? `<meta name="twitter:image" content="${escapeAttr(thumb)}" />` : ''}

  <!-- Product meta -->
  <meta property="product:price:amount" content="${product.minPrice || ''}" />
  <meta property="product:price:currency" content="${product.currency || 'EUR'}" />

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>

  <!-- Styles -->
  <link rel="stylesheet" href="/css/store.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
  <script src="https://js.stripe.com/v3/"></script>
</head>
<body>

<!-- HEADER -->
<header class="site-header">
  <div class="header-inner">
    <a href="/" class="logo">
      <span class="logo-mark">◈</span>
      <span class="logo-text">Overlay Maps</span>
    </a>
    <nav class="main-nav">
      <a href="/?category=apparel">Apparel</a>
      <a href="/?category=posters">Posters</a>
      <a href="/?category=stickers">Stickers</a>
      <a href="/?category=stationary">Stationary</a>
    </nav>
    <button class="cart-btn" id="cartToggle" aria-label="Open cart">
      <span class="cart-icon">◫</span>
      <span class="cart-count" id="cartCount">0</span>
    </button>
  </div>
</header>

<!-- BREADCRUMB -->
<nav class="breadcrumb" aria-label="Breadcrumb">
  <div class="breadcrumb-inner">
    <a href="/">Home</a>
    <span class="breadcrumb-sep">›</span>
    <a href="/?category=${product.category || 'all'}">${capitalize(product.category || 'Products')}</a>
    <span class="breadcrumb-sep">›</span>
    <span>${escapeHtml(product.name)}</span>
  </div>
</nav>

<!-- PRODUCT -->
<main class="product-page">
  <div class="product-page-inner">

    <!-- Image gallery -->
    <div class="product-page-gallery">
      <div class="product-page-main-img">
        <img
          id="mainProductImage"
          src="${escapeAttr(thumb)}"
          alt="${escapeAttr(product.name)}"
          width="600"
          height="600"
        />
      </div>
      ${product.images && product.images.length > 1 ? `
      <div class="product-page-thumbs">
        ${product.images.slice(0, 6).map((img, i) => `
        <button class="product-thumb-btn ${i === 0 ? 'active' : ''}"
                onclick="setMainImage('${escapeAttr(img.url)}', this)"
                aria-label="View image ${i + 1}">
          <img src="${escapeAttr(img.url)}" alt="${escapeAttr(product.name)} view ${i + 1}" loading="lazy" />
        </button>`).join('')}
      </div>` : ''}
    </div>

    <!-- Product info -->
    <div class="product-page-info">
      <p class="product-page-cat">${escapeHtml(product.category || '')}${product.country ? ` · ${escapeHtml(product.country)}` : ''}</p>
      <h1 class="product-page-title">${escapeHtml(product.name)}</h1>
      <p class="product-page-price" id="productPrice">From <strong>${price}</strong></p>

      <p class="product-page-desc">${escapeHtml(description)}</p>

      <!-- Variant selector (populated by JS) -->
      <div id="variantSection" class="variant-section" style="display:none">
        <label class="variant-label" id="variantLabel">Select option</label>
        <div class="variant-options" id="variantOptions"></div>
      </div>
      <div id="secondarySection" class="variant-section" style="display:none">
        <label class="variant-label" id="secondaryLabel">Color</label>
        <div class="variant-options" id="secondaryOptions"></div>
      </div>

      <!-- Quantity -->
      <div class="qty-row">
        <label class="variant-label">Quantity</label>
        <div class="qty-control">
          <button class="qty-btn" id="qtyMinus">−</button>
          <span class="qty-val" id="qtyVal">1</span>
          <button class="qty-btn" id="qtyPlus">+</button>
        </div>
      </div>

      <button class="btn-primary btn-full" id="addToCartBtn" disabled>Select options</button>

      <div class="product-page-meta">
        <p>✓ Printed on demand by Printful</p>
        <p>✓ Ships worldwide</p>
        <p>✓ Free returns on defective items</p>
      </div>
    </div>
  </div>

  ${related.length > 0 ? `
  <!-- RELATED PRODUCTS -->
  <section class="related-products">
    <h2 class="related-title">More ${capitalize(product.category || 'products')}</h2>
    <div class="related-grid">
      ${related.map(r => {
        const rSlug = slugify(r.name);
        const rPrice = r.minPrice
          ? new Intl.NumberFormat('nl-NL', { style: 'currency', currency: r.currency || 'EUR' }).format(r.minPrice)
          : '';
        return `
      <a class="related-card" href="/products/${rSlug}/">
        <div class="product-card-img">
          <img src="${escapeAttr(r.thumbnail || '')}" alt="${escapeAttr(r.name)}" loading="lazy" />
        </div>
        <div class="product-card-body">
          <span class="product-card-cat">${escapeHtml(r.category || '')}${r.country ? ` · ${escapeHtml(r.country)}` : ''}</span>
          <h3 class="product-card-name">${escapeHtml(r.name)}</h3>
          <div class="product-card-price">From <strong>${rPrice}</strong></div>
        </div>
      </a>`;
      }).join('')}
    </div>
  </section>` : ''}
</main>

<!-- CART DRAWER -->
<div class="cart-overlay" id="cartOverlay"></div>
<aside class="cart-drawer" id="cartDrawer" aria-hidden="true">
  <div class="cart-header">
    <h2>Your Cart</h2>
    <button class="cart-drawer-close" id="cartClose">✕</button>
  </div>
  <div class="cart-items" id="cartItems">
    <p class="cart-empty">Your cart is empty.</p>
  </div>
  <div class="cart-footer" id="cartFooter" style="display:none">
    <div class="cart-total-row">
      <span>Subtotal</span>
      <span id="cartTotal">€0.00</span>
    </div>
    <div class="cart-shipping-estimator">
      <label class="variant-label">Estimate Shipping</label>
      <div class="shipping-input-row">
        <select id="shippingCountrySelect" class="country-select"></select>
        <button class="shipping-calc-btn" id="calcShippingBtn">Calculate</button>
      </div>
      <div id="shippingRatesList" class="shipping-rates-list"></div>
    </div>
    <div class="cart-total-row" id="shippingTotalRow" style="display:none">
      <span id="shippingTotalLabel">Shipping</span>
      <span id="shippingTotal">€0.00</span>
    </div>
    <div class="cart-total-row cart-grand-total" id="grandTotalRow" style="display:none">
      <span><strong>Total</strong></span>
      <span id="grandTotal"><strong>€0.00</strong></span>
    </div>
    <p class="cart-shipping-note" id="shippingNote">Shipping calculated above or at checkout</p>
    <button class="btn-primary btn-full" id="checkoutBtn">Checkout →</button>
  </div>
</aside>

<!-- FOOTER -->
<footer class="site-footer">
  <div class="footer-inner">
    <div>
      <p class="footer-brand">◈ Overlay Maps</p>
      <p>Maps where Geo meets Art</p>
    </div>
    <div>
      <p class="footer-heading">Shop</p>
      <a href="/?category=apparel">Apparel</a>
      <a href="/?category=posters">Posters</a>
      <a href="/?category=stickers">Stickers</a>
    </div>
    <div>
      <p class="footer-heading">Info</p>
      <a href="mailto:info@overlaymaps.com">Contact</a>
      <a href="https://www.instagram.com/overlaymaps" target="_blank">Instagram</a>
    </div>
  </div>
  <p class="footer-copy">© ${new Date().getFullYear()} Overlay Maps • Powered by Printful + Stripe</p>
</footer>

<script>
window.PRODUCT = ${JSON.stringify({
  id: product.id,
  name: product.name,
  category: product.category,
  thumbnail: product.thumbnail,
  variants: product.variants,
  variantGroups: product.variantGroups,
  images: product.images,
  minPrice: product.minPrice,
  currency: product.currency,
})};
</script>
<script type="module" src="/js/product-page.js"></script>

</body>
</html>`;
}

// ═══════════════════════════════════════════
// GENERATE SITEMAP
// ═══════════════════════════════════════════
function generateSitemap(products) {
  const today = new Date().toISOString().split('T')[0];
  const productUrls = products.map(p => {
    const slug = slugify(p.name);
    return `  <url>
    <loc>${STORE_URL}/products/${slug}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${STORE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${productUrls}
</urlset>`;
}

// ═══════════════════════════════════════════
// GENERATE ROBOTS.TXT
// ═══════════════════════════════════════════
function generateRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${STORE_URL}/sitemap.xml
`;
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function buildDescription(product) {
  const parts = [];
  if (product.country) parts.push(`${product.name} — a unique map-themed ${product.category || 'product'} featuring ${product.country}.`);
  else parts.push(`${product.name} — a unique map-themed ${product.category || 'product'} from Overlay Maps.`);
  parts.push('Printed on demand and shipped worldwide by Printful.');
  if (product.variants?.length > 1) parts.push(`Available in ${product.variants.length} options.`);
  return parts.join(' ');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
  const products = await fetchProducts();

  // Create products directory
  const productsDir = path.join(OUTPUT_DIR, 'products');
  if (!fs.existsSync(productsDir)) fs.mkdirSync(productsDir, { recursive: true });

  // Track slugs for duplicate detection
  const slugsSeen = new Map();
  let generated = 0;

  for (const product of products) {
    let slug = slugify(product.name);

    // Handle duplicate slugs
    if (slugsSeen.has(slug)) {
      const count = slugsSeen.get(slug) + 1;
      slugsSeen.set(slug, count);
      slug = `${slug}-${count}`;
    } else {
      slugsSeen.set(slug, 1);
    }

    const dir = path.join(productsDir, slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const html = generateProductPage(product, products);
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    generated++;
    process.stdout.write(`\r  Generated ${generated}/${products.length}: ${slug}`);
  }

  console.log(`\n✓ Generated ${generated} product pages`);

  // Sitemap
  const sitemap = generateSitemap(products);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemap, 'utf8');
  console.log('✓ Generated sitemap.xml');

  // Robots
  const robots = generateRobots();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'robots.txt'), robots, 'utf8');
  console.log('✓ Generated robots.txt');

  console.log(`\nDone! ${generated} product pages ready in public/products/`);
  console.log(`Submit your sitemap to Google Search Console: ${STORE_URL}/sitemap.xml`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});