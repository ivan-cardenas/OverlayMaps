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
    <p class="cart-shipping-note">Shipping calculated at checkout</p>
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

<script type="module">
// Inline product data for this page
const PRODUCT = ${JSON.stringify({
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

const CONFIG = {
  API_BASE: 'https://overlay-maps.vercel.app',
  STRIPE_PK: 'pk_live_51QsNPRL50YWJ2vn2WmXXYkWHFyQKm5kH9HjN8D8i5GpLi7KQKZL0sAh55nzRRqcf7dvVJZ5SyBg0ZhOuPDhm7Rma00xr5IBa3',
  CART_KEY: 'overlaymaps_cart',
};

window._stripe = Stripe(CONFIG.STRIPE_PK);

let selectedPrimary = null;
let selectedVariant = null;
let quantity = 1;
let cart = loadCart();

// Expose setMainImage globally so onclick handlers can call it
window.setMainImage = function(url, btn) {
  document.getElementById('mainProductImage').src = url;
  document.querySelectorAll('.product-thumb-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
};

initPage();
initCartUI();

function initPage() {
  initVariants();
  document.getElementById('qtyMinus').addEventListener('click', () => setQty(quantity - 1));
  document.getElementById('qtyPlus').addEventListener('click', () => setQty(quantity + 1));
  document.getElementById('addToCartBtn').addEventListener('click', handleAddToCart);
}

function initVariants() {
  const groups = PRODUCT.variantGroups;
  const groupKeys = Object.keys(groups || {});
  const section = document.getElementById('variantSection');
  const primaryOpts = document.getElementById('variantOptions');
  const primaryLabel = document.getElementById('variantLabel');

  if (groupKeys.length === 0) {
    section.style.display = 'none';
    if (PRODUCT.variants?.length === 1) {
      selectedVariant = PRODUCT.variants[0];
      updateAddBtn();
    }
    return;
  }

  section.style.display = 'block';
  const isSizeGroup = /^(xs|s|m|l|xl|xxl|2xl|3xl|\\d+x\\d+|a\\d+|\\d+cm)/i.test(groupKeys[0]);
  primaryLabel.textContent = isSizeGroup ? 'Size / Dimensions' : 'Option';

  primaryOpts.innerHTML = groupKeys.map(key =>
    '<button class="variant-opt" data-primary="' + key + '">' + key + '</button>'
  ).join('');

  primaryOpts.querySelectorAll('.variant-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      primaryOpts.querySelectorAll('.variant-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPrimary = btn.dataset.primary;
      renderSecondary(selectedPrimary);
    });
  });

  if (groupKeys.length === 1) primaryOpts.querySelector('.variant-opt').click();
}

function renderSecondary(primaryKey) {
  const variants = PRODUCT.variantGroups[primaryKey];
  const secondarySection = document.getElementById('secondarySection');
  const secondaryOpts = document.getElementById('secondaryOptions');
  selectedVariant = null;
  updateAddBtn();

  if (!variants.some(v => v.options?.secondary)) {
    secondarySection.style.display = 'none';
    selectedVariant = variants[0];
    updatePrice();
    updateAddBtn();
    return;
  }

  secondarySection.style.display = 'block';
  secondaryOpts.innerHTML = variants.map(v =>
    '<button class="variant-opt ' + (v.available ? '' : 'unavailable') + '" data-id="' + v.id + '" ' + (v.available ? '' : 'disabled') + '>' +
    (v.options?.secondary || v.name) + '</button>'
  ).join('');

  secondaryOpts.querySelectorAll('.variant-opt:not(.unavailable)').forEach(btn => {
    btn.addEventListener('click', () => {
      secondaryOpts.querySelectorAll('.variant-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedVariant = PRODUCT.variants.find(v => v.id === parseInt(btn.dataset.id));
      updatePrice();
      updateAddBtn();
    });
  });
}

function updatePrice() {
  if (selectedVariant) {
    document.getElementById('productPrice').innerHTML =
      '<strong>' + formatPrice(selectedVariant.price * quantity, selectedVariant.currency) + '</strong>';
  }
}

function updateAddBtn() {
  const btn = document.getElementById('addToCartBtn');
  btn.disabled = !selectedVariant;
  btn.textContent = selectedVariant
    ? 'Add to cart — ' + formatPrice(selectedVariant.price * quantity, selectedVariant.currency)
    : 'Select options';
}

function setQty(n) {
  quantity = Math.max(1, Math.min(20, n));
  document.getElementById('qtyVal').textContent = quantity;
  updateAddBtn();
}

function handleAddToCart() {
  if (!selectedVariant) return;
  const item = {
    variantId: selectedVariant.id,
    name: PRODUCT.name,
    variantLabel: [selectedPrimary, selectedVariant.options?.secondary].filter(Boolean).join(' / '),
    price: selectedVariant.price,
    currency: selectedVariant.currency,
    thumbnail: PRODUCT.thumbnail,
    quantity,
  };
  const existing = cart.find(i => i.variantId === item.variantId);
  if (existing) existing.quantity = Math.min(20, existing.quantity + quantity);
  else cart.push(item);
  saveCart();
  renderCart();
  updateCartCount();
  openCart();
  showToast('Added to cart!');
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CONFIG.CART_KEY)) || []; } catch { return []; }
}
function saveCart() { localStorage.setItem(CONFIG.CART_KEY, JSON.stringify(cart)); }

function renderCart() {
  const container = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const totalEl = document.getElementById('cartTotal');
  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    footer.style.display = 'none';
    return;
  }
  container.innerHTML = cart.map(item => '<div class="cart-item"><img class="cart-item-img" src="' + (item.thumbnail||'') + '" alt="' + item.name + '" onerror="this.style.display=\'none\'" /><div><div class="cart-item-name">' + item.name + '</div>' + (item.variantLabel ? '<div class="cart-item-variant">' + item.variantLabel + '</div>' : '') + '<div class="cart-item-price">' + item.quantity + ' × ' + formatPrice(item.price, item.currency) + '</div></div><button class="cart-item-remove" data-variant="' + item.variantId + '">✕</button></div>').join('');
  container.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      cart = cart.filter(i => i.variantId !== parseInt(btn.dataset.variant));
      saveCart(); renderCart(); updateCartCount();
    });
  });
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  totalEl.textContent = formatPrice(total, cart[0]?.currency || 'EUR');
  footer.style.display = 'flex';
}

function updateCartCount() {
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const el = document.getElementById('cartCount');
  el.textContent = count;
  el.classList.toggle('visible', count > 0);
}

function initCartUI() {
  document.getElementById('cartToggle').addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
  document.getElementById('checkoutBtn').addEventListener('click', handleCheckout);
  renderCart(); updateCartCount();
}

function openCart() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
}
function closeCart() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
}

async function handleCheckout() {
  if (!cart.length) return;
  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true; btn.textContent = 'Loading...';
  try {
    const res = await fetch(CONFIG.API_BASE + '/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    });
    const { url, sessionId } = await res.json();
    if (url) window.location.href = url;
    else { const r = await window._stripe.redirectToCheckout({ sessionId }); if (r.error) throw r.error; }
  } catch (err) {
    showToast('Error: ' + err.message);
    btn.disabled = false; btn.textContent = 'Checkout →';
  }
}

function formatPrice(amount, currency = 'EUR') {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(amount);
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--accent);color:var(--white);padding:.75rem 1.5rem;border-radius:4px;z-index:9999;font-family:var(--font-mono);font-size:13px;transition:opacity .3s'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.opacity = '0', 3000);
}
</script>

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