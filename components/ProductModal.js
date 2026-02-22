import { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/utils';

const SIZE_RE = /^(xs|s|m|l|xl|xxl|2xl|3xl|\d+x\d+|a\d+|\d+cm)/i;

export default function ProductModal({ product, onClose }) {
  const { addToCart, setCartOpen } = useCart();
  const [selectedPrimary, setSelectedPrimary] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState('');

  const groupKeys = product ? Object.keys(product.variantGroups) : [];
  const primaryLabel = groupKeys.length > 0 && SIZE_RE.test(groupKeys[0]) ? 'Size / Dimensions' : 'Option';

  useEffect(() => {
    if (!product) return;
    setSelectedPrimary(null);
    setSelectedVariant(null);
    setQuantity(1);
    setCurrentImage(product.thumbnail || '');

    // Auto-select when there's only one option group
    if (groupKeys.length === 1) {
      selectPrimary(groupKeys[0], product);
    }
    // Auto-select when there are no variant groups at all
    if (groupKeys.length === 0 && product.variants.length === 1) {
      setSelectedVariant(product.variants[0]);
    }
  }, [product?.id]);

  function resolveImage(variant, p = product) {
    if (!p || !variant) return p?.thumbnail || '';
    const exact = p.images.find((i) => i.variantId === variant.id);
    if (exact) return exact.url;
    const sameGroupIds = p.variants
      .filter((v) => v.options.primary === variant.options.primary)
      .map((v) => v.id);
    const groupMatch = p.images.find((i) => sameGroupIds.includes(i.variantId));
    return groupMatch?.url || p.thumbnail || '';
  }

  function selectPrimary(key, p = product) {
    setSelectedPrimary(key);
    setSelectedVariant(null);
    const variants = p.variantGroups[key] || [];
    if (variants[0]) setCurrentImage(resolveImage(variants[0], p));
    const hasSecondary = variants.some((v) => v.options.secondary);
    if (!hasSecondary) setSelectedVariant(variants[0] || null);
  }

  function selectSecondary(variantId) {
    const variant = product.variants.find((v) => v.id === variantId);
    setSelectedVariant(variant);
    setCurrentImage(resolveImage(variant));
  }

  function handleAddToCart() {
    if (!selectedVariant || !product) return;
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
    onClose();
    setCartOpen(true);
  }

  if (!product) return null;

  const secondaryVariants = selectedPrimary ? product.variantGroups[selectedPrimary] : [];
  const hasSecondary = secondaryVariants.some((v) => v.options.secondary);
  const addBtnLabel = selectedVariant
    ? `Add to cart — ${formatPrice(selectedVariant.price * quantity, selectedVariant.currency)}`
    : 'Select options';

  return (
    <div
      className="modal-overlay open"
      aria-hidden="false"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>

        <div className="modal-image-wrap">
          <img className="modal-image" src={currentImage} alt={product.name} />
        </div>

        <div className="modal-details">
          <p className="modal-category">{product.category}</p>
          <h2 className="modal-title">{product.name}</h2>
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
            {addBtnLabel}
          </button>
          <p className="modal-note">Printed &amp; shipped by Printful</p>
        </div>
      </div>
    </div>
  );
}
