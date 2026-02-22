import { useRef, useState, useEffect } from 'react';

const CATEGORIES = ['all', 'apparel', 'posters', 'stickers', 'stationary'];
const SORT_LABELS = {
  'price-asc': 'Price ↑',
  'price-desc': 'Price ↓',
  'name-asc': 'A→Z',
  'name-desc': 'Z→A',
};

export default function FilterBar({
  filters,
  countries,
  productCount,
  onFilter,
  onSearch,
  onCountryChange,
  onSortChange,
  onClearAll,
}) {
  const debounceRef = useRef(null);
  const [searchVal, setSearchVal] = useState(filters.search);

  // Keep local search input in sync when parent clears all filters
  useEffect(() => {
    setSearchVal(filters.search);
  }, [filters.search]);

  function handleSearchInput(e) {
    const val = e.target.value;
    setSearchVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(val), 250);
  }

  function clearSearch() {
    setSearchVal('');
    onSearch('');
  }

  const activeCount = [
    filters.category !== 'all',
    filters.country !== 'all',
    !!filters.search,
    filters.sort !== 'default',
  ].filter(Boolean).length;

  return (
    <section className="catalog-header" id="catalog">
      <div className="search-row">
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            type="search"
            className="search-input"
            placeholder="Search maps, cities, countries…"
            value={searchVal}
            onChange={handleSearchInput}
            autoComplete="off"
          />
          {searchVal && (
            <button className="search-clear" aria-label="Clear" onClick={clearSearch}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="filter-row">
        <div className="filter-bar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`filter-btn${filters.category === cat ? ' active' : ''}`}
              data-cat={cat}
              onClick={() => onFilter(cat)}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
        <div className="sort-controls">
          <select
            className="country-select"
            value={filters.country}
            onChange={(e) => onCountryChange(e.target.value)}
          >
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="country-select"
            value={filters.sort}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="default">Sort: Default</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
          </select>
        </div>
      </div>

      <div className="results-bar">
        <span className="product-count">
          {productCount} product{productCount !== 1 ? 's' : ''}
        </span>
        <div className="active-filters">
          {filters.category !== 'all' && (
            <button className="filter-tag" onClick={() => onFilter('all')}>
              {filters.category} ✕
            </button>
          )}
          {filters.country !== 'all' && (
            <button className="filter-tag" onClick={() => onCountryChange('all')}>
              {filters.country} ✕
            </button>
          )}
          {filters.search && (
            <button className="filter-tag" onClick={clearSearch}>
              &ldquo;{filters.search}&rdquo; ✕
            </button>
          )}
          {filters.sort !== 'default' && (
            <button className="filter-tag" onClick={() => onSortChange('default')}>
              {SORT_LABELS[filters.sort]} ✕
            </button>
          )}
          {activeCount > 1 && (
            <button className="filter-tag filter-tag-clear" onClick={onClearAll}>
              Clear all
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
