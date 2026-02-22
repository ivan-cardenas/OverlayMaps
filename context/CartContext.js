import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);
const CART_KEY = 'overlaymaps_cart';

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CART_KEY)) || [];
      setCart(stored);
    } catch {}
  }, []);

  function saveCart(newCart) {
    setCart(newCart);
    localStorage.setItem(CART_KEY, JSON.stringify(newCart));
  }

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      const next = existing
        ? prev.map((i) =>
            i.variantId === item.variantId
              ? { ...i, quantity: Math.min(20, i.quantity + item.quantity) }
              : i
          )
        : [...prev, item];
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  }

  function removeFromCart(variantId) {
    setCart((prev) => {
      const next = prev.filter((i) => i.variantId !== variantId);
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  }

  function clearCart() {
    setCart([]);
    localStorage.removeItem(CART_KEY);
  }

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const cartCurrency = cart[0]?.currency || 'EUR';

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        clearCart,
        cartCount,
        cartTotal,
        cartCurrency,
        cartOpen,
        setCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
