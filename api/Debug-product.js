/**
 * GET /api/debug-product?id=PRODUCT_ID
 * Returns the raw Printful API response for a single product
 * so you can see all available image fields.
 *
 * Usage: https://overlay-maps.vercel.app/api/debug-product?id=123456
 * Delete this file after debugging!
 */

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Pass ?id=PRODUCT_ID' });

  const headers = {
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
    'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID,
  };

  // Fetch product detail
  const r = await fetch(`https://api.printful.com/store/products/${id}`, { headers });
  const data = await r.json();
  const { sync_product, sync_variants } = data.result || {};

  // Summarize what image fields exist
  const summary = {
    sync_product_keys: Object.keys(sync_product || {}),
    thumbnail_url: sync_product?.thumbnail_url,
    preview_url: sync_product?.preview_url,

    // Show all files on first 3 variants
    variant_files_sample: (sync_variants || []).slice(0, 3).map(v => ({
      variant_id: v.id,
      variant_name: v.name,
      files: (v.files || []).map(f => ({
        type: f.type,
        filename: f.filename,
        preview_url: f.preview_url,
        url: f.url,
      })),
    })),

    // Full raw sync_product for inspection
    raw_sync_product: sync_product,
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(summary);
}