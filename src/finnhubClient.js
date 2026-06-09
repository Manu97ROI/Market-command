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

// Candle-Daten holen (intraday + historical fuer Tages-Vergleich)
// Finnhub Free: resolution=D (daily) ist verlaesslich verfuegbar
// Intraday (z.B. 5, 15, 60 Min) erfordert in vielen Faellen Premium
// Wir gehen den robusten Weg: 2 Tage Daily-Candle holen fuer Range-Vergleich
export const getDailyCandles = async (symbol, days = 5) => {
  const now = Math.floor(Date.now() / 1000);
  const past = now - days * 24 * 60 * 60;
  
  try {
    const data = await cachedFetchCandle("stock/candle", {
      symbol,
      resolution: "D",
      from: past,
      to: now
    });
    
    if (data.s !== "ok" || !data.c || data.c.length === 0) {
      return null;
    }
    
    // Finnhub Candle Response: { c: [close], o: [open], h: [high], l: [low], v: [volume], t: [timestamp] }
    const candles = [];
    for (let i = 0; i < data.c.length; i++) {
      candles.push({
        close: data.c[i],
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        volume: data.v[i],
        timestamp: data.t[i]
      });
    }
    return candles;
  } catch (err) {
    console.error("Candle fetch failed:", symbol, err.message);
    return null;
  }
};

// Eigener Cache fuer Candle-Daten mit 15-Min TTL (statt 30s)
const candleCache = new Map();
const CANDLE_CACHE_TTL = 15 * 60 * 1000; // 15 Minuten

const cachedFetchCandle = async (endpoint, params = {}) => {
  const cacheKey = endpoint + JSON.stringify(params);
  const cached = candleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CANDLE_CACHE_TTL) {
    return cached.data;
  }
  
  const queryParams = new URLSearchParams({ endpoint, ...params }).toString();
  const response = await fetch(`/api/finnhub?${queryParams}`);
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(errData.error || `HTTP ${response.status}`);
  }
  
  const data = await response.json();
  candleCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};

// Bulk Candle Fetch
export const getMultipleCandles = async (symbols, days = 5) => {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const candles = await getDailyCandles(symbol, days);
      return { symbol, candles };
    })
  );
  
  return results
    .filter(r => r.status === "fulfilled" && r.value.candles)
    .map(r => r.value);
};

// ============================================
// FUNDAMENTALDATEN
// /stock/metric liefert P/E, ROE, EPS Growth, Debt/Equity etc.
// Wird selten aktualisiert (Quartal) -> langer Cache (24h)
// ============================================
const fundamentalsCache = new Map();
const FUNDAMENTALS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 Stunden

const cachedFetchFundamentals = async (symbol) => {
  const cacheKey = `metric:${symbol}`;
  const cached = fundamentalsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FUNDAMENTALS_CACHE_TTL) {
    return cached.data;
  }
  
  const queryParams = new URLSearchParams({ 
    endpoint: "stock/metric", 
    symbol, 
    metric: "all" 
  }).toString();
  const response = await fetch(`/api/finnhub?${queryParams}`);
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(errData.error || `HTTP ${response.status}`);
  }
  
  const data = await response.json();
  fundamentalsCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};

export const getFundamentals = async (symbol) => {
  try {
    const data = await cachedFetchFundamentals(symbol);
    if (!data || !data.metric) return null;
    
    const m = data.metric;
    return {
      // Profitabilitaet
      roe: m.roeRfy || m.roeTTM || null,
      roa: m.roaRfy || m.roaTTM || null,
      grossMargin: m.grossMarginTTM || null,
      netMargin: m.netMarginAnnual || m.netProfitMarginTTM || null,
      
      // Wachstum (5-Jahres Annualized falls verfuegbar)
      epsGrowth5Y: m.epsGrowth5Y || null,
      revenueGrowth5Y: m.revenueGrowth5Y || null,
      epsGrowthTTMYoy: m.epsGrowthTTMYoy || null,
      revenueGrowthTTMYoy: m.revenueGrowthTTMYoy || null,
      
      // Bewertung
      pe: m.peNormalizedAnnual || m.peTTM || null,
      pb: m.pbAnnual || m.pbQuarterly || null,
      ps: m.psTTM || null,
      peg: m.pegRatio || null,
      
      // Health
      debtToEquity: m.totalDebt_totalEquityAnnual || m["totalDebt/totalEquityQuarterly"] || null,
      currentRatio: m.currentRatioAnnual || m.currentRatioQuarterly || null,
      
      // Cashflow
      fcfMargin: m.netCashFlowFromOperationsTTM || null,
      
      // Allgemein
      marketCap: m.marketCapitalization || null,
      week52High: m["52WeekHigh"] || null,
      week52Low: m["52WeekLow"] || null,
      beta: m.beta || null,
      dividendYield: m.dividendYieldIndicatedAnnual || null
    };
  } catch (err) {
    console.error("Fundamentals fetch failed:", symbol, err.message);
    return null;
  }
};

export const getMultipleFundamentals = async (symbols) => {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const fundamentals = await getFundamentals(symbol);
      return { symbol, fundamentals };
    })
  );
  
  return results
    .filter(r => r.status === "fulfilled" && r.value.fundamentals)
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
