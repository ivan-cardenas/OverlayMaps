/**
 * Overlay Maps Store — store.js
 * Features: search, category filter, country filter, sort, pagination, URL state
 */

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════
const CONFIG = {
  API_BASE: 'https://overlay-maps.vercel.app',
  STRIPE_PK: 'pk_live_51T3JChL50YWJ2vn24GRdCJBcDP0Ggn7mwPUoocxJQZeb1J69H8OYhD5uRYZjsoIKreeWp83oeeUDfj3HFTQS2a7A00mfZUdiy0',
  CART_KEY: 'overlaymaps_cart',
  PAGE_SIZE: 24,
};

const THUMBNAIL_OVERRIDES = {
  // 420536143: 'https://your-custom-image-url.jpg',
};

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let allProducts = [];
let filteredProducts = [];
let activeCategory = 'all';
let activeCountry = 'all';
let activeSearch = '';
let activeSort = 'default';
let currentPage = 1;
let cart = loadCart();
let currentProduct = null;
let selectedPrimary = null;
let selectedVariant = null;
let quantity = 1;
let selectedShippingOption = null;

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initStripe();
  initCartUI();
  initFilterButtons();
  initSearch();
  initSort();
  initModal();
  initPagination();
  readURLState();
  fetchProducts();

  if (new URLSearchParams(location.search).get('canceled')) {
    showToast('Checkout canceled — your cart is still saved.');
  }
});

function initStripe() {
  window._stripe = Stripe(CONFIG.STRIPE_PK);
}

// ═══════════════════════════════════════════
// URL STATE — shareable/bookmarkable filters
// ═══════════════════════════════════════════
function readURLState() {
  const p = new URLSearchParams(location.search);
  if (p.get('category')) activeCategory = p.get('category');
  if (p.get('country')) activeCountry = p.get('country');
  if (p.get('search')) activeSearch = p.get('search');
  if (p.get('sort')) activeSort = p.get('sort');
  if (p.get('page')) currentPage = parseInt(p.get('page')) || 1;

  // Sync UI to URL state
  if (activeSearch) {
    document.getElementById('searchInput').value = activeSearch;
    document.getElementById('searchClear').style.display = 'block';
  }
  if (activeSort !== 'default') {
    document.getElementById('sortSelect').value = activeSort;
  }
  if (activeCategory !== 'all') {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === activeCategory);
    });
  }
}

function pushURLState() {
  const p = new URLSearchParams();
  if (activeCategory !== 'all') p.set('category', activeCategory);
  if (activeCountry !== 'all') p.set('country', activeCountry);
  if (activeSearch) p.set('search', activeSearch);
  if (activeSort !== 'default') p.set('sort', activeSort);
  if (currentPage > 1) p.set('page', currentPage);

  const newUrl = p.toString()
    ? `${location.pathname}?${p.toString()}#catalog`
    : `${location.pathname}#catalog`;
  history.pushState({}, '', newUrl);
}

// ═══════════════════════════════════════════
// FETCH PRODUCTS
// ═══════════════════════════════════════════
async function fetchProducts() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { products } = await res.json();
    allProducts = products;
    buildCountryFilter(products);
    populateNavDropdown(products);
    // Sync country select to URL state
    if (activeCountry !== 'all') {
      document.getElementById('countryFilter').value = activeCountry;
    }
    applyFiltersAndRender();
  } catch (err) {
    console.error('Failed to load products:', err);
    document.getElementById('productGrid').innerHTML = `
      <p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:4rem 0">
        Failed to load products. Please refresh the page.
      </p>`;
  }
}

// ═══════════════════════════════════════════
// FILTER + SORT + SEARCH PIPELINE
// ═══════════════════════════════════════════
function applyFiltersAndRender() {
  let results = [...allProducts];

  // Category filter
  if (activeCategory !== 'all') {
    results = results.filter(p => p.category === activeCategory);
  }

  // Country filter
  if (activeCountry !== 'all') {
    results = results.filter(p => p.country === activeCountry);
  }

  // Search filter
  if (activeSearch.trim()) {
    const q = activeSearch.toLowerCase().trim();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.country && p.country.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }

  // Sort
  switch (activeSort) {
    case 'price-asc':  results.sort((a, b) => a.minPrice - b.minPrice); break;
    case 'price-desc': results.sort((a, b) => b.minPrice - a.minPrice); break;
    case 'name-asc':   results.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'name-desc':  results.sort((a, b) => b.name.localeCompare(a.name)); break;
  }

  filteredProducts = results;

  // Clamp page
  const totalPages = Math.ceil(results.length / CONFIG.PAGE_SIZE);
  if (currentPage > totalPages) currentPage = 1;

  renderPage();
  renderActiveFilterTags();
  pushURLState();
}

// ═══════════════════════════════════════════
// RENDER PAGE (pagination slice)
// ═══════════════════════════════════════════
function renderPage() {
  const grid = document.getElementById('productGrid');
  const countEl = document.getElementById('productCount');
  const total = filteredProducts.length;
  const totalPages = Math.ceil(total / CONFIG.PAGE_SIZE);
  const start = (currentPage - 1) * CONFIG.PAGE_SIZE;
  const pageItems = filteredProducts.slice(start, start + CONFIG.PAGE_SIZE);

  countEl.textContent = `${total} product${total !== 1 ? 's' : ''}`;

  if (total === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:4rem 0">No products found. <button onclick="clearAllFilters()" style="color:var(--accent);background:none;border:none;cursor:pointer;font-family:inherit;font-size:inherit">Clear filters</button></p>`;
    document.getElementById('paginationBar').style.display = 'none';
    return;
  }

  grid.innerHTML = pageItems.map(p => {
    const thumb = THUMBNAIL_OVERRIDES[p.id] || p.thumbnail || '';
    return `
    <article class="product-card" data-id="${p.id}" tabindex="0" role="button" aria-label="${p.name}">
      <div class="product-card-img">
        <img src="${thumb}" alt="${p.name}" loading="lazy" onerror="this.style.display='none'" />
      </div>
      <div class="product-card-body">
        <span class="product-card-cat">${p.category}${p.country ? ` · ${p.country}` : ''}</span>
        <h3 class="product-card-name">${highlightSearch(p.name)}</h3>
        <div class="product-card-price">From <strong>${formatPrice(p.minPrice, p.currency)}</strong></div>
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openModal(parseInt(card.dataset.id)));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openModal(parseInt(card.dataset.id)); });
  });

  updatePageSEO();

  // Pagination
  const bar = document.getElementById('paginationBar');
  if (totalPages <= 1) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
  }
}

function highlightSearch(name) {
  if (!activeSearch.trim()) return name;
  const q = activeSearch.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
}

// ═══════════════════════════════════════════
// ACTIVE FILTER TAGS
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// SEO — dynamic structured data + page title
// ═══════════════════════════════════════════
function updatePageSEO() {
  // Build a context-aware title and description
  let title = 'Overlay Maps — Map Art Prints, Apparel & Stickers';
  let description = 'Shop map art prints, t-shirts, hoodies, and stickers printed on demand. Unique geography-inspired designs for every city and country.';

  const cat = activeCategory !== 'all'
    ? activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)
    : null;

  if (cat && activeCountry !== 'all') {
    title = `${cat} · ${activeCountry} — Overlay Maps`;
    description = `Shop ${activeCategory} with ${activeCountry} map designs from Overlay Maps. Printed on demand.`;
  } else if (cat) {
    title = `${cat} — Overlay Maps`;
    description = `Shop ${activeCategory} with unique geography-inspired map designs. Printed on demand by Overlay Maps.`;
  } else if (activeCountry !== 'all') {
    title = `${activeCountry} Map Products — Overlay Maps`;
    description = `Map prints, apparel, and stickers featuring ${activeCountry}. Printed on demand by Overlay Maps.`;
  } else if (activeSearch) {
    title = `"${activeSearch}" — Overlay Maps`;
    description = `Search results for "${activeSearch}" on Overlay Maps. Map art prints, apparel, and stickers.`;
  }

  document.title = title;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', description);

  // Inject / update JSON-LD ItemList with the full filtered product set
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': title,
    'numberOfItems': filteredProducts.length,
    'itemListElement': filteredProducts.slice(0, 50).map((p, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'item': {
        '@type': 'Product',
        'name': p.name,
        'image': p.thumbnail || '',
        'offers': {
          '@type': 'Offer',
          'price': Number(p.minPrice).toFixed(2),
          'priceCurrency': (p.currency || 'EUR').toUpperCase(),
          'availability': 'https://schema.org/InStock',
          'seller': { '@type': 'Organization', 'name': 'Overlay Maps' },
        },
      },
    })),
  };

  let el = document.getElementById('ld-product-list');
  if (!el) {
    el = document.createElement('script');
    el.id = 'ld-product-list';
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);
}

function renderActiveFilterTags() {
  const container = document.getElementById('activeFilters');
  const tags = [];

  if (activeCategory !== 'all') {
    tags.push(`<button class="filter-tag" onclick="removeCategoryFilter()">
      ${activeCategory} ✕</button>`);
  }
  if (activeCountry !== 'all') {
    tags.push(`<button class="filter-tag" onclick="removeCountryFilter()">
      ${activeCountry} ✕</button>`);
  }
  if (activeSearch) {
    tags.push(`<button class="filter-tag" onclick="removeSearchFilter()">
      "${activeSearch}" ✕</button>`);
  }
  if (activeSort !== 'default') {
    const labels = { 'price-asc': 'Price ↑', 'price-desc': 'Price ↓', 'name-asc': 'A→Z', 'name-desc': 'Z→A' };
    tags.push(`<button class="filter-tag" onclick="removeSortFilter()">
      ${labels[activeSort]} ✕</button>`);
  }

  if (tags.length > 1) {
    tags.push(`<button class="filter-tag filter-tag-clear" onclick="clearAllFilters()">Clear all</button>`);
  }

  container.innerHTML = tags.join('');
}

function removeCategoryFilter() {
  activeCategory = 'all';
  currentPage = 1;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
  applyFiltersAndRender();
}
function removeCountryFilter() {
  activeCountry = 'all';
  currentPage = 1;
  document.getElementById('countryFilter').value = 'all';
  applyFiltersAndRender();
}
function removeSearchFilter() {
  activeSearch = '';
  currentPage = 1;
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  applyFiltersAndRender();
}
function removeSortFilter() {
  activeSort = 'default';
  document.getElementById('sortSelect').value = 'default';
  applyFiltersAndRender();
}
function clearAllFilters() {
  activeCategory = 'all';
  activeCountry = 'all';
  activeSearch = '';
  activeSort = 'default';
  currentPage = 1;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
  document.getElementById('countryFilter').value = 'all';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  document.getElementById('sortSelect').value = 'default';
  applyFiltersAndRender();
}

// ═══════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════
function initSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = input.value;
    clearBtn.style.display = val ? 'block' : 'none';
    debounceTimer = setTimeout(() => {
      activeSearch = val;
      currentPage = 1;
      applyFiltersAndRender();
    }, 250);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    activeSearch = '';
    currentPage = 1;
    applyFiltersAndRender();
    input.focus();
  });
}

// ═══════════════════════════════════════════
// SORT
// ═══════════════════════════════════════════
function initSort() {
  document.getElementById('sortSelect').addEventListener('change', e => {
    activeSort = e.target.value;
    currentPage = 1;
    applyFiltersAndRender();
  });
}

// ═══════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════
function initPagination() {
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      applyFiltersAndRender();
      document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
    }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredProducts.length / CONFIG.PAGE_SIZE);
    if (currentPage < totalPages) {
      currentPage++;
      applyFiltersAndRender();
      document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
    }
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
      currentPage = 1;
      applyFiltersAndRender();
    });
  });
}

function buildCountryFilter(products) {
  const countries = [...new Set(products.map(p => p.country).filter(Boolean))].sort();
  const select = document.getElementById('countryFilter');
  if (!select) return;
  select.innerHTML = `<option value="all">All countries</option>`
    + countries.map(c => `<option value="${c}">${c}</option>`).join('');
  select.addEventListener('change', () => {
    activeCountry = select.value;
    currentPage = 1;
    applyFiltersAndRender();
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
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
    if (product.variants.length === 1) {
      selectedVariant = product.variants[0];
      updateModalImage(selectedVariant);
      updateAddBtn();
    }
    return;
  }

  section.style.display = 'block';
  const firstKey = groupKeys[0];
  const isSizeGroup = /^(xs|s|m|l|xl|xxl|2xl|3xl|\d+x\d+|a\d+|\d+cm)/i.test(firstKey);
  primaryLabel.textContent = isSizeGroup ? 'Size / Dimensions' : 'Option';

  primaryOpts.innerHTML = groupKeys.map(key =>
    `<button class="variant-opt" data-primary="${key}">${key}</button>`
  ).join('');

  primaryOpts.querySelectorAll('.variant-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      primaryOpts.querySelectorAll('.variant-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPrimary = btn.dataset.primary;
      const firstVariant = product.variantGroups[selectedPrimary]?.[0];
      if (firstVariant) updateModalImage(firstVariant);
      renderSecondaryVariants(product, selectedPrimary);
    });
  });

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

  const hasSecondary = variants.some(v => v.options.secondary);

  if (!hasSecondary) {
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
  const img = document.getElementById('modalImage');
  if (variant && currentProduct.images) {
    const match = currentProduct.images.find(i => i.variantId === variant.id);
    if (match) { img.src = match.url; return; }
    const sameGroup = currentProduct.variants
      .filter(v => v.options.primary === variant.options.primary).map(v => v.id);
    const groupMatch = currentProduct.images.find(i => sameGroup.includes(i.variantId));
    if (groupMatch) { img.src = groupMatch.url; return; }
  }
  img.src = THUMBNAIL_OVERRIDES[currentProduct.id] || currentProduct.thumbnail || '';
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
  btn.textContent = selectedVariant
    ? `Add to cart — ${formatPrice(selectedVariant.price * quantity, selectedVariant.currency)}`
    : 'Select options';
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
    catalogVariantId: selectedVariant.catalogVariantId || null,
    name: currentProduct.name,
    variantLabel: [selectedPrimary, selectedVariant.options?.secondary].filter(Boolean).join(' / '),
    price: selectedVariant.price,
    currency: selectedVariant.currency,
    thumbnail: THUMBNAIL_OVERRIDES[currentProduct.id] || currentProduct.thumbnail,
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
  try { return JSON.parse(localStorage.getItem(CONFIG.CART_KEY)) || []; }
  catch { return []; }
}

function saveCart() {
  localStorage.setItem(CONFIG.CART_KEY, JSON.stringify(cart));
}

function addToCart(item) {
  const existing = cart.find(i => i.variantId === item.variantId);
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + item.quantity);
  } else {
    cart.push({ ...item });
  }
  saveCart();
  resetShipping();
  renderCart();
  updateCartCount();
}

function removeFromCart(variantId) {
  cart = cart.filter(i => i.variantId !== variantId);
  saveCart();
  resetShipping();
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
      <img class="cart-item-img" src="${item.thumbnail || ''}" alt="${item.name}"
           onerror="this.style.display='none'" />
      <div>
        <div class="cart-item-name">${item.name}</div>
        ${item.variantLabel ? `<div class="cart-item-variant">${item.variantLabel}</div>` : ''}
        <div class="cart-item-price">${item.quantity} × ${formatPrice(item.price, item.currency)}</div>
      </div>
      <button class="cart-item-remove" data-variant="${item.variantId}" aria-label="Remove">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.variant)));
  });

  const currency = cart[0]?.currency || 'EUR';
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  totalEl.textContent = formatPrice(subtotal, currency);
  footer.style.display = 'flex';
  updateShippingDisplay();

  const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
      checkoutBtn.disabled = !selectedShippingOption;
      checkoutBtn.textContent = selectedShippingOption ? 'Checkout →' : 'Select shipping first';
    }
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
  initShippingEstimator();
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
  
  // Require shipping selection
  if (!selectedShippingOption) {
    showToast('Please calculate and select a shipping option first');
    document.getElementById('shippingCountrySelect')?.focus();
    return;
  }

  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, shippingOption: selectedShippingOption }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Checkout failed');
    }
    const { sessionId, url } = await res.json();
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
      padding:0.75rem 1.5rem;border-radius:4px;z-index:9999;
      font-family:var(--font-mono);font-size:13px;transition:opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// ═══════════════════════════════════════════
// SHIPPING ESTIMATOR
// ═══════════════════════════════════════════
const SHIP_COUNTRIES = [
  ['AR','Argentina'],['AU','Australia'],['AT','Austria'],['BE','Belgium'],
  ['BR','Brazil'],['CA','Canada'],['CO','Colombia'],['DK','Denmark'],
  ['FI','Finland'],['FR','France'],['DE','Germany'],['IE','Ireland'],
  ['IT','Italy'],['JP','Japan'],['KR','South Korea'],['MX','Mexico'],
  ['NL','Netherlands'],['NZ','New Zealand'],['NO','Norway'],['PL','Poland'],
  ['PT','Portugal'],['SG','Singapore'],['ES','Spain'],['SE','Sweden'],
  ['CH','Switzerland'],['GB','United Kingdom'],['US','United States'],
];

function initShippingEstimator() {
  const select = document.getElementById('shippingCountrySelect');
  const calcBtn = document.getElementById('calcShippingBtn');
  if (!select || !calcBtn) return;

  select.innerHTML = '<option value="">Select country\u2026</option>' +
    SHIP_COUNTRIES.map(([code, name]) => `<option value="${code}">${name}</option>`).join('');

  calcBtn.addEventListener('click', calcShipping);
}

async function calcShipping() {
  if (!cart.length) return;
  const country = document.getElementById('shippingCountrySelect')?.value;
  if (!country) { showToast('Please select a country first'); return; }

  const ratesList = document.getElementById('shippingRatesList');
  const calcBtn = document.getElementById('calcShippingBtn');
  if (!ratesList || !calcBtn) return;

  calcBtn.disabled = true;
  calcBtn.textContent = '\u2026';
  ratesList.innerHTML = '<p class="shipping-loading">Calculating\u2026</p>';

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/shipping-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        country_code: country,
        items: cart.map(i => ({ 
  variantId: i.variantId, 
  catalogVariantId: i.catalogVariantId,
  quantity: i.quantity 
})),
      }),
    });
    const { rates, error } = await res.json();

    if (error || !rates?.length) {
      ratesList.innerHTML = `<p class="shipping-error">${error || 'No rates available for this country.'}</p>`;
      return;
    }

    ratesList.innerHTML = rates.map((r, idx) =>
      `<label class="shipping-rate-option">
        <input type="radio" name="shippingRate" value="${r.id}" data-rate='${JSON.stringify(r)}' ${idx === 0 ? 'checked' : ''} />
        <span class="shipping-rate-info">
          <span class="shipping-rate-name">${r.name}</span>
          ${r.minDays ? `<span class="shipping-rate-days">${r.minDays}\u2013${r.maxDays || r.minDays} business days</span>` : ''}
        </span>
        <span class="shipping-rate-price">${formatPrice(r.rate, r.currency)}</span>
      </label>`
    ).join('');

    const firstInput = ratesList.querySelector('input[type="radio"]');
    if (firstInput) {
      selectedShippingOption = JSON.parse(firstInput.dataset.rate);
      updateShippingDisplay();
    }

    ratesList.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        selectedShippingOption = JSON.parse(radio.dataset.rate);
        updateShippingDisplay();
      });
    });
  } catch {
    ratesList.innerHTML = '<p class="shipping-error">Failed to calculate shipping. Please try again.</p>';
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = 'Calculate';
  }
}

function resetShipping() {
  selectedShippingOption = null;
  const ratesList = document.getElementById('shippingRatesList');
  if (ratesList) ratesList.innerHTML = '';
  updateShippingDisplay();
}

function updateShippingDisplay() {
  const shippingRow = document.getElementById('shippingTotalRow');
  const grandTotalRow = document.getElementById('grandTotalRow');
  const shippingNote = document.getElementById('shippingNote');
  if (!shippingRow || !grandTotalRow) return;

  if (selectedShippingOption && cart.length) {
    const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const currency = cart[0]?.currency || 'EUR';
    document.getElementById('shippingTotalLabel').textContent = selectedShippingOption.name;
    document.getElementById('shippingTotal').textContent = formatPrice(selectedShippingOption.rate, selectedShippingOption.currency);
    document.getElementById('grandTotal').innerHTML = `<strong>${formatPrice(subtotal + selectedShippingOption.rate, currency)}</strong>`;
    shippingRow.style.display = 'flex';
    grandTotalRow.style.display = 'flex';
    if (shippingNote) shippingNote.style.display = 'none';
  } else {
    shippingRow.style.display = 'none';
    grandTotalRow.style.display = 'none';
    if (shippingNote) shippingNote.style.display = 'block';
  }

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.disabled = !selectedShippingOption || cart.length === 0;
    checkoutBtn.textContent = selectedShippingOption ? 'Checkout →' : 'Select shipping first';
  }
}

// ═══════════════════════════════════════════
// NAV PRODUCTS DROPDOWN
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

function populateNavDropdown(products) {
  const menu = document.getElementById('navProductsMenu');
  const btn = document.getElementById('navProductsBtn');
  if (!menu || !btn) return;

  // Group products by category
  const categories = {};
  products.forEach(p => {
    const cat = p.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  });

  let html = '';
  Object.entries(categories).forEach(([cat, items]) => {
    html += `<div class="nav-dropdown-heading">${cat.charAt(0).toUpperCase() + cat.slice(1)}</div>`;
    items.forEach(p => {
      html += `<a class="nav-dropdown-item" href="/products/${slugify(p.name)}/">${p.name}</a>`;
    });
  });
  menu.innerHTML = html;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    menu.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
    menu.setAttribute('aria-hidden', String(isOpen));
  });

  document.addEventListener('click', () => {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
  });
}