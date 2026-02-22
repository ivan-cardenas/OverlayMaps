import { useState } from 'react';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/utils';

export default function CartDrawer() {
  const { cart, removeFromCart, cartTotal, cartCurrency, cartOpen, setCartOpen } = useCart();
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Checkout failed');
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Checkout error:', err);
      alert(`Error: ${err.message}`);
      setLoading(false);
    }
  }

  return (
    <>
      {cartOpen && (
        <div className="cart-overlay open" onClick={() => setCartOpen(false)} />
      )}
      <aside
        className={`cart-drawer${cartOpen ? ' open' : ''}`}
        aria-hidden={!cartOpen}
      >
        <div className="cart-header">
          <h2>Your Cart</h2>
          <button className="cart-drawer-close" onClick={() => setCartOpen(false)}>
            ✕
          </button>
        </div>

        <div className="cart-items">
          {cart.length === 0 ? (
            <p className="cart-empty">Your cart is empty.</p>
          ) : (
            cart.map((item) => (
              <div key={item.variantId} className="cart-item">
                <img
                  className="cart-item-img"
                  src={item.thumbnail || ''}
                  alt={item.name}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <div>
                  <div className="cart-item-name">{item.name}</div>
                  {item.variantLabel && (
                    <div className="cart-item-variant">{item.variantLabel}</div>
                  )}
                  <div className="cart-item-price">
                    {item.quantity} × {formatPrice(item.price, item.currency)}
                  </div>
                </div>
                <button
                  className="cart-item-remove"
                  aria-label="Remove"
                  onClick={() => removeFromCart(item.variantId)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-footer" style={{ display: 'flex' }}>
            <div className="cart-total-row">
              <span>Subtotal</span>
              <span>{formatPrice(cartTotal, cartCurrency)}</span>
            </div>
            <p className="cart-shipping-note">Shipping calculated at checkout</p>
            <button
              className="btn-primary btn-full"
              onClick={handleCheckout}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Checkout →'}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
