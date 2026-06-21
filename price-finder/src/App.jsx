import { useState } from 'react';

const EXAMPLES = ['AirPods Pro', 'Nintendo Switch', 'Dyson V15', 'Instant Pot Duo'];

export default function App() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search(term) {
    const q = term.trim();
    if (!q) return;
    setSubmitted(q);
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setResults(data.results);
      setDemo(Boolean(data.demo));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    search(query);
  }

  const cheapest = results && results.length ? results[0] : null;
  const highest = results && results.length ? results[results.length - 1] : null;
  const savings =
    cheapest && highest && highest.priceValue > cheapest.priceValue
      ? highest.priceValue - cheapest.priceValue
      : 0;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">🏷️ Cheapest</span>
        <span className="brand-tag">find the lowest price anywhere</span>
      </header>

      <main className={results || loading || error ? 'main main-results' : 'main main-hero'}>
        {!results && !loading && !error && (
          <div className="hero">
            <h1>Find the cheapest price, anywhere.</h1>
            <p className="hero-sub">
              Search any product and we'll compare prices across major retailers — Amazon,
              Walmart, Target, Best Buy and more — and line them up cheapest first.
            </p>
          </div>
        )}

        <form className="search" onSubmit={onSubmit}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for any product…"
            aria-label="Product to search for"
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {!results && !loading && !error && (
          <div className="examples">
            <span>Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                className="chip"
                onClick={() => {
                  setQuery(ex);
                  search(ex);
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {demo && results && (
          <div className="demo-banner">
            Showing <strong>sample data</strong>. Add a free SerpApi key (env var
            <code>SERPAPI_KEY</code>) to see live prices from real retailers.
          </div>
        )}

        {error && (
          <div className="state state-error">
            <span className="state-icon">⚠️</span>
            <p>{error}</p>
            <button className="chip" onClick={() => search(submitted)}>
              Try again
            </button>
          </div>
        )}

        {loading && (
          <div className="results">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card card-skeleton" />
            ))}
          </div>
        )}

        {results && !loading && (
          <>
            <div className="results-head">
              <h2>
                {results.length > 0
                  ? `Cheapest “${submitted}” we found`
                  : `No prices found for “${submitted}”`}
              </h2>
              {results.length > 0 && (
                <p className="results-meta">
                  {results.length} offers compared
                  {savings > 0 && (
                    <>
                      {' · '}
                      <span className="savings">save up to ${savings.toFixed(2)}</span>
                    </>
                  )}
                </p>
              )}
            </div>

            {results.length === 0 ? (
              <div className="state">
                <span className="state-icon">🔍</span>
                <p>
                  No major retailers (Amazon, Walmart, Target, etc.) had a price for this.
                  Try a different or more specific product name.
                </p>
              </div>
            ) : (
              <div className="results">
                {results.map((r, i) => (
                  <ResultCard key={i} result={r} best={i === 0} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        Prices and availability are pulled live and can change. Always confirm on the
        retailer's site before buying.
      </footer>
    </div>
  );
}

function ResultCard({ result, best }) {
  return (
    <div className={best ? 'card card-best' : 'card'}>
      <div className="card-thumb">
        {result.thumbnail ? (
          <img src={result.thumbnail} alt="" loading="lazy" />
        ) : (
          <span className="thumb-placeholder">🏷️</span>
        )}
      </div>

      <div className="card-body">
        {best && <span className="best-badge">Best price</span>}
        <h3 className="card-title">{result.title}</h3>
        <div className="card-meta">
          <span className="card-source">{result.source}</span>
          {result.rating != null && (
            <span className="card-rating">
              ★ {result.rating.toFixed(1)}
              {result.reviews != null && (
                <span className="card-reviews"> ({formatCount(result.reviews)})</span>
              )}
            </span>
          )}
          {result.delivery && <span className="card-delivery">{result.delivery}</span>}
        </div>
      </div>

      <div className="card-action">
        <span className="card-price">{result.price}</span>
        {result.link ? (
          <a className="deal-btn" href={result.link} target="_blank" rel="noopener noreferrer">
            View deal
          </a>
        ) : (
          <span className="deal-btn deal-btn-disabled">No link</span>
        )}
      </div>
    </div>
  );
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
