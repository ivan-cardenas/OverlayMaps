import '../styles/store.css';
import { CartProvider } from '../context/CartContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function App({ Component, pageProps }) {
  return (
    <CartProvider>
      <Component {...pageProps} />
      <Analytics />
      <SpeedInsights />
    </CartProvider>
  );
}
