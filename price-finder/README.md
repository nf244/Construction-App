# Cheapest — price finder

Search any product and see the lowest price across retailers, cheapest first.

- **Frontend:** React + Vite
- **Backend:** one Vercel serverless function (`api/search.js`) that calls
  [SerpApi](https://serpapi.com)'s Google Shopping engine server-side. The API
  key never reaches the browser.
- **Demo mode:** with no key configured, the API returns realistic sample data
  so the site is fully usable before you wire in a real key.

## Going live with real prices

1. Create a free key at https://serpapi.com/manage-api-key (100 searches/month free).
2. In Vercel: **Project → Settings → Environment Variables**, add
   `SERPAPI_KEY` = your key, then redeploy.

That's it — the same code switches from demo data to live results automatically.

## Local development

```bash
npm install
npm run dev        # frontend only (the /api function needs `vercel dev`)
```

To run the serverless function locally too, use the Vercel CLI: `vercel dev`.
