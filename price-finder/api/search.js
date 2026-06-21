/**
 * GET /api/search?q=<product>
 *
 * Searches Google Shopping (via SerpApi) and returns results normalized and
 * sorted cheapest-first. The SerpApi key lives only here on the server
 * (process.env.SERPAPI_KEY) so it is never exposed to the browser.
 *
 * If no key is configured the endpoint returns realistic DEMO data and flags
 * `demo: true`, so the site is fully usable before a key is added.
 */

const SERPAPI_URL = 'https://serpapi.com/search.json';
const REQUEST_TIMEOUT_MS = 12_000;

export default async function handler(req, res) {
  const query = (req.query.q || '').toString().trim();

  if (!query) {
    res.status(400).json({ error: 'Add a product to search for.' });
    return;
  }

  const apiKey = process.env.SERPAPI_KEY;

  // No key yet → serve demo data so the site still works.
  if (!apiKey) {
    res.status(200).json({
      query,
      demo: true,
      results: demoResults(query),
    });
    return;
  }

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    gl: 'us',
    hl: 'en',
    api_key: apiKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SERPAPI_URL}?${params}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      const detail = await safeJson(response);
      const message =
        detail?.error || `Search provider returned ${response.status}. Please try again.`;
      res.status(502).json({ error: message });
      return;
    }

    const data = await response.json();
    if (data.error) {
      res.status(502).json({ error: data.error });
      return;
    }

    const results = normalize(data.shopping_results || []);
    res.status(200).json({ query, demo: false, results });
  } catch (err) {
    clearTimeout(timeout);
    const message =
      err.name === 'AbortError'
        ? 'The search took too long. Please try again.'
        : 'Could not reach the search provider. Please try again.';
    res.status(504).json({ error: message });
  }
}

/**
 * Major national "big-box" retailers we trust to surface. Anything whose
 * source doesn't map to one of these (random marketplace resellers, no-name
 * stores, auction sites, etc.) is dropped.
 *
 * Note on Walmart: third-party marketplace sellers usually show up under their
 * OWN store name in Google Shopping — so the allowlist already filters most of
 * them out. For the cases where a marketplace listing still reports something
 * like "Walmart - SomeSeller", `canonicalRetailer` rejects it so only genuine
 * Walmart-sold listings remain.
 */
const TRUSTED_RETAILERS = [
  { name: 'Amazon', match: /^amazon(\.com)?\b/ },
  { name: 'Walmart', match: /^walmart(\.com)?\b/ },
  { name: 'Target', match: /^target(\.com)?\b/ },
  { name: 'Best Buy', match: /^best ?buy\b/ },
  { name: 'Costco', match: /^costco\b/ },
  { name: "Sam's Club", match: /^sam'?s club\b/ },
  { name: 'Home Depot', match: /^(the )?home depot\b/ },
  { name: "Lowe's", match: /^lowe'?s\b/ },
  { name: 'Newegg', match: /^newegg\b/ },
  { name: 'B&H Photo', match: /^b&?h\b/ },
  { name: "Kohl's", match: /^kohl'?s\b/ },
  { name: "Macy's", match: /^macy'?s\b/ },
  { name: 'Staples', match: /^staples\b/ },
  { name: 'Office Depot', match: /^office ?depot\b|^officemax\b/ },
  { name: 'Wayfair', match: /^wayfair\b/ },
  { name: "Dick's Sporting Goods", match: /^dick'?s\b/ },
  { name: 'Nordstrom', match: /^nordstrom\b/ },
  { name: 'Micro Center', match: /^micro ?center\b/ },
];

/**
 * Map a raw Google Shopping source to a canonical big-box retailer name, or
 * null if it isn't one of the stores we trust.
 */
function canonicalRetailer(source) {
  if (!source) return null;
  const s = String(source).trim().toLowerCase();
  for (const r of TRUSTED_RETAILERS) {
    if (r.match.test(s)) {
      // Reject Walmart marketplace third-party sellers, e.g. "Walmart - Apexstores".
      if (r.name === 'Walmart' && /walmart\b.*[-–—]\s*\S/.test(s)) return null;
      return r.name;
    }
  }
  return null;
}

/** Turn SerpApi shopping_results into our slim, price-sorted result shape. */
function normalize(items) {
  const out = [];
  for (const item of items) {
    const retailer = canonicalRetailer(item.source || item.store);
    if (!retailer) continue; // not a trusted big-box store → skip

    const priceValue =
      typeof item.extracted_price === 'number'
        ? item.extracted_price
        : parsePrice(item.price);
    // Only keep things we can actually rank by price.
    if (typeof priceValue !== 'number' || priceValue <= 0) continue;

    out.push({
      title: item.title || 'Untitled product',
      price: item.price || `$${priceValue.toFixed(2)}`,
      priceValue,
      source: retailer,
      link: item.product_link || item.link || null,
      thumbnail: item.thumbnail || null,
      rating: typeof item.rating === 'number' ? item.rating : null,
      reviews: typeof item.reviews === 'number' ? item.reviews : null,
      delivery: item.delivery || null,
    });
  }
  return out.sort((a, b) => a.priceValue - b.priceValue);
}

/** Pull a number out of a price string like "$1,299.00". */
function parsePrice(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[^0-9.]/g, '');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Plausible-looking sample results keyed off the query, for demo mode. */
function demoResults(query) {
  const label = query.charAt(0).toUpperCase() + query.slice(1);
  const retailers = [
    { source: 'Walmart', rating: 4.6, reviews: 932, delivery: 'Free delivery' },
    { source: 'Amazon', rating: 4.7, reviews: 5421, delivery: 'Free Prime delivery' },
    { source: 'Target', rating: 4.5, reviews: 311, delivery: '$5.99 shipping' },
    { source: 'Best Buy', rating: 4.3, reviews: 688, delivery: 'Free shipping' },
    { source: 'Costco', rating: 4.7, reviews: 1204, delivery: 'Free delivery' },
    { source: 'Newegg', rating: 4.2, reviews: 204, delivery: '$7.99 shipping' },
  ];
  const base = 24 + (hash(query) % 120);
  return retailers
    .map((r, i) => {
      const priceValue = Math.round((base + i * (3 + (hash(query + i) % 9))) * 100) / 100;
      return {
        title: `${label} — ${r.source} listing`,
        price: `$${priceValue.toFixed(2)}`,
        priceValue,
        source: r.source,
        link: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`,
        thumbnail: null,
        rating: r.rating,
        reviews: r.reviews,
        delivery: r.delivery,
      };
    })
    .sort((a, b) => a.priceValue - b.priceValue);
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
