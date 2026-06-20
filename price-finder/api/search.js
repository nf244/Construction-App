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

/** Turn SerpApi shopping_results into our slim, price-sorted result shape. */
function normalize(items) {
  return items
    .map((item) => {
      const priceValue =
        typeof item.extracted_price === 'number'
          ? item.extracted_price
          : parsePrice(item.price);
      return {
        title: item.title || 'Untitled product',
        price: item.price || (priceValue != null ? `$${priceValue.toFixed(2)}` : null),
        priceValue,
        source: item.source || item.store || 'Unknown retailer',
        link: item.product_link || item.link || null,
        thumbnail: item.thumbnail || null,
        rating: typeof item.rating === 'number' ? item.rating : null,
        reviews: typeof item.reviews === 'number' ? item.reviews : null,
        delivery: item.delivery || null,
      };
    })
    // Only keep things we can actually rank by price.
    .filter((r) => typeof r.priceValue === 'number' && r.priceValue > 0)
    .sort((a, b) => a.priceValue - b.priceValue);
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
    { source: 'eBay', rating: 4.4, reviews: 1820, delivery: 'Free shipping' },
    { source: 'Walmart', rating: 4.6, reviews: 932, delivery: 'Free delivery' },
    { source: 'Amazon.com', rating: 4.7, reviews: 5421, delivery: 'Free Prime delivery' },
    { source: 'Target', rating: 4.5, reviews: 311, delivery: '$5.99 shipping' },
    { source: 'Best Buy', rating: 4.3, reviews: 688, delivery: 'Free shipping' },
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
