// finnhubClient.js
// Holt Live-Daten von Finnhub via Vercel Serverless Function (/api/finnhub)
// Cacht Antworten im Browser fuer 30 Sek um API-Calls zu sparen

const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 Sekunden

const cachedFetch = async (endpoint, params = {}) => {
  const cacheKey = endpoint + JSON.stringify(params);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const queryParams = new URLSearchParams({ endpoint, ...params }).toString();
  const response = await fetch(`/api/finnhub?${queryParams}`);
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(errData.error || `HTTP ${response.status}`);
  }
  
  const data = await response.json();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};

// Aktuellen Preis + Veraenderung holen
export const getQuote = async (symbol) => {
  // Finnhub Quote: { c: current, d: change, dp: percent change, h: high, l: low, o: open, pc: prev close }
  const data = await cachedFetch("quote", { symbol });
  return {
    price: data.c,
    change: data.dp,
    high: data.h,
    low: data.l,
    open: data.o,
    prevClose: data.pc,
    changeAbs: data.d
  };
};

// Company Profile: Name, Sektor, Market Cap, etc.
export const getProfile = async (symbol) => {
  const data = await cachedFetch("stock/profile2", { symbol });
  return {
    name: data.name,
    ticker: data.ticker,
    sector: data.finnhubIndustry,
    marketCap: data.marketCapitalization,  // in Millionen
    country: data.country,
    currency: data.currency,
    exchange: data.exchange,
    logo: data.logo,
    weburl: data.weburl
  };
};

// Mehrere Quotes parallel holen (fuer Watchlist/Scanner)
export const getMultipleQuotes = async (symbols) => {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const quote = await getQuote(symbol);
      return { symbol, ...quote };
    })
  );
  
  return results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
};

// Symbol-Suche: nutze die US-Symbol-Liste von Finnhub
let symbolCache = null;
export const searchSymbols = async (query) => {
  if (!symbolCache) {
    try {
      symbolCache = await cachedFetch("stock/symbol", { exchange: "US" });
    } catch (err) {
      console.error("Symbol-Liste konnte nicht geladen werden:", err);
      return [];
    }
  }
  
  const q = query.toUpperCase();
  return symbolCache
    .filter(s => s.symbol.includes(q) || (s.description && s.description.toUpperCase().includes(q)))
    .slice(0, 20)
    .map(s => ({
      symbol: s.symbol,
      name: s.description,
      type: s.type
    }));
};

// Format Market Cap (in Millionen) zu lesbarem String
export const formatMarketCap = (millions) => {
  if (!millions) return "N/A";
  if (millions >= 1000000) return `${(millions / 1000000).toFixed(1)}T`;
  if (millions >= 1000) return `${(millions / 1000).toFixed(1)}B`;
  return `${millions.toFixed(0)}M`;
};
