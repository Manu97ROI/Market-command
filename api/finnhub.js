// Vercel Serverless Function
// Routet Anfragen vom Browser durch zu Finnhub und versteckt den API-Key.
// Aufruf vom Frontend: /api/finnhub?endpoint=quote&symbol=AAPL

export default async function handler(req, res) {
  const apiKey = process.env.FINNHUB_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: "FINNHUB_API_KEY ist nicht gesetzt in Vercel Environment Variables" });
  }

  const { endpoint, ...params } = req.query;
  
  if (!endpoint) {
    return res.status(400).json({ error: "endpoint Parameter fehlt" });
  }

  // Whitelist erlaubter Endpoints (Sicherheit)
  const allowedEndpoints = ["quote", "stock/profile2", "stock/symbol", "stock/metric", "stock/insider-transactions", "stock/recommendation", "company-news", "news-sentiment"];
  if (!allowedEndpoints.includes(endpoint)) {
    return res.status(400).json({ error: `Endpoint nicht erlaubt: ${endpoint}` });
  }

  // Baue Finnhub URL
  const queryParams = new URLSearchParams({ ...params, token: apiKey }).toString();
  const url = `https://finnhub.io/api/v1/${endpoint}?${queryParams}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Finnhub error: ${text}` });
    }
    
    const data = await response.json();
    
    // Cache fuer 30 Sekunden (reduziert API-Calls)
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
