// api/yahoo.js
// Vercel Serverless Function als Proxy zu Yahoo Finance
// Yahoo bietet keine offizielle API, wir nutzen den inoffiziellen quoteSummary Endpoint

export default async function handler(req, res) {
  const expectedPassword = process.env.APP_PASSWORD;
  
  // Auth check
  if (expectedPassword) {
    const authToken = req.headers["x-auth-token"] || req.query._auth;
    if (!authToken || authToken !== expectedPassword) {
      return res.status(401).json({ error: "Nicht autorisiert" });
    }
  }
  
  const { symbol, modules } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: "Symbol fehlt" });
  }
  
  // Yahoo Module: defaultKeyStatistics, financialData, summaryDetail, summaryProfile, price
  const moduleList = modules || "defaultKeyStatistics,financialData,summaryDetail,price";
  
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${moduleList}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Yahoo API: ${response.status}`, details: text.substring(0, 200) });
    }
    
    const data = await response.json();
    
    // Cache header: 1 Stunde
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Yahoo proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
