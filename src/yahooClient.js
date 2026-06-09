// yahooClient.js
// Yahoo Finance als Fallback fuer Fundamentaldaten
// Wird nur aufgerufen wenn Finnhub bei einem Feld leer ist

import { getAuthToken } from "./authStorage.js";

// In-Memory Cache fuer aktuelle Session (zusaetzlich zu IndexedDB)
const memCache = new Map();
const MEM_CACHE_TTL = 60 * 60 * 1000; // 1 Stunde

export const getYahooFundamentals = async (symbol) => {
  // Memory-Cache check
  const cached = memCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < MEM_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/yahoo?symbol=${encodeURIComponent(symbol)}`, {
      headers: { "x-auth-token": token || "" }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;
    
    const ks = result.defaultKeyStatistics || {};
    const fd = result.financialData || {};
    const sd = result.summaryDetail || {};
    const price = result.price || {};
    
    // Yahoo gibt Werte oft als { raw: number, fmt: string } zurueck
    const getRaw = (obj) => (obj && typeof obj === "object" && "raw" in obj) ? obj.raw : (typeof obj === "number" ? obj : null);
    
    const normalized = {
      // Profitabilitaet (Yahoo: in Dezimal, also 0.4 = 40%)
      roe: getRaw(fd.returnOnEquity) != null ? getRaw(fd.returnOnEquity) * 100 : null,
      roa: getRaw(fd.returnOnAssets) != null ? getRaw(fd.returnOnAssets) * 100 : null,
      grossMargin: getRaw(fd.grossMargins) != null ? getRaw(fd.grossMargins) * 100 : null,
      netMargin: getRaw(fd.profitMargins) != null ? getRaw(fd.profitMargins) * 100 : null,
      
      // Wachstum (Yahoo Quartals-YoY) - in Dezimal
      epsGrowthTTMYoy: getRaw(fd.earningsGrowth) != null ? getRaw(fd.earningsGrowth) * 100 : null,
      revenueGrowthTTMYoy: getRaw(fd.revenueGrowth) != null ? getRaw(fd.revenueGrowth) * 100 : null,
      
      // Bewertung
      pe: getRaw(sd.trailingPE) || getRaw(ks.trailingPE) || null,
      forwardPe: getRaw(sd.forwardPE) || getRaw(ks.forwardPE) || null,
      pb: getRaw(ks.priceToBook) || null,
      ps: getRaw(sd.priceToSalesTrailing12Months) || null,
      peg: getRaw(ks.pegRatio) || null,
      
      // Health
      debtToEquity: getRaw(fd.debtToEquity) != null ? getRaw(fd.debtToEquity) / 100 : null, // Yahoo gibt es als Prozent
      currentRatio: getRaw(fd.currentRatio) || null,
      
      // Allgemein
      marketCap: getRaw(sd.marketCap) || getRaw(price.marketCap) || null,
      week52High: getRaw(sd.fiftyTwoWeekHigh) || null,
      week52Low: getRaw(sd.fiftyTwoWeekLow) || null,
      beta: getRaw(sd.beta) || getRaw(ks.beta) || null,
      dividendYield: getRaw(sd.dividendYield) != null ? getRaw(sd.dividendYield) * 100 : null,
      
      // Meta
      _source: "yahoo"
    };
    
    memCache.set(symbol, { data: normalized, timestamp: Date.now() });
    return normalized;
  } catch (err) {
    console.error("Yahoo fetch failed:", symbol, err.message);
    return null;
  }
};
