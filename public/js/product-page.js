/**
 * Overlay Maps — Product Page JS
 * Handles: variant selection, image gallery, cart, shipping estimator, checkout.
 * window.PRODUCT must be set before this module loads.
 */

const PRODUCT = window.PRODUCT;

const CONFIG = {
  API_BASE: 'https://overlay-maps.vercel.app',
  STRIPE_PK: 'pk_live_51QsNPRL50YWJ2vn2WmXXYkWHFyQKm5kH9HjN8D8i5GpLi7KQKZL0sAh55nzRRqcf7dvVJZ5SyBg0ZhOuPDhm7Rma00xr5IBa3',
  CART_KEY: 'overlaymaps_cart',
};

window._stripe = Stripe(CONFIG.STRIPE_PK);

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let selectedPrimary = null;
let selectedVariant = null;
let quantity = 1;
let cart = loadCart();
let selectedShippingOption = null;

// ═══════════════════════════════════════════
// SHIPPING COUNTRIES
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

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
// Expose setMainImage globally for onclick handlers in the HTML
window.setMainImage = function(url, btn) {
  document.getElementById('mainProductImage').src = url;
  document.querySelectorAll('.product-thumb-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
};

document.addEventListener('DOMContentLoaded', () => {
  initVariants();
  initQty();
  document.getElementById('addToCartBtn').addEventListener('click', handleAddToCart);
  initCartUI();
  initShippingEstimator();
});

// ═══════════════════════════════════════════
// VARIANT SELECTION
// ═══════════════════════════════════════════
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
  const isSizeGroup = /^(xs|s|m|l|xl|xxl|2xl|3xl|\d+x\d+|a\d+|\d+cm)/i.test(groupKeys[0]);
  primaryLabel.textContent = isSizeGroup ? 'Size / Dimensions' : 'Option';

  primaryOpts.innerHTML = groupKeys.map(key =>
    `<button class="variant-opt" data-primary="${key}">${key}</button>`
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
  const secondaryLabel = document.getElementById('secondaryLabel');
  selectedVariant = null;
  updateAddBtn();

  const hasSecondary = variants.some(v => v.options?.secondary);
  if (!hasSecondary) {
    secondarySection.style.display = 'none';
    selectedVariant = variants[0];
    updatePrice();
    updateAddBtn();
    return;
  }

  secondarySection.style.display = 'block';
  // Detect if secondaries are sizes
  const isSizes = /^(xs|s|m|l|xl|xxl|2xl|3xl|\d+)/i.test(variants[0]?.options?.secondary || '');
  secondaryLabel.textContent = isSizes ? 'Size' : 'Color';

  secondaryOpts.innerHTML = variants.map(v =>
    `<button class="variant-opt ${v.available ? '' : 'unavailable'}"
             data-id="${v.id}"
             ${v.available ? '' : 'disabled'}>
       ${v.options?.secondary || v.name}
     </button>`
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
  if (!selectedVariant) return;
  document.getElementById('productPrice').innerHTML =
    `<strong>${formatPrice(selectedVariant.price * quantity, selectedVariant.currency)}</strong>`;
}

function updateAddBtn() {
  const btn = document.getElementById('addToCartBtn');
  btn.disabled = !selectedVariant;
  btn.textContent = selectedVariant
    ? `Add to cart — ${formatPrice(selectedVariant.price * quantity, selectedVariant.currency)}`
    : 'Select options';
}

// ═══════════════════════════════════════════
// QUANTITY
// ═══════════════════════════════════════════
function initQty() {
  document.getElementById('qtyMinus').addEventListener('click', () => setQty(quantity - 1));
  document.getElementById('qtyPlus').addEventListener('click', () => setQty(quantity + 1));
}

function setQty(n) {
  quantity = Math.max(1, Math.min(20, n));
  document.getElementById('qtyVal').textContent = quantity;
  updateAddBtn();
}

// ═══════════════════════════════════════════
// ADD TO CART
// ═══════════════════════════════════════════
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
  resetShipping();
  renderCart();
  updateCartCount();
  openCart();
  showToast('Added to cart!');
}

// ═══════════════════════════════════════════
// CART
// ═══════════════════════════════════════════
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

  container.innerHTML = cart.map(item =>
    `<div class="cart-item">
      <img class="cart-item-img" src="${item.thumbnail || ''}" alt="${item.name}" onerror="this.hidden=true" />
      <div>
        <div class="cart-item-name">${item.name}</div>
        ${item.variantLabel ? `<div class="cart-item-variant">${item.variantLabel}</div>` : ''}
        <div class="cart-item-price">${item.quantity} \u00d7 ${formatPrice(item.price, item.currency)}</div>
      </div>
      <button class="cart-item-remove" data-variant="${item.variantId}" aria-label="Remove">\u2715</button>
    </div>`
  ).join('');

  container.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      cart = cart.filter(i => i.variantId !== parseInt(btn.dataset.variant));
      saveCart();
      resetShipping();
      renderCart();
      updateCartCount();
    });
  });

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const currency = cart[0]?.currency || 'EUR';
  totalEl.textContent = formatPrice(subtotal, currency);
  footer.style.display = 'flex';
  updateShippingDisplay();
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
  renderCart();
  updateCartCount();
}

function openCart() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
}
function closeCart() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
}

// ═══════════════════════════════════════════
// SHIPPING ESTIMATOR
// ═══════════════════════════════════════════
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
        items: cart.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
      }),
    });
    const { rates, error } = await res.json();

    if (error || !rates?.length) {
      ratesList.innerHTML = `<p class="shipping-error">${error || 'No shipping rates available for this country.'}</p>`;
      return;
    }

    ratesList.innerHTML = rates.map((r, idx) =>
      `<label class="shipping-rate-option">
        <input type="radio" name="shippingRate" value="${r.id}" data-rate='${JSON.stringify(r)}' ${idx === 0 ? 'checked' : ''} />
        <span class="shipping-rate-info">
          <span class="shipping-rate-name">${r.name}</span>
          ${r.minDays ? `<span class="shipping-rate-days">${r.minDays}–${r.maxDays || r.minDays} business days</span>` : ''}
        </span>
        <span class="shipping-rate-price">${formatPrice(r.rate, r.currency)}</span>
      </label>`
    ).join('');

    // Auto-select the first (usually cheapest) option
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
}

// ═══════════════════════════════════════════
// CHECKOUT
// ═══════════════════════════════════════════
async function handleCheckout() {
  if (!cart.length) return;
  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true;
  btn.textContent = 'Loading\u2026';
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, shippingOption: selectedShippingOption }),
    });
    const { url, sessionId } = await res.json();
    if (url) { window.location.href = url; return; }
    const result = await window._stripe.redirectToCheckout({ sessionId });
    if (result.error) throw result.error;
  } catch (err) {
    showToast('Error: ' + (err.message || err));
    btn.disabled = false;
    btn.textContent = 'Checkout \u2192';
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
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--accent);color:var(--white);padding:.75rem 1.5rem;border-radius:4px;z-index:9999;font-family:var(--font-mono);font-size:13px;transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}
