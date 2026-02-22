import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import CartDrawer from '../../components/CartDrawer';
import { useCart } from '../../context/CartContext';
import { fetchPrintfulCatalog, fetchProductById } from '../../lib/printful';
import { formatPrice } from '../../lib/utils';

const SIZE_RE = /^(xs|s|m|l|xl|xxl|2xl|3xl|\d+x\d+|a\d+|\d+cm)/i;

export default function ProductPage({ product }) {
  const { addToCart, setCartOpen } = useCart();
  const [selectedPrimary, setSelectedPrimary] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState(product.thumbnail || '');

  const groupKeys = Object.keys(product.variantGroups);
  const primaryLabel = groupKeys.length > 0 && SIZE_RE.test(groupKeys[0]) ? 'Size / Dimensions' : 'Option';

  function resolveImage(variant) {
    const exact = product.images.find((i) => i.variantId === variant.id);
    if (exact) return exact.url;
    const sameGroupIds = product.variants
      .filter((v) => v.options.primary === variant.options.primary)
      .map((v) => v.id);
    const groupMatch = product.images.find((i) => sameGroupIds.includes(i.variantId));
    return groupMatch?.url || product.thumbnail || '';
  }

  function selectPrimary(key) {
    setSelectedPrimary(key);
    setSelectedVariant(null);
    const variants = product.variantGroups[key] || [];
    if (variants[0]) setCurrentImage(resolveImage(variants[0]));
    const hasSecondary = variants.some((v) => v.options.secondary);
    if (!hasSecondary) setSelectedVariant(variants[0] || null);
  }

  function selectSecondary(variantId) {
    const variant = product.variants.find((v) => v.id === variantId);
    setSelectedVariant(variant);
    setCurrentImage(resolveImage(variant));
  }

  function handleAddToCart() {
    if (!selectedVariant) return;
    addToCart({
      variantId: selectedVariant.id,
      name: product.name,
      variantLabel: [selectedPrimary, selectedVariant.options?.secondary]
        .filter(Boolean)
        .join(' / '),
      price: selectedVariant.price,
      currency: selectedVariant.currency,
      thumbnail: product.thumbnail,
      quantity,
    });
    setCartOpen(true);
  }

  const secondaryVariants = selectedPrimary ? product.variantGroups[selectedPrimary] : [];
  const hasSecondary = secondaryVariants.some((v) => v.options.secondary);

  const title = `${product.name} — Overlay Maps`;
  const description = `Buy the ${product.name}. From ${formatPrice(product.minPrice, product.currency)}. Printed on demand by Overlay Maps.`;
  const canonicalUrl = `https://overlaymaps.com/products/${product.slug}`;
  const ogImage = product.thumbnail || 'https://overlaymaps.com/img/og-cover.jpg';

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.thumbnail,
    description: `${product.name} — geography-inspired map design. Printed on demand by Overlay Maps.`,
    brand: { '@type': 'Brand', name: 'Overlay Maps' },
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: product.minPrice.toFixed(2),
      highPrice: product.maxPrice.toFixed(2),
      priceCurrency: product.currency.toUpperCase(),
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'Overlay Maps' },
    },
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImage} />
        <meta property="product:price:amount" content={product.minPrice.toFixed(2)} />
        <meta property="product:price:currency" content={product.currency.toUpperCase()} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:image" content={ogImage} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
      </Head>

      <Header />

      <main style={{ maxWidth: 1280, margin: '3rem auto', padding: '0 2rem' }}>
        <Link
          href="/"
          style={{ color: 'var(--text-muted)', fontSize: 13, display: 'inline-block', marginBottom: '2rem' }}
        >
          ← Back to shop
        </Link>

        <div
          className="modal-box"
          style={{
            position: 'static',
            maxWidth: 840,
            margin: '0 auto',
            maxHeight: 'none',
            overflow: 'visible',
          }}
        >
          <div className="modal-image-wrap">
            <img className="modal-image" src={currentImage} alt={product.name} />
          </div>

          <div className="modal-details">
            <p className="modal-category">
              {product.category}
              {product.country ? ` · ${product.country}` : ''}
            </p>
            <h1 className="modal-title">{product.name}</h1>
            <p className="modal-price">
              {selectedVariant
                ? formatPrice(selectedVariant.price, selectedVariant.currency)
                : `From ${formatPrice(product.minPrice, product.currency)}`}
            </p>

            {groupKeys.length > 0 && (
              <div className="variant-section">
                <label className="variant-label">{primaryLabel}</label>
                <div className="variant-options">
                  {groupKeys.map((key) => (
                    <button
                      key={key}
                      className={`variant-opt${selectedPrimary === key ? ' selected' : ''}`}
                      onClick={() => selectPrimary(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasSecondary && selectedPrimary && (
              <div className="variant-section">
                <label className="variant-label">Color</label>
                <div className="variant-options">
                  {secondaryVariants.map((v) => (
                    <button
                      key={v.id}
                      className={`variant-opt${selectedVariant?.id === v.id ? ' selected' : ''}${!v.available ? ' unavailable' : ''}`}
                      disabled={!v.available}
                      onClick={() => v.available && selectSecondary(v.id)}
                    >
                      {v.options.secondary || v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="qty-row">
              <label className="variant-label">Quantity</label>
              <div className="qty-control">
                <button
                  className="qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="qty-val">{quantity}</span>
                <button
                  className="qty-btn"
                  onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                >
                  +
                </button>
              </div>
            </div>

            <button
              className="btn-primary btn-full"
              disabled={!selectedVariant}
              onClick={handleAddToCart}
            >
              {selectedVariant
                ? `Add to cart — ${formatPrice(
                    selectedVariant.price * quantity,
                    selectedVariant.currency
                  )}`
                : 'Select options'}
            </button>
            <p className="modal-note">Printed &amp; shipped by Printful</p>
          </div>
        </div>
      </main>

      <CartDrawer />
      <Footer />
    </>
  );
}

export async function getStaticPaths() {
  const products = await fetchPrintfulCatalog();
  return {
    paths: products.map((p) => ({ params: { slug: p.slug } })),
    fallback: 'blocking', // new products appear without a rebuild
  };
}

export async function getStaticProps({ params }) {
  const id = parseInt(params.slug.split('-')[0], 10);
  const product = await fetchProductById(id);
  if (!product) return { notFound: true };
  return {
    props: { product },
    revalidate: 300,
  };
}
