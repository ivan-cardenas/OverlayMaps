import Link from 'next/link';
import { useCart } from '../context/CartContext';

export default function Header() {
  const { cartCount, setCartOpen } = useCart();

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="logo">
          <span className="logo-mark">◈</span>
          <span className="logo-text">Overlay Maps</span>
        </Link>
        <nav className="main-nav">
          <Link href="/?category=apparel">Apparel</Link>
          <Link href="/?category=posters">Posters</Link>
          <Link href="/?category=stickers">Stickers</Link>
          <Link href="/?category=stationary">Stationery</Link>
        </nav>
        <button
          className="cart-btn"
          onClick={() => setCartOpen(true)}
          aria-label="Open cart"
        >
          <span className="cart-icon">◫</span>
          <span className={`cart-count${cartCount > 0 ? ' visible' : ''}`}>
            {cartCount}
          </span>
        </button>
      </div>
    </header>
  );
}
