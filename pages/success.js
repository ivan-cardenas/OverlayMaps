import { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
import { useCart } from '../context/CartContext';

export default function SuccessPage() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
  }, []);

  return (
    <>
      <Head>
        <title>Order Confirmed — Overlay Maps</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <Header />

      <main className="success-page">
        <div className="success-box">
          <div className="success-icon">◈</div>
          <h1>Order Confirmed!</h1>
          <p>
            Thank you for your order. We&apos;ve sent the details to Printful and your
            items will be in production shortly.
          </p>
          <p>You&apos;ll receive a shipping confirmation email once your order is on its way.</p>
          <Link href="/" className="btn-primary" style={{ marginTop: '2rem', display: 'inline-block' }}>
            Back to shop
          </Link>
        </div>
      </main>
    </>
  );
}
