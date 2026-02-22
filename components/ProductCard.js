import { formatPrice } from '../lib/utils';

export default function ProductCard({ product, onClick, searchQuery }) {
  function highlight(name) {
    if (!searchQuery?.trim()) return name;
    const q = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = name.split(new RegExp(`(${q})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={i}>{part}</mark>
      ) : (
        part
      )
    );
  }

  return (
    <article
      className="product-card"
      tabIndex={0}
      role="button"
      aria-label={product.name}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
    >
      <div className="product-card-img">
        {product.thumbnail && (
          <img
            src={product.thumbnail}
            alt={product.name}
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}
      </div>
      <div className="product-card-body">
        <span className="product-card-cat">
          {product.category}
          {product.country ? ` · ${product.country}` : ''}
        </span>
        <h3 className="product-card-name">{highlight(product.name)}</h3>
        <div className="product-card-price">
          From <strong>{formatPrice(product.minPrice, product.currency)}</strong>
        </div>
      </div>
    </article>
  );
}
