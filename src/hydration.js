// hydration.js
// Multi-Source Fundamental-Daten Hydration
// Strategy: Cache → Finnhub → Yahoo Fallback → Merge

import { getFundamentals } from "./finnhubClient.js";
import { getYahooFundamentals } from "./yahooClient.js";
import { getCached, setCached } from "./storage.js";

const FUNDAMENTALS_TTL = 24 * 60 * 60 * 1000; // 24 Stunden

// Check ob ein Fundamentals-Objekt "vollstaendig genug" ist
const isComplete = (f) => {
  if (!f) return false;
  const criticalFields = ["roe", "pe", "debtToEquity"];
  const missing = criticalFields.filter(k => f[k] == null);
  return missing.length === 0;
};

// Score wie vollstaendig die Daten sind (0-100%)
const completeness = (f) => {
  if (!f) return 0;
  const fields = ["roe", "netMargin", "epsGrowth5Y", "epsGrowthTTMYoy", "revenueGrowth5Y", "revenueGrowthTTMYoy", "pe", "peg", "pb", "debtToEquity", "beta"];
  const present = fields.filter(k => f[k] != null).length;
  return Math.round((present / fields.length) * 100);
};

// Merge zwei Fundamentals-Objekte: Primary hat Vorrang, Fallback fuellt Luecken
const mergeFundamentals = (primary, fallback) => {
  if (!primary && !fallback) return null;
  if (!primary) return fallback;
  if (!fallback) return primary;
  
  const merged = { ...primary };
  Object.keys(fallback).forEach(key => {
    if (merged[key] == null && fallback[key] != null) {
      merged[key] = fallback[key];
    }
  });
  
  // Mark sources
  merged._sources = [
    primary._source || "finnhub",
    fallback._source || "yahoo"
  ].filter((v, i, a) => a.indexOf(v) === i);
  
  return merged;
};

// HAUPT-FUNKTION: Hole Fundamentaldaten mit Multi-Source-Strategy
export const hydrateFundamentals = async (symbol, options = {}) => {
  const { useCache = true, forceFresh = false } = options;
  const cacheKey = `fundamentals:${symbol}`;
  
  // 1. Cache check (wenn nicht forciert frisch)
  if (useCache && !forceFresh) {
    const cached = await getCached(cacheKey);
    if (cached && cached.data) {
      // Wenn vollstaendig, sofort zurueck
      if (isComplete(cached.data)) {
        return { data: cached.data, fromCache: true, ageMs: cached.ageMs };
      }
      // Wenn unvollstaendig, versuche neu zu holen aber gib stale Data direkt zurueck
    }
  }
  
  // 2. Finnhub als primaere Quelle
  let finnhubData = null;
  try {
    finnhubData = await getFundamentals(symbol);
    if (finnhubData) finnhubData._source = "finnhub";
  } catch (err) {
    console.warn("Finnhub failed for", symbol, err.message);
  }
  
  // 3. Wenn Finnhub vollstaendig genug: speichern + zurueck
  if (isComplete(finnhubData)) {
    await setCached(cacheKey, finnhubData, FUNDAMENTALS_TTL);
    return { data: finnhubData, fromCache: false };
  }
  
  // 4. Yahoo als Fallback fuer fehlende Felder
  let yahooData = null;
  try {
    yahooData = await getYahooFundamentals(symbol);
  } catch (err) {
    console.warn("Yahoo failed for", symbol, err.message);
  }
  
  // 5. Merge: Finnhub-Daten + Yahoo-Fallbacks fuer leere Felder
  const merged = mergeFundamentals(finnhubData, yahooData);
  
  if (merged) {
    await setCached(cacheKey, merged, FUNDAMENTALS_TTL);
    return { data: merged, fromCache: false, completeness: completeness(merged) };
  }
  
  // 6. Letzte Rettung: stale Cache nutzen
  const staleCache = await getCached(cacheKey, true); // ignoreExpiry
  if (staleCache && staleCache.data) {
    return { data: staleCache.data, fromCache: true, isStale: true, ageMs: staleCache.ageMs };
  }
  
  return { data: null, fromCache: false };
};

// Insider Transactions mit Cache
export const hydrateInsiderTransactions = async (symbol, fetchFn) => {
  const cacheKey = `insider:${symbol}`;
  
  // Cache check (4h TTL)
  const cached = await getCached(cacheKey);
  if (cached && cached.data) {
    return { data: cached.data, fromCache: true, ageMs: cached.ageMs };
  }
  
  try {
    const txs = await fetchFn(symbol, 90);
    await setCached(cacheKey, txs, 4 * 60 * 60 * 1000); // 4h
    return { data: txs, fromCache: false };
  } catch (err) {
    console.error("Insider hydration failed:", err);
    return { data: [], fromCache: false };
  }
};

// Executives mit Cache (7 Tage TTL)
export const hydrateExecutives = async (symbol, fetchFn) => {
  const cacheKey = `executives:${symbol}`;
  
  const cached = await getCached(cacheKey);
  if (cached && cached.data) {
    return { data: cached.data, fromCache: true };
  }
  
  try {
    const execs = await fetchFn(symbol);
    await setCached(cacheKey, execs, 7 * 24 * 60 * 60 * 1000); // 7 Tage
    return { data: execs, fromCache: false };
  } catch (err) {
    return { data: [], fromCache: false };
  }
};

// Candles mit Cache
export const hydrateCandles = async (symbol, fetchFn) => {
  const cacheKey = `candles:${symbol}`;
  
  // Candles sind zeitkritisch, nur 30 min Cache
  const cached = await getCached(cacheKey);
  if (cached && cached.data) {
    return { data: cached.data, fromCache: true };
  }
  
  try {
    const candles = await fetchFn(symbol, 5);
    if (candles) {
      await setCached(cacheKey, candles, 30 * 60 * 1000); // 30 min
    }
    return { data: candles, fromCache: false };
  } catch (err) {
    return { data: null, fromCache: false };
  }
};
