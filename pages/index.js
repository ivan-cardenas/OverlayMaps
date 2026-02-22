import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ProductCard from '../components/ProductCard';
import FilterBar from '../components/FilterBar';
import ProductModal from '../components/ProductModal';
import CartDrawer from '../components/CartDrawer';
import { fetchPrintfulCatalog } from '../lib/printful';

const PAGE_SIZE = 24;
const DEFAULT_FILTERS = { category: 'all', country: 'all', search: '', sort: 'default' };

export default function StorePage({ products }) {
  const router = useRouter();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [modalProduct, setModalProduct] = useState(null);
  const [mounted, setMounted] = useState(false);

  // Hydrate filters from URL on first render
  useEffect(() => {
    const { category = 'all', country = 'all', search = '', sort = 'default', page: p = '1' } =
      router.query;
    setFilters({ category, country, search, sort });
    setPage(parseInt(p) || 1);
    setMounted(true);
  }, []);

  // Sync URL when filters change (shallow, no page reload)
  useEffect(() => {
    if (!mounted) return;
    const params = {};
    if (filters.category !== 'all') params.category = filters.category;
    if (filters.country !== 'all') params.country = filters.country;
    if (filters.search) params.search = filters.search;
    if (filters.sort !== 'default') params.sort = filters.sort;
    if (page > 1) params.page = page;
    router.replace({ pathname: '/', query: params }, undefined, { shallow: true });
  }, [filters, page, mounted]);

  const countries = useMemo(
    () => [...new Set(products.map((p) => p.country).filter(Boolean))].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    let results = [...products];
    if (filters.category !== 'all')
      results = results.filter((p) => p.category === filters.category);
    if (filters.country !== 'all')
      results = results.filter((p) => p.country === filters.country);
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.country?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
    }
    switch (filters.sort) {
      case 'price-asc': results.sort((a, b) => a.minPrice - b.minPrice); break;
      case 'price-desc': results.sort((a, b) => b.minPrice - a.minPrice); break;
      case 'name-asc': results.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': results.sort((a, b) => b.name.localeCompare(a.name)); break;
    }
    return results;
  }, [products, filters]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  // Build SEO title/description based on active filters
  const cat =
    filters.category !== 'all'
      ? filters.category.charAt(0).toUpperCase() + filters.category.slice(1)
      : null;
  let title = 'Overlay Maps — Map Art Prints, Apparel & Stickers';
  let description =
    'Shop map art prints, t-shirts, hoodies, and stickers printed on demand. Unique geography-inspired designs for every city and country.';
  if (cat && filters.country !== 'all') {
    title = `${cat} · ${filters.country} — Overlay Maps`;
    description = `Shop ${filters.category} with ${filters.country} map designs from Overlay Maps. Printed on demand.`;
  } else if (cat) {
    title = `${cat} — Overlay Maps`;
    description = `Shop ${filters.category} with unique geography-inspired map designs. Printed on demand by Overlay Maps.`;
  } else if (filters.country !== 'all') {
    title = `${filters.country} Map Products — Overlay Maps`;
    description = `Map prints, apparel, and stickers featuring ${filters.country}. Printed on demand by Overlay Maps.`;
  }

  const storeSchema = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: 'Overlay Maps',
    description: 'Map art prints, t-shirts, hoodies, and stickers. Where geography meets art.',
    url: 'https://overlaymaps.com',
    image: 'https://overlaymaps.com/img/og-cover.jpg',
    currenciesAccepted: 'EUR',
    paymentAccepted: 'Credit Card',
    sameAs: ['https://www.instagram.com/overlaymaps'],
  };

  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    numberOfItems: filtered.length,
    itemListElement: filtered.slice(0, 50).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        image: p.thumbnail || '',
        url: `https://overlaymaps.com/products/${p.slug}`,
        offers: {
          '@type': 'Offer',
          price: p.minPrice.toFixed(2),
          priceCurrency: (p.currency || 'EUR').toUpperCase(),
          availability: 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'Overlay Maps' },
        },
      },
    })),
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://overlaymaps.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Overlay Maps" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content="https://overlaymaps.com/" />
        <meta property="og:image" content="https://overlaymaps.com/img/og-cover.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@overlaymaps" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:image" content="https://overlaymaps.com/img/og-cover.jpg" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(storeSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listSchema) }}
        />
      </Head>

      <Header />

      <section className="hero">
        <div className="hero-grid-bg" />
        <div className="hero-content">
          <p className="hero-eyebrow">Where Geo meets Art</p>
          <h1 className="hero-title">
            Maps
            <br />
            <em>your way</em>
          </h1>
          <p className="hero-sub">
            Posters, shirts, stickers — all printed on demand.
            <br />
            Every map tells a story.
          </p>
          <a href="#catalog" className="btn-primary">
            Shop the collection
          </a>
        </div>
        <div className="hero-visual">
          <div className="map-lines" />
        </div>
      </section>

      <FilterBar
        filters={filters}
        countries={countries}
        productCount={filtered.length}
        onFilter={(cat) => setFilter('category', cat)}
        onSearch={(val) => setFilter('search', val)}
        onCountryChange={(val) => setFilter('country', val)}
        onSortChange={(val) => setFilter('sort', val)}
        onClearAll={clearAll}
      />

      <main className="product-grid" id="productGrid">
        {pageItems.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            searchQuery={filters.search}
            onClick={() => setModalProduct(p)}
          />
        ))}
        {pageItems.length === 0 && (
          <p
            style={{
              color: 'var(--text-muted)',
              gridColumn: '1/-1',
              textAlign: 'center',
              padding: '4rem 0',
            }}
          >
            No products found.{' '}
            <button
              style={{
                color: 'var(--accent)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onClick={clearAll}
            >
              Clear filters
            </button>
          </p>
        )}
      </main>

      {totalPages > 1 && (
        <div className="pagination-bar">
          <button
            className="pagination-btn"
            disabled={page === 1}
            onClick={() => {
              setPage((p) => p - 1);
              document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            ← Prev
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={page === totalPages}
            onClick={() => {
              setPage((p) => p + 1);
              document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Next →
          </button>
        </div>
      )}

      {modalProduct && (
        <ProductModal product={modalProduct} onClose={() => setModalProduct(null)} />
      )}

      <CartDrawer />
      <Footer />
    </>
  );
}

export async function getStaticProps() {
  const products = await fetchPrintfulCatalog();
  return {
    props: { products },
    revalidate: 300, // re-generate every 5 minutes
  };
}
