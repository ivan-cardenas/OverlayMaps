# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Overlay Maps** is a geography-inspired map art print-on-demand e-commerce store. It uses a static vanilla JS frontend with Vercel serverless API functions, Stripe for payments, and Printful for order fulfillment.

## Commands

```bash
# Generate static product pages, sitemap.xml, and robots.txt from Printful catalog
npm run build:seo
```

No lint, test, or frontend build commands — there is no bundler or test framework.

## Architecture

### Stack

- **Frontend:** Vanilla JavaScript + plain CSS. No framework, no bundler, no SASS. ES modules served directly in browser.
- **Backend:** Vercel Serverless Functions (Node.js 24.x, ES modules)
- **Payments:** Stripe (hosted checkout flow)
- **Fulfillment:** Printful print-on-demand API
- **Hosting:** Vercel (API + static), GitHub Pages (static fallback)

### Key Directories

- `api/` — Vercel serverless functions, each file is an API route
- `public/` — Static frontend served by Vercel
- `public/js/` — Frontend JS (store.js = main store UI, product-page.js = individual product pages)
- `public/css/store.css` — Single comprehensive stylesheet with CSS variables
- `public/products/` — Statically generated product pages (one per product, built by `build-seo.js`)
- `scripts/build-seo.js` — Builds static product pages + SEO files from the Printful catalog

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/products` | GET | Fetch Printful catalog with variants, pricing, categories |
| `/api/create-checkout` | POST | Create Stripe checkout session from cart |
| `/api/webhook` | POST | Stripe webhook → create Printful order on payment |
| `/api/shipping-rates` | POST | Calculate Printful shipping costs for a cart + country |

### Data & Payment Flow

1. Frontend fetches `/api/products` → Printful catalog enriched with category (inferred from product name) and country tags
2. Cart stored in `localStorage` (`overlaymaps_cart`); filters/pagination reflected in URL query params
3. Checkout: `POST /api/create-checkout` → Stripe hosted checkout → webhook → Printful order creation
4. Shipping: cart sends country + items to `/api/shipping-rates` → API resolves `sync_variant_id` to `catalog_variant_id` → Printful shipping API → rates returned to UI
5. Webhook uses `external_id` on Printful orders for idempotency (prevents duplicate orders)
6. Handles both synchronous (card) and async (iDEAL, SEPA) payment confirmations

### Frontend State Pattern

- Global variables in `store.js` (`allProducts`, `cart`, `activeCategory`, etc.)
- URL query params persist filter/search/sort/page state (`?category=apparel&search=costa+rica&page=2`)
- Product selection via modal overlay; separate static pages exist for SEO
- Currency formatted with `Intl.NumberFormat` (default EUR, nl-NL locale)

### SEO Build Pipeline

`scripts/build-seo.js` generates one HTML page per product under `public/products/[slug]/index.html`, including Open Graph tags, JSON-LD structured data (Product + Breadcrumb schemas), related products, and inline product data. Runs on schedule (Sundays 2am UTC) via GitHub Actions and commits generated files back to the repo.

## Required Environment Variables (Vercel)

```
STRIPE_SECRET_KEY          # Stripe secret key
STRIPE_WEBHOOK_SECRET      # Stripe webhook signing secret
PRINTFUL_API_KEY           # Printful API token
PRINTFUL_STORE_ID          # Printful store ID
STORE_URL                  # https://www.overlaymaps.com
```

No `.env` files — secrets are managed via the Vercel dashboard.

## Deployment

- Pushing to `main` triggers:
  1. Vercel auto-deploys the full project (API + static)
  2. GitHub Actions deploys `public/` to GitHub Pages
  3. GitHub Actions rebuilds SEO product pages (on schedule or manual trigger)

CORS headers and a 15-second function timeout are configured in `vercel.json`.
