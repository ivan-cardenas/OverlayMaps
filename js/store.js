/**
 * Overlay Maps Store — store.js
 * Handles: catalog fetching, filtering, product modal,
 *          multi-item cart, and Stripe checkout
 *
 * CONFIG: Update API_BASE and STRIPE_PK below before deploying
 */

// ═══════════════════════════════════════════
// CONFIGURATION — update these!
// ═══════════════════════════════════════════
const CONFIG = {
  // Your Vercel deployment URL (no trailing slash)
  API_BASE: 'https://overlay-maps.vercel.app',

  // Stripe publishable key (safe to expose in frontend)
  STRIPE_PK: 'pk_live_51T3JChL50YWJ2vn24GRdCJBcDP0Ggn7mwPUoocxJQZeb1J69H8OYhD5uRYZjsoIKreeWp83oeeUDfj3HFTQS2a7A00mfZUdiy0',

  // Cart storage key
  CART_KEY: 'overlaymaps_cart',
};

// ═══════════════════════════════════════════
// THUMBNAIL OVERRIDES
// Override the default Printful thumbnail per product ID.
// Find product IDs at: https://overlay-maps.vercel.app/api/products
// ═══════════════════════════════════════════
const THUMBNAIL_OVERRIDES = {
  // 420536143: 'https://your-custom-image-url.jpg',
  // 420536088: 'https://your-custom-image-url.jpg',
};


let allProducts = [];
let activeCategory = 'all';
let activeCountry = 'all';
let cart = loadCart();
let currentProduct = null;
let selectedPrimary = null;
let selectedVariant = null;
let quantity = 1;

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initStripe();
  initCartUI();
  initFilterButtons();
  initModal();
  fetchProducts();

  // Show cancel message if returning from abandoned checkout
  if (new URLSearchParams(location.search).get('canceled')) {
    showToast('Checkout canceled — your cart is still saved.');
  }
});

function initStripe() {
  window._stripe = Stripe(CONFIG.STRIPE_PK);
}

// ═══════════════════════════════════════════
// FETCH PRODUCTS FROM PRINTFUL (via our API)
// ═══════════════════════════════════════════
async function fetchProducts() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { products } = await res.json();
    allProducts = products;
    buildCountryFilter(products);
    renderProducts(products);
  } catch (err) {
    console.error('Failed to load products:', err);
    document.getElementById('productGrid').innerHTML = `
      <p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:4rem 0">
        Failed to load products. Please refresh the page.
      </p>
    `;
  }
}

// ═══════════════════════════════════════════
// RENDER PRODUCTS
// ═══════════════════════════════════════════
function renderProducts(products) {
  const grid = document.getElementById('productGrid');
  const count = document.getElementById('productCount');

  let filtered = products;
  if (activeCategory !== 'all') filtered = filtered.filter(p => p.category === activeCategory);
  if (activeCountry !== 'all') filtered = filtered.filter(p => p.country === activeCountry);

  count.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:4rem 0">No products found.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const thumb = THUMBNAIL_OVERRIDES[p.id] || p.thumbnail || '';
    return `
    <article class="product-card" data-id="${p.id}" tabindex="0" role="button" aria-label="${p.name}">
      <div class="product-card-img">
        <img
          src="${thumb}"
          alt="${p.name}"
          loading="lazy"
          onerror="this.style.display='none'"
        />
      </div>
      <div class="product-card-body">
        <span class="product-card-cat">
          ${p.category}${p.country ? ` · ${p.country}` : ''}
        </span>
        <h3 class="product-card-name">${p.name}</h3>
        <div class="product-card-price">
          From <strong>${formatPrice(p.minPrice, p.currency)}</strong>
        </div>
      </div>
    </article>
  `}).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openModal(parseInt(card.dataset.id)));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openModal(parseInt(card.dataset.id)); });
  });
}

// ═══════════════════════════════════════════
// FILTER BUTTONS
// ═══════════════════════════════════════════
function initFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderProducts(allProducts);
    });
  });
}

function buildCountryFilter(products) {
  // Collect unique countries that actually have products
  const countries = [...new Set(
    products.map(p => p.country).filter(Boolean)
  )].sort();

  const select = document.getElementById('countryFilter');
  if (!select) return;

  select.innerHTML = `<option value="all">All countries</option>`
    + countries.map(c => `<option value="${c}">${c}</option>`).join('');

  select.addEventListener('change', () => {
    activeCountry = select.value;
    renderProducts(allProducts);
  });
}

// ═══════════════════════════════════════════
// PRODUCT MODAL
// ═══════════════════════════════════════════
function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('productModal').addEventListener('click', e => {
    if (e.target === document.getElementById('productModal')) closeModal();
  });
  document.getElementById('qtyMinus').addEventListener('click', () => setQty(quantity - 1));
  document.getElementById('qtyPlus').addEventListener('click', () => setQty(quantity + 1));
  document.getElementById('addToCartBtn').addEventListener('click', handleAddToCart);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

function openModal(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  currentProduct = product;
  selectedPrimary = null;
  selectedVariant = null;
  quantity = 1;

  const thumb = THUMBNAIL_OVERRIDES[product.id] || product.thumbnail || '';
  document.getElementById('modalImage').src = thumb;
  document.getElementById('modalImage').alt = product.name;
  document.getElementById('modalCategory').textContent = product.category;
  document.getElementById('modalTitle').textContent = product.name;
  document.getElementById('modalPrice').textContent = `From ${formatPrice(product.minPrice, product.currency)}`;
  document.getElementById('qtyVal').textContent = '1';

  renderVariants(product);

  document.getElementById('productModal').classList.add('open');
  document.getElementById('productModal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('productModal').classList.remove('open');
  document.getElementById('productModal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentProduct = null;
}

function renderVariants(product) {
  const section = document.getElementById('variantSection');
  const primaryOpts = document.getElementById('variantOptions');
  const primaryLabel = document.getElementById('variantLabel');
  const secondarySection = document.getElementById('secondarySection');

  secondarySection.style.display = 'none';

  const groups = product.variantGroups;
  const groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) {
    section.style.display = 'none';
    // Auto-select the only variant
    if (product.variants.length === 1) {
      selectedVariant = product.variants[0];
      updateModalImage(selectedVariant);
      updateAddBtn();
    }
    return;
  }

  section.style.display = 'block';

  // Determine label: "Size", "Dimensions", etc.
  const firstKey = groupKeys[0];
  const isSizeGroup = /^(xs|s|m|l|xl|xxl|2xl|3xl|\d+x\d+|a\d+|\d+cm)/i.test(firstKey);
  primaryLabel.textContent = isSizeGroup ? 'Size / Dimensions' : 'Option';

  primaryOpts.innerHTML = groupKeys.map(key => `
    <button class="variant-opt" data-primary="${key}">${key}</button>
  `).join('');

  primaryOpts.querySelectorAll('.variant-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      primaryOpts.querySelectorAll('.variant-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPrimary = btn.dataset.primary;
      // Preview the first variant image for this primary group immediately
      const firstVariant = product.variantGroups[selectedPrimary]?.[0];
      if (firstVariant) updateModalImage(firstVariant);
      renderSecondaryVariants(product, selectedPrimary);
    });
  });

  // If only one primary group, auto-select it
  if (groupKeys.length === 1) {
    primaryOpts.querySelector('.variant-opt').click();
  }
}

function renderSecondaryVariants(product, primaryKey) {
  const variants = product.variantGroups[primaryKey];
  const secondarySection = document.getElementById('secondarySection');
  const secondaryOpts = document.getElementById('secondaryOptions');
  const secondaryLabel = document.getElementById('secondaryLabel');

  selectedVariant = null;
  updateAddBtn();

  // Check if variants have a secondary option (e.g. color)
  const hasSecondary = variants.some(v => v.options.secondary);

  if (!hasSecondary) {
    // Only one variant for this primary — auto-select
    secondarySection.style.display = 'none';
    selectedVariant = variants[0];
    updateModalImage(selectedVariant);
    updateModalPrice();
    updateAddBtn();
    return;
  }

  secondarySection.style.display = 'block';
  secondaryLabel.textContent = 'Color';

  secondaryOpts.innerHTML = variants.map(v => `
    <button class="variant-opt ${v.available ? '' : 'unavailable'}"
            data-variant-id="${v.id}"
            ${v.available ? '' : 'disabled'}>
      ${v.options.secondary || v.name}
    </button>
  `).join('');

  secondaryOpts.querySelectorAll('.variant-opt:not(.unavailable)').forEach(btn => {
    btn.addEventListener('click', () => {
      secondaryOpts.querySelectorAll('.variant-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedVariant = product.variants.find(v => v.id === parseInt(btn.dataset.variantId));
      updateModalImage(selectedVariant);
      updateModalPrice();
      updateAddBtn();
    });
  });
}

function updateModalImage(variant) {
  if (!currentProduct) return;
  const img = document.getElementById("modalImage");

  // Try to find a variant-specific preview image
  if (variant && currentProduct.images) {
    const match = currentProduct.images.find(i => i.variantId === variant.id);
    if (match) { img.src = match.url; return; }

    // Fallback: find image for same primary option (e.g. same color across sizes)
    const sameGroup = currentProduct.variants
      .filter(v => v.options.primary === variant.options.primary)
      .map(v => v.id);
    const groupMatch = currentProduct.images.find(i => sameGroup.includes(i.variantId));
    if (groupMatch) { img.src = groupMatch.url; return; }
  }

  // Final fallback: product thumbnail
  img.src = currentProduct.thumbnail || "";
}

function updateModalPrice() {
  if (selectedVariant) {
    document.getElementById('modalPrice').textContent =
      formatPrice(selectedVariant.price, selectedVariant.currency);
  }
}

function updateAddBtn() {
  const btn = document.getElementById('addToCartBtn');
  btn.disabled = !selectedVariant;
  btn.textContent = selectedVariant ? `Add to cart — ${formatPrice(selectedVariant.price * quantity, selectedVariant.currency)}` : 'Select options';
}

function setQty(n) {
  quantity = Math.max(1, Math.min(20, n));
  document.getElementById('qtyVal').textContent = quantity;
  updateAddBtn();
}

function handleAddToCart() {
  if (!selectedVariant || !currentProduct) return;

  addToCart({
    variantId: selectedVariant.id,
    name: currentProduct.name,
    variantLabel: [selectedPrimary, selectedVariant.options?.secondary].filter(Boolean).join(' / '),
    price: selectedVariant.price,
    currency: selectedVariant.currency,
    thumbnail: currentProduct.thumbnail,
    quantity,
  });

  closeModal();
  openCart();
  showToast('Added to cart!');
}

// ═══════════════════════════════════════════
// CART
// ═══════════════════════════════════════════
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CONFIG.CART_KEY, JSON.stringify(cart));
}

function addToCart(item) {
  // Check if same variant already in cart
  const existing = cart.find(i => i.variantId === item.variantId);
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + item.quantity);
  } else {
    cart.push({ ...item });
  }
  saveCart();
  renderCart();
  updateCartCount();
}

function removeFromCart(variantId) {
  cart = cart.filter(i => i.variantId !== variantId);
  saveCart();
  renderCart();
  updateCartCount();
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const totalEl = document.getElementById('cartTotal');

  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    footer.style.display = 'none';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img"
           src="${item.thumbnail || ''}"
           alt="${item.name}"
           onerror="this.style.display='none'" />
      <div>
        <div class="cart-item-name">${item.name}</div>
        ${item.variantLabel ? `<div class="cart-item-variant">${item.variantLabel}</div>` : ''}
        <div class="cart-item-price">
          ${item.quantity} × ${formatPrice(item.price, item.currency)}
        </div>
      </div>
      <button class="cart-item-remove" data-variant="${item.variantId}" aria-label="Remove">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.variant)));
  });

  // Calculate total (assumes single currency — if mixed, use first item's)
  const currency = cart[0]?.currency || 'EUR';
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  totalEl.textContent = formatPrice(total, currency);

  footer.style.display = 'flex';
}

function updateCartCount() {
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const el = document.getElementById('cartCount');
  el.textContent = count;
  el.classList.toggle('visible', count > 0);
}

function initCartUI() {
  document.getElementById('cartToggle').addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
  document.getElementById('checkoutBtn').addEventListener('click', handleCheckout);

  renderCart();
  updateCartCount();
}

function openCart() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartDrawer').setAttribute('aria-hidden', 'false');
}

function closeCart() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartDrawer').setAttribute('aria-hidden', 'true');
}

// ═══════════════════════════════════════════
// STRIPE CHECKOUT
// ═══════════════════════════════════════════
async function handleCheckout() {
  if (cart.length === 0) return;

  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Checkout failed');
    }

    const { sessionId, url } = await res.json();

    // Redirect to Stripe hosted checkout
    if (url) {
      window.location.href = url;
    } else {
      const result = await window._stripe.redirectToCheckout({ sessionId });
      if (result.error) throw new Error(result.error.message);
    }
  } catch (err) {
    console.error('Checkout error:', err);
    showToast(`Error: ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Checkout →';
  }
}

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
function formatPrice(amount, currency = 'EUR') {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount);
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);
      background:var(--surface-2);border:1px solid var(--accent);color:var(--white);
      padding:0.75rem 1.5rem;border-radius:4px;z-index:999;
      font-family:var(--font-mono);font-size:13px;
      transition:opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}