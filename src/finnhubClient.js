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

// ============================================
// INSIDER TRANSACTIONS
// /stock/insider-transactions liefert SEC Form 4 Filings
// CEO/CFO/Director Kaeufe und Verkaeufe
// Wird selten aktualisiert (max 1x/Tag) -> 6h Cache
// ============================================
const insiderCache = new Map();
const INSIDER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 Stunden

const cachedFetchInsider = async (symbol, fromDate) => {
  const cacheKey = `insider:${symbol}:${fromDate}`;
  const cached = insiderCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < INSIDER_CACHE_TTL) {
    return cached.data;
  }
  
  const queryParams = new URLSearchParams({ 
    endpoint: "stock/insider-transactions", 
    symbol,
    from: fromDate
  }).toString();
  const response = await fetch(`/api/finnhub?${queryParams}`);
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(errData.error || `HTTP ${response.status}`);
  }
  
  const data = await response.json();
  insiderCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};

// Hole Insider Transactions fuer eine Aktie der letzten N Tage
export const getInsiderTransactions = async (symbol, days = 90) => {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromStr = fromDate.toISOString().split("T")[0]; // YYYY-MM-DD
    
    const data = await cachedFetchInsider(symbol, fromStr);
    
    if (!data || !data.data || !Array.isArray(data.data)) return [];
    
    // Verarbeite und normalisiere
    return data.data
      .filter(t => t.transactionDate && t.share && t.transactionPrice)
      .map(t => {
        const shares = Math.abs(parseInt(t.change || t.share) || 0);
        const price = parseFloat(t.transactionPrice) || 0;
        const value = shares * price;
        // Finnhub liefert transactionCode: P=Purchase, S=Sale, A=Award, F=Tax, M=Option exercise, G=Gift
        const code = t.transactionCode || "";
        let action = "other";
        if (code === "P") action = "bought";
        else if (code === "S") action = "sold";
        else if (code === "A" || code === "M") action = "acquired"; // Aktienprogramm/Optionen
        else if (code === "F") action = "tax"; // Tax withholding
        
        return {
          name: t.name || "Unknown Insider",
          shares,
          price,
          value,
          action,
          code,
          date: t.transactionDate,
          filingDate: t.filingDate,
          // Position koennte im "name" Feld stehen oder als role/title
          role: t.role || t.position || null
        };
      })
      .filter(t => t.action !== "tax") // Tax-Filings rausfiltern, das ist nur Zahlungsverkehr
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // neueste zuerst
  } catch (err) {
    console.error("Insider transactions fetch failed:", symbol, err.message);
    return [];
  }
};

// Aggregiertes Insider-Sentiment: Kauf vs Verkauf
export const calcInsiderSentiment = (transactions) => {
  if (!transactions || transactions.length === 0) {
    return { score: 50, totalBuy: 0, totalSell: 0, buyCount: 0, sellCount: 0, signal: "no_data" };
  }
  
  const buys = transactions.filter(t => t.action === "bought");
  const sells = transactions.filter(t => t.action === "sold");
  
  const totalBuy = buys.reduce((sum, t) => sum + t.value, 0);
  const totalSell = sells.reduce((sum, t) => sum + t.value, 0);
  
  // Score: 0-100, 50 = neutral, >70 = bullish (mehr Kaeufe), <30 = bearish (mehr Verkaeufe)
  let score = 50;
  const total = totalBuy + totalSell;
  if (total > 0) {
    score = Math.round((totalBuy / total) * 100);
  }
  
  // Insider-Kaeufe sind sehr selten und sehr bullish
  // Cluster-Buying: mehrere verschiedene Insider kaufen
  const uniqueBuyers = new Set(buys.map(t => t.name)).size;
  if (uniqueBuyers >= 3) score = Math.min(100, score + 15); // Cluster Buying Bonus
  
  let signal = "neutral";
  if (score >= 70 && totalBuy > 100000) signal = "bullish"; // muss substantiell sein
  else if (score >= 85) signal = "very_bullish";
  else if (score <= 30 && totalSell > 1000000) signal = "bearish";
  else if (score <= 15) signal = "very_bearish";
  
  return {
    score,
    totalBuy,
    totalSell,
    buyCount: buys.length,
    sellCount: sells.length,
    uniqueBuyers,
    signal
  };
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
