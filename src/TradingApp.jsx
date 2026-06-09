import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, Zap, Target, Fish, ArrowUpRight, ArrowDownRight, Building2, User, Flame, Anchor, Brain, Globe, Landmark, Gauge, Layers, Sparkles, Send, Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, History, Eye, AlertCircle, Calendar, Archive, Wifi, WifiOff, RefreshCw, Star, Plus, Activity, ArrowUpDown, Lock, LogOut } from "lucide-react";
import { getQuote, getProfile, searchSymbols, formatMarketCap, getMultipleQuotes, getMultipleCandles, getDailyCandles, getFundamentals, getMultipleFundamentals, getInsiderTransactions, calcInsiderSentiment, getExecutives, matchInsiderRole } from "./finnhubClient.js";
import { getCryptoQuote, getMultipleCryptoQuotes, searchCrypto, getCryptoProfile, formatCryptoMarketCap, isCryptoTicker, TICKER_TO_ID } from "./coingeckoClient.js";
import { TOP_50_US, isInUniverse, getSector } from "./universe.js";
import { loadWatchlist, saveWatchlist, addToWatchlist, removeFromWatchlist } from "./watchlistStorage.js";
import { getAuthToken, login, clearAuthToken } from "./authStorage.js";
import { calcAllMetrics, calcLiveDailyScore, formatRange, formatRangePosition, formatRangeMultiplier, formatMomentum } from "./dayTradingMetrics.js";
import { calcLongTermScoreLive, getLongTermBreakdown, formatPct, formatRatio } from "./longTermScoring.js";
import { hydrateFundamentals, hydrateInsiderTransactions, hydrateExecutives, hydrateCandles } from "./hydration.js";
import { getTaskQueue } from "./taskQueue.js";
import { getCacheStats } from "./storage.js";

// ============================================
// ============================================
// LEGACY DEMO DATA REMOVED - alles laeuft jetzt live
// STOCK_DB bleibt leer fuer Backwards-Compatibility, neue Architektur basiert
// auf TOP_50_US universe + Live-Daten via Finnhub/CoinGecko
// ============================================
const STOCK_DB = {};

// ============================================
// SCORING FUNCTIONS
// ============================================
const calcDailyScore = (s) => {
  const d = s.daily;
  return Math.round(d.momentum * 0.25 + d.catalystStrength * 0.20 + d.breakoutProximity * 0.20 + (d.volVsAvg > 1 ? Math.min(100, d.volVsAvg * 55) : 30) * 0.15 + d.volatility * 0.10 + Math.min(100, Math.abs(d.gapPct) * 25) * 0.10);
};
const calcLongTermScore = (s) => {
  const l = s.longterm;
  if (s.sector === "Crypto") return Math.round(l.moat * 0.35 + l.sectorTrend * 0.35 + 70 * 0.30);
  const growth = Math.min(100, Math.max(0, (l.epsGrowth5Y + l.revenueGrowth5Y) * 1.5));
  const health = Math.max(0, 100 - l.debtToEquity * 30) * 0.5 + Math.min(100, l.roe * 1.5) * 0.5;
  const val = l.peg > 0 ? (l.peg < 1 ? 90 : l.peg < 2 ? 65 : l.peg < 3 ? 40 : 20) : 50;
  return Math.round(growth * 0.25 + l.moat * 0.20 + health * 0.15 + l.sectorTrend * 0.15 + val * 0.15 + Math.min(100, Math.max(0, l.fcfGrowth * 2)) * 0.10);
};
const calcWhaleScore = (whales) => {
  let score = 50;
  const w = { very_high: 15, high: 10, neutral: 5 };
  whales.forEach(x => { const m = x.action === "bought" ? 1 : -1; const b = x.type === "insider" ? 1.5 : 1; score += (w[x.confidence] || 5) * m * b; });
  return Math.max(0, Math.min(100, Math.round(score)));
};
const getColor = (s) => s >= 70 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";
const getSignal = (s) => s >= 70 ? "STRONG" : s >= 55 ? "MODERATE" : s >= 40 ? "WEAK" : "AVOID";
const formatNum = (n) => n >= 1000000 ? (n/1000000).toFixed(1) + "M" : n >= 1000 ? (n/1000).toFixed(1) + "K" : n.toString();

// Smart Preis-Formatter: passt Nachkommastellen automatisch an Preishoehe an
// Wichtig fuer Crypto: PEPE bei $0.000012 braucht 8 Stellen, BTC bei $96000 braucht 0
const formatPrice = (p) => {
  if (p == null || isNaN(p)) return "0";
  const n = Number(p);
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 10) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (n >= 0.01) return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (n >= 0.0001) return n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  if (n > 0) return n.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
  return "0";
};

// ============================================
// CLAUDE API WRAPPER fuer Analyse-Generierung
// ============================================
const callClaudeAPI = async (systemPrompt, userPrompt) => {
  try {
    const token = getAuthToken();
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-auth-token": token || ""
      },
      body: JSON.stringify({ systemPrompt, userPrompt })
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: "Unbekannter Fehler" }));
      throw new Error(errData.error || `API noch nicht angebunden. Nutze "LOAD DEMO" um die App zu testen.`);
    }
    
    const data = await response.json();
    const text = data.text || "";
    let clean = text.replace(/```json|```/g, "").trim();
    
    try {
      return JSON.parse(clean);
    } catch (parseErr) {
      console.error("JSON Parse Fehler. Raw Response:", clean);
      const lastBrace = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
      if (lastBrace > 0) {
        try {
          return JSON.parse(clean.substring(0, lastBrace + 1));
        } catch (e) {
          throw new Error(`Antwort war unvollstaendig. Bitte erneut versuchen.`);
        }
      }
      throw new Error(`Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen.`);
    }
  } catch (err) {
    console.error("API Error:", err);
    throw new Error(err.message || `API noch nicht angebunden. Nutze "LOAD DEMO" um die App zu testen.`);
  }
};

// ============================================
// ANALYSIS LAB LEVEL DEFINITIONS
// ============================================
const ANALYSIS_LEVELS = [
  {
    id: "scenarios",
    label: "BULL / BASE / BEAR SZENARIEN",
    icon: Layers,
    color: "#10b981",
    desc: "Drei Zukunfts-Szenarien mit Wahrscheinlichkeiten und Kurszielen"
  },
  {
    id: "macro",
    label: "MAKRO-IMPACT",
    icon: Gauge,
    color: "#60a5fa",
    desc: "Wie wirken Fed-Zinsen, Inflation, Dollar-Stärke auf diese Aktie"
  },
  {
    id: "event",
    label: "EVENT-SIMULATOR",
    icon: Sparkles,
    color: "#f59e0b",
    desc: "Eigenes Szenario eingeben und Auswirkung analysieren lassen"
  },
  {
    id: "sector",
    label: "SEKTOR-ROTATION",
    icon: Layers,
    color: "#a78bfa",
    desc: "Positionierung der Aktie im aktuellen Sektor-Zyklus"
  },
  {
    id: "political",
    label: "POLITISCHES RISIKO",
    icon: Landmark,
    color: "#ef4444",
    desc: "Tarife, Sanktionen, Regulierung, Wahlen — Impact-Analyse"
  },
  {
    id: "historical",
    label: "HISTORICAL VALIDATION",
    icon: History,
    color: "#14b8a6",
    desc: "Gegenpruefung aller Analysen mit historischen Parallelfaellen",
    requiresOthers: true
  }
];

// ============================================
// MAIN APP
// ============================================
// ============================================
// AUTH WRAPPER - zeigt Login-Screen wenn nicht eingeloggt
// ============================================
export default function AppWithAuth() {
  const [authed, setAuthed] = useState(() => !!getAuthToken());
  
  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }
  
  return <TradingApp onLogout={() => { clearAuthToken(); setAuthed(false); }} />;
}

function LoginScreen({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    const result = await login(password);
    setLoading(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || "Login fehlgeschlagen");
      setPassword("");
    }
  };
  
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: 32 }}>
        
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Lock size={14} color="#10b981" />
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#10b981", fontWeight: 600 }}>▲ AUTHENTICATION REQUIRED</div>
        </div>
        
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#e4e7ee", margin: "0 0 8px 0", letterSpacing: -0.5 }}>
          Market Command<span style={{ color: "#10b981" }}>.</span>
        </h1>
        
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 28, lineHeight: 1.5 }}>
          Geschuetzte Trading-Intelligence-Platform. Bitte Passwort eingeben.
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>PASSWORT</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="••••••••"
            autoFocus
            disabled={loading}
            style={{
              width: "100%",
              background: "#0a0e1a",
              border: "1px solid " + (error ? "#ef4444" : "#1f2937"),
              padding: "12px 14px",
              color: "#e4e7ee",
              fontFamily: "inherit",
              fontSize: 14,
              borderRadius: 4,
              outline: "none",
              boxSizing: "border-box",
              letterSpacing: password ? 4 : 0
            }}
          />
        </div>
        
        {error && (
          <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, marginBottom: 16, fontSize: 11, color: "#ef4444", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={12} />{error}
          </div>
        )}
        
        <button
          onClick={handleSubmit}
          disabled={!password || loading}
          style={{
            width: "100%",
            background: password && !loading ? "#10b981" : "#1f2937",
            color: password && !loading ? "#0a0e1a" : "#6b7280",
            border: "none",
            padding: "12px 16px",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: 2,
            fontWeight: 700,
            borderRadius: 4,
            cursor: password && !loading ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8
          }}>
          {loading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />ANMELDEN...</> : <>EINLOGGEN →</>}
        </button>
        
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed #1f2937", fontSize: 10, color: "#4b5563", letterSpacing: 1, textAlign: "center" }}>
          ◆ PROTECTED BY SERVER-SIDE AUTH ◆
        </div>
        
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ============================================
// MAIN APP (TradingApp)
// ============================================
function TradingApp({ onLogout }) {
  const [tab, setTab] = useState("daily");
  const [selectedStock, setSelectedStock] = useState(null);
  const [query, setQuery] = useState("");
  
  // Live-Daten-State
  const [liveQuotes, setLiveQuotes] = useState({}); // { TICKER: { price, change } }
  const [quoteDetails, setQuoteDetails] = useState({}); // { TICKER: { high, low, open, prevClose } }
  const [candleData, setCandleData] = useState({}); // { TICKER: [candles] }
  const [fundamentalsData, setFundamentalsData] = useState({}); // { TICKER: { roe, pe, peg, ... } }
  const [insiderData, setInsiderData] = useState({}); // { TICKER: [transactions] }
  const [insiderLoading, setInsiderLoading] = useState({}); // { TICKER: bool }
  const [executivesData, setExecutivesData] = useState({}); // { TICKER: [{name, position, ...}] }
  const [liveStocks, setLiveStocks] = useState({});
  const [liveSearchResults, setLiveSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [apiStatus, setApiStatus] = useState("unknown");
  const [lastRefresh, setLastRefresh] = useState(null);
  const searchDebounceRef = useRef(null);
  const autoRefreshRef = useRef(null);
  
  // Universe + Watchlist State
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());
  const [dailySortMode, setDailySortMode] = useState("change"); // change | volume | score
  const [loadedUniverseQuotes, setLoadedUniverseQuotes] = useState(0); // wie viele der 50 geladen sind
  
  // Loading-State pro Tab/Bereich (Lazy Loading)
  const [longTermLoading, setLongTermLoading] = useState({ inProgress: false, loaded: 0, total: 50, currentTicker: "" });
  const [longTermLoadedOnce, setLongTermLoadedOnce] = useState(false);

  // Beim Watchlist-Update: hydraten was nicht in DB ist
  useEffect(() => {
    watchlist.forEach(ticker => {
      if (!STOCK_DB[ticker] && !liveStocks[ticker]) {
        hydrateStock(ticker);
      }
    });
  }, [watchlist.length]);

  // Hilfsfunktion: Stock aus DB oder Live holen, mit Live-Quote merge
  const getEnrichedStockByTicker = (ticker) => {
    const base = STOCK_DB[ticker] || liveStocks[ticker];
    if (!base) {
      // Universe stock ohne Hydrate -> minimaler Eintrag aus Top 50
      const universeEntry = TOP_50_US.find(s => s.ticker === ticker);
      if (universeEntry) {
        const liveQuote = liveQuotes[ticker];
        return {
          ticker,
          name: universeEntry.name,
          sector: universeEntry.sector,
          marketCap: "—",
          price: liveQuote?.price || 0,
          change: liveQuote?.change || 0,
          assetType: "stock",
          daily: { momentum: 50, gapPct: liveQuote?.change || 0, preMarketVol: "avg", intraDayRange: 0, volVsAvg: 1, catalyst: "—", catalystStrength: 30, breakoutProximity: 50, volatility: 50 },
          longterm: { epsGrowth5Y: 0, revenueGrowth5Y: 0, moat: 50, debtToEquity: 0.5, roe: 10, fcfGrowth: 0, pe: 0, peg: 0, sectorTrend: 50 },
          whales: [],
          _universeOnly: true
        };
      }
      return null;
    }
    const liveQuote = liveQuotes[ticker];
    if (liveQuote) {
      return { ...base, price: liveQuote.price, change: liveQuote.change, _live: true };
    }
    return base;
  };

  // Daily Liste = Top 50 Universe + Crypto (BTC, ETH, SOL)
  // Top 20 davon werden angezeigt, sortiert nach gewaehltem Modus
  const dailyRanked = useMemo(() => {
    const universeTickers = [...TOP_50_US.map(s => s.ticker), "BTC", "ETH", "SOL"];
    const stocks = universeTickers
      .map(t => getEnrichedStockByTicker(t))
      .filter(s => s && s.price > 0);
    
    const enriched = stocks.map(s => {
      // Wenn wir Quote-Details + Candles haben: Live-Score berechnen
      const details = quoteDetails[s.ticker];
      const candles = candleData[s.ticker];
      let liveMetrics = null;
      let score;
      
      if (details && s.price) {
        const quoteForMetrics = {
          price: s.price,
          high: details.high,
          low: details.low,
          open: details.open,
          prevClose: details.prevClose,
          change: s.change
        };
        liveMetrics = calcAllMetrics(quoteForMetrics, candles);
        score = calcLiveDailyScore(liveMetrics, quoteForMetrics);
      } else {
        // Fallback: alter Demo-Score
        score = calcDailyScore(s);
      }
      
      return { ...s, score, liveMetrics };
    });
    
    let sorted;
    if (dailySortMode === "change") {
      sorted = [...enriched].sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0));
    } else if (dailySortMode === "score") {
      sorted = [...enriched].sort((a, b) => b.score - a.score);
    } else {
      sorted = [...enriched].sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0));
    }
    
    return sorted.slice(0, 20);
  }, [liveQuotes, dailySortMode, liveStocks, quoteDetails, candleData]);
  
  // Long-Term bleibt erstmal aus STOCK_DB (Demo-Daten mit Fundamentals)
  const longTermRanked = useMemo(() => {
    const universeTickers = TOP_50_US.map(s => s.ticker);
    // Optimistic UI: zeige ALLE 50, auch ohne Quote (mit Skeleton/Lade-Anzeige)
    const stocks = universeTickers
      .map(t => getEnrichedStockByTicker(t))
      .filter(Boolean);
    
    const enriched = stocks.map(s => {
      const fundamentals = fundamentalsData[s.ticker];
      const liveScore = calcLongTermScoreLive(fundamentals);
      const score = liveScore != null ? liveScore : null; // null = noch keine Daten
      const breakdown = getLongTermBreakdown(fundamentals);
      return { ...s, score, fundamentals, breakdown };
    });
    
    // Sortierung: bewertete oben (nach Score), unbewertete unten (in Universum-Reihenfolge)
    return enriched.sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });
  }, [liveQuotes, liveStocks, fundamentalsData]);

  // Watchlist Stocks (mit Live-Quotes wenn vorhanden)
  const watchlistStocks = useMemo(() => {
    return watchlist
      .map(t => getEnrichedStockByTicker(t))
      .filter(Boolean)
      .map(s => ({ ...s, score: calcDailyScore(s) }));
  }, [watchlist, liveQuotes, liveStocks]);

  // Hole Quotes fuer Universe (Top 50 US) + Crypto in Batches
  // Plus Candle-Daten fuer die Top 20 (fuer Day-Trading-Metriken)
  const refreshQuotes = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    setLoadedUniverseQuotes(0);
    
    try {
      const universeTickers = TOP_50_US.map(s => s.ticker);
      const cryptoTickers = ["BTC", "ETH", "SOL"];
      
      // Batch 1: Erste 25 Stocks + Crypto (parallel)
      const batch1Stocks = universeTickers.slice(0, 25);
      const [batch1Results, cryptoQuotes] = await Promise.all([
        getMultipleQuotes(batch1Stocks).catch(() => []),
        getMultipleCryptoQuotes(cryptoTickers).catch(() => [])
      ]);
      
      // Quotes + Details aus Batch 1 in State schreiben
      const quoteMap1 = {};
      const detailsMap1 = {};
      [...batch1Results, ...cryptoQuotes].forEach(q => {
        if (q.price && q.price > 0) {
          quoteMap1[q.symbol] = { price: q.price, change: q.change || 0 };
          // Details nur fuer Stocks (Crypto-API liefert kein high/low/open)
          if (q.high !== undefined) {
            detailsMap1[q.symbol] = { high: q.high, low: q.low, open: q.open, prevClose: q.prevClose };
          }
        }
      });
      setLiveQuotes(prev => ({ ...prev, ...quoteMap1 }));
      setQuoteDetails(prev => ({ ...prev, ...detailsMap1 }));
      setLoadedUniverseQuotes(batch1Stocks.length);
      
      // Batch 2: Restliche 25 Stocks
      const batch2Stocks = universeTickers.slice(25);
      const batch2Results = await getMultipleQuotes(batch2Stocks).catch(() => []);
      
      const quoteMap2 = {};
      const detailsMap2 = {};
      batch2Results.forEach(q => {
        if (q.price && q.price > 0) {
          quoteMap2[q.symbol] = { price: q.price, change: q.change || 0 };
          if (q.high !== undefined) {
            detailsMap2[q.symbol] = { high: q.high, low: q.low, open: q.open, prevClose: q.prevClose };
          }
        }
      });
      setLiveQuotes(prev => ({ ...prev, ...quoteMap2 }));
      setQuoteDetails(prev => ({ ...prev, ...detailsMap2 }));
      setLoadedUniverseQuotes(50);
      
      const totalLoaded = Object.keys({ ...quoteMap1, ...quoteMap2 }).length;
      setApiStatus(totalLoaded > 0 ? "ok" : "error");
      setLastRefresh(new Date());
      
      // Candles werden nur geladen wenn Detail-Tab geoeffnet wird (lazy)
    } catch (err) {
      console.error("Refresh fehlgeschlagen:", err);
      setApiStatus("error");
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  };
  
  // Hilfsfunktion: Candle-Daten fuer die ~15 Aktien mit groesster Bewegung laden
  // Beschraenkt Anzahl der API-Calls
  const loadCandlesForTopMovers = async (allQuotes) => {
    const topMovers = [...allQuotes]
      .filter(q => q.symbol && q.change !== undefined)
      .sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
      .slice(0, 15)
      .map(q => q.symbol);
    
    if (topMovers.length === 0) return;
    
    try {
      const candleResults = await getMultipleCandles(topMovers, 5);
      const candleMap = {};
      candleResults.forEach(r => {
        if (r.candles) candleMap[r.symbol] = r.candles;
      });
      setCandleData(prev => ({ ...prev, ...candleMap }));
    } catch (err) {
      console.error("Candle load failed:", err);
    }
  };

  // Hilfsfunktion: Fundamentaldaten fuer Top 50 mit Multi-Source Hydration
  // Foreground: ersten 10 werden mit Prio geladen (sichtbar)
  // Background: Rest wird langsam im Hintergrund nachgeladen
  const loadFundamentals = async () => {
    if (longTermLoading.inProgress || longTermLoadedOnce) return;
    
    const universeTickers = TOP_50_US.map(s => s.ticker);
    setLongTermLoading({ inProgress: true, loaded: 0, total: universeTickers.length, currentTicker: "" });
    
    let loadedCount = 0;
    
    // FOREGROUND: lade die ersten 10 mit Prio (parallel, sichtbar)
    const foregroundBatch = universeTickers.slice(0, 10);
    await Promise.all(foregroundBatch.map(async (ticker) => {
      try {
        setLongTermLoading(prev => ({ ...prev, currentTicker: ticker }));
        const { data } = await hydrateFundamentals(ticker);
        if (data) {
          setFundamentalsData(prev => ({ ...prev, [ticker]: data }));
        }
      } catch (err) { console.warn("Foreground hydrate failed:", ticker, err.message); }
      loadedCount++;
      setLongTermLoading(prev => ({ ...prev, loaded: loadedCount }));
    }));
    
    // BACKGROUND: Rest wird in TaskQueue eingereiht (rate-limited)
    const remaining = universeTickers.slice(10);
    const queue = getTaskQueue({ minDelayMs: 1200 });
    
    remaining.forEach(ticker => {
      queue.enqueueBackground(`fundamentals:${ticker}`, async () => {
        try {
          const { data } = await hydrateFundamentals(ticker);
          if (data) {
            setFundamentalsData(prev => ({ ...prev, [ticker]: data }));
          }
        } catch (err) { console.warn("Background hydrate failed:", ticker, err.message); }
        loadedCount++;
        setLongTermLoading(prev => ({ ...prev, loaded: loadedCount, currentTicker: ticker }));
        
        if (loadedCount >= universeTickers.length) {
          setLongTermLoading(prev => ({ ...prev, inProgress: false }));
          setLongTermLoadedOnce(true);
        }
      });
    });
    
    // Wenn keine Background-Tasks: Loader sofort aus
    if (remaining.length === 0) {
      setLongTermLoading(prev => ({ ...prev, inProgress: false }));
      setLongTermLoadedOnce(true);
    }
  };

  // Beim ersten Laden: NUR Quotes refreshen + Auto-Refresh alle 60 Sekunden
  // Nach 3 Sekunden: Background Pre-Load fuer Fundamentaldaten starten (low-prio)
  useEffect(() => {
    refreshQuotes();
    autoRefreshRef.current = setInterval(() => {
      refreshQuotes(false);
    }, 60 * 1000);
    
    // Pre-load Fundamentaldaten silently im Hintergrund nach 3 Sek
    // So sind sie schon (teilweise) da wenn User auf Long-Term klickt
    const preLoadTimer = setTimeout(() => {
      preloadFundamentalsInBackground();
    }, 3000);
    
    return () => { 
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); 
      clearTimeout(preLoadTimer);
    };
  }, []);
  
  // Silent Background Pre-Loader (laeuft beim App-Start)
  // Setzt sichtbaren Loader NICHT, fuellt nur stillen Cache
  const preloadFundamentalsInBackground = () => {
    const universeTickers = TOP_50_US.map(s => s.ticker);
    const queue = getTaskQueue({ minDelayMs: 2000 }); // 2 Sek zwischen Calls = sehr sanft
    
    universeTickers.forEach(ticker => {
      queue.enqueueBackground(`preload-fundamentals:${ticker}`, async () => {
        try {
          const { data } = await hydrateFundamentals(ticker);
          if (data) {
            setFundamentalsData(prev => ({ ...prev, [ticker]: data }));
          }
        } catch (err) { /* silent */ }
      }, { silent: true });
    });
  };

  // Watchlist Toggle (hinzufuegen/entfernen)
  const toggleWatchlist = (ticker) => {
    if (watchlist.includes(ticker)) {
      const updated = removeFromWatchlist(ticker);
      setWatchlist(updated);
    } else {
      const updated = addToWatchlist(ticker);
      setWatchlist(updated);
      // Wenn Aktie nicht in DB ist, hole Live-Daten damit sie in der Watchlist gerendert wird
      if (!STOCK_DB[ticker] && !liveStocks[ticker]) {
        hydrateStock(ticker);
      }
    }
  };

  const isInWl = (ticker) => watchlist.includes(ticker);

  // Live-Suche mit Debounce: parallel Stocks + Crypto
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!query || query.length < 1) {
      setLiveSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const [stockResults, cryptoResults] = await Promise.all([
          searchSymbols(query).catch(() => []),
          searchCrypto(query).catch(() => [])
        ]);
        
        // Crypto-Resultate kennzeichnen
        const taggedCrypto = cryptoResults.map(c => ({ ...c, assetType: "crypto" }));
        const taggedStocks = stockResults.map(s => ({ ...s, assetType: "stock" }));
        
        // Crypto zuerst (oft was der User sucht wenn er crypto-Ticker eingibt)
        const upperQ = query.toUpperCase();
        const exactCrypto = taggedCrypto.filter(c => c.symbol === upperQ);
        const otherCrypto = taggedCrypto.filter(c => c.symbol !== upperQ);
        const combined = [...exactCrypto, ...taggedStocks.slice(0, 15), ...otherCrypto].slice(0, 20);
        
        setLiveSearchResults(combined);
      } catch (err) {
        console.error("Search failed:", err);
        setLiveSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [query]);

  // Hilfsfunktion: hole Live-Profil fuer eine Aktie/Coin und cache es
  const hydrateStock = async (ticker, hint = {}) => {
    if (STOCK_DB[ticker] || liveStocks[ticker]) return; // schon vorhanden
    
    const isCrypto = hint.assetType === "crypto" || isCryptoTicker(ticker);
    
    if (isCrypto) {
      try {
        let profile;
        if (hint.id) {
          profile = await getCryptoProfile(hint.id);
        } else {
          const q = await getCryptoQuote(ticker);
          profile = { ticker, name: hint.name || ticker, price: q.price, change: q.change, marketCap: q.marketCap };
        }
        if (profile && profile.price) {
          const newStock = {
            ticker: profile.ticker || ticker,
            name: profile.name || ticker,
            price: profile.price,
            change: profile.change || 0,
            sector: "Crypto",
            marketCap: formatCryptoMarketCap(profile.marketCap),
            assetType: "crypto",
            daily: { momentum: 50, gapPct: 0, preMarketVol: "avg", intraDayRange: 0, volVsAvg: 1, catalyst: "Live-Daten", catalystStrength: 30, breakoutProximity: 50, volatility: 60 },
            longterm: { epsGrowth5Y: 0, revenueGrowth5Y: 0, moat: 50, debtToEquity: 0, roe: 0, fcfGrowth: 0, pe: 0, peg: 0, sectorTrend: 60 },
            whales: [],
            context: `${profile.name || ticker} ist eine Kryptowaehrung. ${profile.description || ""} Live-Daten von CoinGecko.`,
            _liveOnly: true
          };
          setLiveStocks(prev => ({ ...prev, [ticker]: newStock }));
          setLiveQuotes(prev => ({ ...prev, [ticker]: { price: profile.price, change: profile.change || 0 } }));
        }
      } catch (err) { console.error("Crypto hydrate failed:", err); }
    } else {
      try {
        const [quote, profile] = await Promise.all([
          getQuote(ticker).catch(() => null),
          getProfile(ticker).catch(() => null)
        ]);
        if (quote && profile && profile.name) {
          const newStock = {
            ticker,
            name: profile.name,
            price: quote.price,
            change: quote.change || 0,
            sector: profile.sector || "Unknown",
            marketCap: formatMarketCap(profile.marketCap),
            assetType: "stock",
            daily: { momentum: 50, gapPct: 0, preMarketVol: "avg", intraDayRange: 0, volVsAvg: 1, catalyst: "Live-Daten", catalystStrength: 30, breakoutProximity: 50, volatility: 50 },
            longterm: { epsGrowth5Y: 0, revenueGrowth5Y: 0, moat: 50, debtToEquity: 0.5, roe: 10, fcfGrowth: 0, pe: 0, peg: 0, sectorTrend: 50 },
            whales: [],
            context: `${profile.name} ist ein ${profile.sector || "Unbekannt"}-Unternehmen. Live-Daten von Finnhub.`,
            _liveOnly: true
          };
          setLiveStocks(prev => ({ ...prev, [ticker]: newStock }));
          setLiveQuotes(prev => ({ ...prev, [ticker]: { price: quote.price, change: quote.change || 0 } }));
        }
      } catch (err) { console.error("Stock hydrate failed:", err); }
    }
  };

  // Single-Loader nutzen jetzt das Hydration-System mit IndexedDB-Cache
  const loadInsiderTransactions = async (ticker) => {
    if (insiderData[ticker] !== undefined) return;
    if (insiderLoading[ticker]) return;
    
    setInsiderLoading(prev => ({ ...prev, [ticker]: true }));
    try {
      const { data } = await hydrateInsiderTransactions(ticker, getInsiderTransactions);
      setInsiderData(prev => ({ ...prev, [ticker]: data }));
    } catch (err) {
      console.error("Insider load failed:", err);
      setInsiderData(prev => ({ ...prev, [ticker]: [] }));
    } finally {
      setInsiderLoading(prev => ({ ...prev, [ticker]: false }));
    }
  };
  
  const loadSingleFundamentals = async (ticker) => {
    if (fundamentalsData[ticker]) return;
    try {
      const { data } = await hydrateFundamentals(ticker);
      if (data) setFundamentalsData(prev => ({ ...prev, [ticker]: data }));
    } catch (err) { console.error("Single fundamentals load failed:", err); }
  };

  const loadExecutives = async (ticker) => {
    if (executivesData[ticker]) return;
    try {
      const { data } = await hydrateExecutives(ticker, getExecutives);
      setExecutivesData(prev => ({ ...prev, [ticker]: data }));
    } catch (err) { console.error("Executives load failed:", err); }
  };

  // Lade Candles fuer einen einzelnen Ticker (fuer Day-Trading-Metriken im Detail)
  const loadSingleCandles = async (ticker) => {
    if (candleData[ticker]) return;
    try {
      const { data } = await hydrateCandles(ticker, getDailyCandles);
      if (data) setCandleData(prev => ({ ...prev, [ticker]: data }));
    } catch (err) { console.error("Single candles load failed:", err); }
  };

  const selectStock = async (ticker, hint = {}) => {
    setSelectedStock(ticker);
    setQuery("");
    setLiveSearchResults([]);
    setTab("detail");
    await hydrateStock(ticker, hint);
    
    // Foreground-Promotion: alle Loaders fuer DIESE Aktie sofort, ohne auf Background-Queue zu warten
    if (hint.assetType !== "crypto" && !isCryptoTicker(ticker)) {
      const queue = getTaskQueue();
      
      // Promote: zieht den Task aus Background-Queue raus und fuehrt sofort aus
      queue.promote(`fundamentals:${ticker}`, () => loadSingleFundamentals(ticker));
      queue.promote(`insider:${ticker}`, () => loadInsiderTransactions(ticker));
      queue.promote(`executives:${ticker}`, () => loadExecutives(ticker));
      queue.promote(`candles:${ticker}`, () => loadSingleCandles(ticker));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e4e7ee", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
      <div style={{ borderBottom: "1px solid #1f2937", padding: "20px 32px", position: "sticky", top: 0, zIndex: 50, background: "#0a0e1a" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#10b981", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <span>▲ TRADING INTELLIGENCE / PHASE 02.A</span>
              {apiStatus === "ok" && <span style={{ color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}><Wifi size={10} />LIVE</span>}
              {apiStatus === "error" && <span style={{ color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}><WifiOff size={10} />OFFLINE</span>}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Market Command<span style={{ color: "#10b981" }}>.</span></h1>
            {lastRefresh && (
              <div style={{ fontSize: 9, color: "#6b7280", marginTop: 4, letterSpacing: 1 }}>
                Letzte Aktualisierung: {lastRefresh.toLocaleTimeString()}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={refreshQuotes} disabled={refreshing}
              style={{ background: "#111827", border: "1px solid #1f2937", color: "#e4e7ee", padding: "10px 14px", fontFamily: "inherit", fontSize: 11, letterSpacing: 1.5, fontWeight: 600, borderRadius: 4, cursor: refreshing ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              {refreshing ? "LADEN..." : "REFRESH"}
            </button>
            <button onClick={onLogout}
              title="Ausloggen"
              style={{ background: "transparent", border: "1px solid #1f2937", color: "#6b7280", padding: "10px 12px", fontFamily: "inherit", fontSize: 11, letterSpacing: 1.5, fontWeight: 600, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <LogOut size={12} />
            </button>
            <div style={{ position: "relative", minWidth: 280 }}>
              <Search size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Aktie suchen (jede US-Aktie)..."
                style={{ width: "100%", background: "#111827", border: "1px solid #1f2937", padding: "10px 14px 10px 40px", color: "#e4e7ee", fontFamily: "inherit", fontSize: 12, borderRadius: 4, outline: "none", boxSizing: "border-box" }} />
              {searching && (
                <Loader2 size={12} color="#10b981" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", animation: "spin 1s linear infinite" }} />
              )}
              {liveSearchResults.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#111827", border: "1px solid #1f2937", borderRadius: 4, zIndex: 10, maxHeight: 320, overflowY: "auto" }}>
                  {liveSearchResults.map(s => {
                    const inDB = !!STOCK_DB[s.symbol];
                    const isCrypto = s.assetType === "crypto";
                    const inWL = watchlist.includes(s.symbol);
                    return (
                      <div key={`${s.assetType}-${s.symbol}-${s.id || ""}`}
                        style={{ padding: "10px 14px", borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", fontSize: 12, alignItems: "center", gap: 8 }}>
                        <div onClick={() => selectStock(s.symbol, s)}
                          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                          {s.thumb && <img src={s.thumb} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />}
                          <span style={{ fontWeight: 700, color: isCrypto ? "#f59e0b" : "#10b981" }}>{s.symbol}</span>
                          <span style={{ color: "#6b7280" }}>{s.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {inDB ? (
                            <span style={{ fontSize: 9, color: "#10b981", letterSpacing: 1, background: "rgba(16,185,129,0.1)", padding: "2px 6px", borderRadius: 3 }}>DB</span>
                          ) : isCrypto ? (
                            <span style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 1, background: "rgba(245,158,11,0.1)", padding: "2px 6px", borderRadius: 3 }}>CRYPTO</span>
                          ) : (
                            <span style={{ fontSize: 9, color: "#60a5fa", letterSpacing: 1 }}>LIVE</span>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(s.symbol); }}
                            title={inWL ? "Aus Watchlist entfernen" : "Zur Watchlist hinzufuegen"}
                            style={{ background: "transparent", border: "1px solid " + (inWL ? "#f59e0b" : "#1f2937"), color: inWL ? "#f59e0b" : "#6b7280", padding: "4px 6px", borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center" }}>
                            {inWL ? <Star size={10} fill="#f59e0b" /> : <Plus size={10} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div style={{ maxWidth: 1400, margin: "16px auto 0", display: "flex", gap: 4, borderBottom: "1px solid #1f2937", marginBottom: -21, flexWrap: "wrap" }}>
          {[
            { id: "daily", label: "DAILY", icon: Zap },
            { id: "watchlist", label: `WATCHLIST${watchlist.length > 0 ? ` (${watchlist.length})` : ""}`, icon: Star },
            { id: "longterm", label: "LONG-TERM", icon: Anchor },
            { id: "detail", label: "DEEP DIVE", icon: Target, disabled: !selectedStock },
            { id: "lab", label: "ANALYSIS LAB", icon: Brain, disabled: !selectedStock }
          ].map(t => (
            <button key={t.id} onClick={() => {
              if (t.disabled) return;
              setTab(t.id);
              // Lazy-Load: lade Daten erst wenn Tab geoeffnet wird
              if (t.id === "longterm" && !longTermLoadedOnce && !longTermLoading.inProgress) {
                loadFundamentals();
              }
            }} disabled={t.disabled}
              style={{ background: "transparent", border: "none", borderBottom: tab === t.id ? "2px solid #10b981" : "2px solid transparent", color: tab === t.id ? "#10b981" : t.disabled ? "#374151" : "#9ca3af", padding: "12px 20px", cursor: t.disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: -1 }}>
              <t.icon size={12} />{t.label}
              {t.id === "lab" && <Sparkles size={10} color="#f59e0b" />}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px" }}>
        {tab === "daily" && <DailyTab stocks={dailyRanked} onSelect={selectStock} sortMode={dailySortMode} setSortMode={setDailySortMode} loadedCount={loadedUniverseQuotes} totalCount={50} watchlist={watchlist} onToggleWatchlist={toggleWatchlist} />}
        {tab === "watchlist" && <WatchlistTab stocks={watchlistStocks} onSelect={selectStock} onToggleWatchlist={toggleWatchlist} />}
        {tab === "longterm" && <LongTermTab stocks={longTermRanked} onSelect={selectStock} watchlist={watchlist} onToggleWatchlist={toggleWatchlist} loading={longTermLoading} />}
        {tab === "detail" && selectedStock && getEnrichedStockByTicker(selectedStock) && <DetailTab stock={getEnrichedStockByTicker(selectedStock)} onLab={() => setTab("lab")} isWatched={isInWl(selectedStock)} onToggleWatchlist={() => toggleWatchlist(selectedStock)} fundamentals={fundamentalsData[selectedStock]} liveMetrics={(() => { const det = quoteDetails[selectedStock]; const cnd = candleData[selectedStock]; const stk = getEnrichedStockByTicker(selectedStock); if (!det || !stk) return null; return calcAllMetrics({ price: stk.price, high: det.high, low: det.low, open: det.open, prevClose: det.prevClose, change: stk.change }, cnd); })()} insiderTransactions={insiderData[selectedStock]} insiderLoading={insiderLoading[selectedStock]} executives={executivesData[selectedStock]} />}
        {tab === "lab" && selectedStock && getEnrichedStockByTicker(selectedStock) && <AnalysisLab stock={getEnrichedStockByTicker(selectedStock)} />}

        <div style={{ textAlign: "center", fontSize: 10, color: "#4b5563", letterSpacing: 2, padding: "32px 16px 16px" }}>
          ◆ PHASE 3 · ALL LIVE DATA · NO DEMO · WATCHLIST · ANALYSIS LAB ◆
        </div>
      </div>
    </div>
  );
}

// ============================================
// DAILY TAB - Top 20 aus Top 50 + Crypto Universe
// ============================================
function DailyTab({ stocks, onSelect, sortMode, setSortMode, loadedCount, totalCount, watchlist, onToggleWatchlist }) {
  const loading = loadedCount < totalCount;
  
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Flame size={18} color="#f59e0b" />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Heutige Trading-Chancen</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              {loading ? `Lade Universe... ${loadedCount}/${totalCount}` : `Top 20 aus ${totalCount} US-Aktien + Crypto`}
            </div>
          </div>
        </div>
        
        {/* SORT TOGGLE */}
        <div style={{ display: "flex", gap: 4, background: "#111827", border: "1px solid #1f2937", borderRadius: 4, padding: 3 }}>
          {[
            { id: "change", label: "BEWEGUNG", icon: TrendingUp },
            { id: "score", label: "DAILY SCORE", icon: Activity }
          ].map(opt => (
            <button key={opt.id} onClick={() => setSortMode(opt.id)}
              style={{ background: sortMode === opt.id ? "#1f2937" : "transparent", color: sortMode === opt.id ? "#10b981" : "#9ca3af", border: "none", padding: "6px 10px", fontFamily: "inherit", fontSize: 10, letterSpacing: 1.5, fontWeight: 600, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <opt.icon size={10} />{opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {stocks.map((s, i) => {
          const inWL = watchlist.includes(s.ticker);
          const isPositive = s.change >= 0;
          const m = s.liveMetrics;
          const hasLive = !!m;
          
          return (
            <div key={s.ticker}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 16, display: "grid", gridTemplateColumns: "32px 130px 1fr auto", gap: 16, alignItems: "center", transition: "border-color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}>
              
              <div style={{ fontSize: 18, fontWeight: 700, color: "#374151", textAlign: "center" }}>#{i+1}</div>
              
              <div onClick={() => onSelect(s.ticker)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: s.assetType === "crypto" ? "#f59e0b" : "#10b981" }}>{s.ticker}</span>
                  {s._live && <Wifi size={9} color="#10b981" />}
                </div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{s.sector}</div>
                <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>${formatPrice(s.price)}</div>
              </div>

              {/* LIVE METRIKEN: 4 Felder mit echten Daten */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>24H</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isPositive ? "#10b981" : "#ef4444" }}>
                    {isPositive ? "+" : ""}{(s.change || 0).toFixed(2)}%
                  </div>
                </div>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>RANGE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: hasLive && m.intradayRange > 3 ? "#f59e0b" : "#9ca3af" }}>
                    {hasLive ? formatRange(m.intradayRange) : "—"}
                  </div>
                </div>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>POS T-RNG</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: hasLive && (m.dayRangePosition <= 15 || m.dayRangePosition >= 85) ? "#10b981" : "#9ca3af" }}>
                    {hasLive ? formatRangePosition(m.dayRangePosition) : "—"}
                  </div>
                </div>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>SCORE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: getColor(s.score) }}>{s.score}</div>
                </div>
              </div>

              {/* ACTIONS */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={(e) => { e.stopPropagation(); onToggleWatchlist(s.ticker); }}
                  title={inWL ? "Aus Watchlist entfernen" : "Zur Watchlist hinzufuegen"}
                  style={{ background: "transparent", border: "1px solid " + (inWL ? "#f59e0b" : "#1f2937"), color: inWL ? "#f59e0b" : "#6b7280", padding: 6, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center" }}>
                  {inWL ? <Star size={12} fill="#f59e0b" /> : <Star size={12} />}
                </button>
                <button onClick={() => onSelect(s.ticker)}
                  style={{ background: "#1f2937", border: "none", color: "#10b981", padding: "6px 10px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>
                  DETAILS →
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {stocks.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280", fontSize: 12 }}>
          <Loader2 size={24} style={{ margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
          Lade Marktdaten...
        </div>
      )}
    </div>
  );
}

// ============================================
// WATCHLIST TAB - Deine persoenliche Auswahl
// ============================================
function WatchlistTab({ stocks, onSelect, onToggleWatchlist }) {
  if (stocks.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px", color: "#6b7280" }}>
        <Star size={32} style={{ margin: "0 auto 16px", opacity: 0.4 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#9ca3af", marginBottom: 8 }}>Deine Watchlist ist leer</div>
        <div style={{ fontSize: 12, color: "#6b7280", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
          Such oben nach einer Aktie oder Coin und klick auf das <Plus size={11} style={{ display: "inline", verticalAlign: "middle" }} />-Symbol — oder klick auf den Stern in der Daily-Liste. Deine Auswahl wird im Browser gespeichert.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Star size={18} color="#f59e0b" fill="#f59e0b" />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Deine Watchlist</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{stocks.length} Aktien & Coins — wird im Browser gespeichert</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {stocks.map(s => {
          const isPositive = s.change >= 0;
          return (
            <div key={s.ticker}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 16, display: "grid", gridTemplateColumns: "130px 1fr auto", gap: 16, alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}>
              <div onClick={() => onSelect(s.ticker)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: s.assetType === "crypto" ? "#f59e0b" : "#10b981" }}>{s.ticker}</span>
                  {s._live && <Wifi size={9} color="#10b981" />}
                </div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{s.sector}</div>
                <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>${formatPrice(s.price)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 11 }}>
                <div style={{ padding: "6px 10px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>BEWEGUNG 24H</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isPositive ? "#10b981" : "#ef4444" }}>
                    {isPositive ? "+" : ""}{(s.change || 0).toFixed(2)}%
                  </div>
                </div>
                <div style={{ padding: "6px 10px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>SECTOR</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af" }}>{s.sector || "—"}</div>
                </div>
                <div style={{ padding: "6px 10px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>DAILY SCORE</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: getColor(s.score) }}>{s.score}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={(e) => { e.stopPropagation(); onToggleWatchlist(s.ticker); }}
                  title="Aus Watchlist entfernen"
                  style={{ background: "transparent", border: "1px solid #f59e0b", color: "#f59e0b", padding: 6, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <Star size={12} fill="#f59e0b" />
                </button>
                <button onClick={() => onSelect(s.ticker)}
                  style={{ background: "#1f2937", border: "none", color: "#10b981", padding: "6px 10px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>
                  DETAILS →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// LONG-TERM TAB
// ============================================
function LongTermTab({ stocks, onSelect, watchlist = [], onToggleWatchlist, loading }) {
  const loadedCount = stocks.filter(s => s.fundamentals).length;
  const total = stocks.length;
  const isLoading = loading?.inProgress && loadedCount < total;
  const pct = total > 0 ? Math.round((loadedCount / total) * 100) : 0;
  
  return (
    <div>
      {/* Kompakter Status-Banner statt grosser Loader - Daten erscheinen live unten */}
      {isLoading && (
        <div style={{ 
          background: "linear-gradient(135deg, #111827 0%, #0f1623 100%)",
          border: "1px solid #1f2937",
          borderRadius: 6,
          padding: "12px 18px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#10b981",
            boxShadow: "0 0 12px #10b981",
            animation: "pulse-dot 1.2s ease-in-out infinite",
            flexShrink: 0
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#10b981", fontWeight: 700, marginBottom: 4 }}>
              ◆ HYDRATING FUNDAMENTAL DATA
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              {loadedCount}/{total} geladen · Multi-Source: Finnhub + Yahoo Fallback · Daten erscheinen live
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981", fontFamily: "'JetBrains Mono', monospace", minWidth: 60, textAlign: "right" }}>
            {pct}%
          </div>
          {/* Progress Bar am Boden */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "#1f2937" }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(90deg, #10b981, #10b981aa)",
              transition: "width 0.4s ease-out",
              boxShadow: "0 0 8px #10b98177"
            }} />
          </div>
          <style>{`@keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }`}</style>
        </div>
      )}
      
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Anchor size={18} color="#10b981" />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Langfristige Kauf-Kandidaten</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Bewertet nach Profitabilitaet, Wachstum, Bewertung, Financial Health
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {stocks.map((s, i) => {
          const inWL = watchlist.includes(s.ticker);
          const hasFund = !!s.fundamentals;
          const f = s.fundamentals || {};
          const b = s.breakdown;
          const epsGrowth = f.epsGrowth5Y != null ? f.epsGrowth5Y : f.epsGrowthTTMYoy;
          const revGrowth = f.revenueGrowth5Y != null ? f.revenueGrowth5Y : f.revenueGrowthTTMYoy;
          
          return (
            <div key={s.ticker}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 16, display: "grid", gridTemplateColumns: "32px 130px 1fr auto", gap: 16, alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}>
              
              <div style={{ fontSize: 18, fontWeight: 700, color: "#374151", textAlign: "center" }}>#{i+1}</div>
              
              <div onClick={() => onSelect(s.ticker)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{s.ticker}</span>
                  {s._live && <Wifi size={9} color="#10b981" />}
                </div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{s.sector}</div>
                <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>${formatPrice(s.price)}</div>
              </div>

              {/* 5 ECHTE FUNDAMENTAL-METRIKEN */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, fontSize: 11 }}>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>ROE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: f.roe == null ? "#4b5563" : (f.roe >= 15 ? "#10b981" : f.roe >= 5 ? "#f59e0b" : "#ef4444") }}>
                    {formatPct(f.roe)}
                  </div>
                </div>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>EPS GROWTH</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: epsGrowth == null ? "#4b5563" : (epsGrowth > 10 ? "#10b981" : epsGrowth > 0 ? "#f59e0b" : "#ef4444") }}>
                    {formatPct(epsGrowth)}
                  </div>
                </div>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>P/E</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: f.pe == null ? "#4b5563" : (f.pe < 25 ? "#10b981" : f.pe < 40 ? "#f59e0b" : "#ef4444") }}>
                    {formatRatio(f.pe)}
                  </div>
                </div>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>PEG</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: f.peg == null ? "#4b5563" : (f.peg > 0 && f.peg < 1 ? "#10b981" : f.peg < 2 ? "#f59e0b" : "#ef4444") }}>
                    {formatRatio(f.peg)}
                  </div>
                </div>
                <div style={{ padding: "6px 8px", background: "#0a0e1a", borderRadius: 4 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>D/E</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: f.debtToEquity == null ? "#4b5563" : (f.debtToEquity < 0.5 ? "#10b981" : f.debtToEquity < 1.5 ? "#f59e0b" : "#ef4444") }}>
                    {formatRatio(f.debtToEquity)}
                  </div>
                </div>
              </div>

              {/* ACTIONS + SCORE */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={(e) => { e.stopPropagation(); onToggleWatchlist && onToggleWatchlist(s.ticker); }}
                  title={inWL ? "Aus Watchlist" : "Zur Watchlist"}
                  style={{ background: "transparent", border: "1px solid " + (inWL ? "#f59e0b" : "#1f2937"), color: inWL ? "#f59e0b" : "#6b7280", padding: 6, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center" }}>
                  {inWL ? <Star size={12} fill="#f59e0b" /> : <Star size={12} />}
                </button>
                <div style={{ textAlign: "right", minWidth: 50 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: getColor(s.score), lineHeight: 1 }}>{s.score}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// DETAIL TAB - alles live
// ============================================
function DetailTab({ stock: s, onLab, isWatched, onToggleWatchlist, fundamentals, liveMetrics, insiderTransactions, insiderLoading, executives }) {
  // Long-Term Score live
  const longScore = calcLongTermScoreLive(fundamentals) ?? 50;
  // Daily Score: nutze Live wenn vorhanden, sonst fallback
  const dailyScore = liveMetrics ? calcLiveDailyScore(liveMetrics, s) : 50;
  
  const breakdown = getLongTermBreakdown(fundamentals);
  const f = fundamentals || {};
  const m = liveMetrics || {};
  const isCrypto = s.assetType === "crypto";

  return (
    <div>
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280" }}>{(s.sector || "—").toUpperCase()}{s.marketCap ? ` · MCAP ${s.marketCap}` : ""}</div>
            <div style={{ fontSize: 42, fontWeight: 700, color: isCrypto ? "#f59e0b" : "#10b981", lineHeight: 1.1, marginTop: 4 }}>{s.ticker}</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{s.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 600 }}>${formatPrice(s.price)}</div>
              <div style={{ fontSize: 13, color: s.change >= 0 ? "#10b981" : "#ef4444" }}>
                {s.change >= 0 ? "+" : ""}{(s.change || 0).toFixed(2)}%
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <ScoreCard label="DAILY" icon={Zap} score={dailyScore} />
            <ScoreCard label="LONG-TERM" icon={Anchor} score={longScore} />
            <button onClick={onToggleWatchlist}
              title={isWatched ? "Aus Watchlist entfernen" : "Zur Watchlist hinzufuegen"}
              style={{ background: isWatched ? "rgba(245,158,11,0.15)" : "transparent", border: "1px solid " + (isWatched ? "rgba(245,158,11,0.5)" : "#1f2937"), borderRadius: 4, padding: "12px 14px", color: isWatched ? "#f59e0b" : "#9ca3af", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, height: "fit-content" }}>
              <Star size={14} fill={isWatched ? "#f59e0b" : "none"} />
              {isWatched ? "GESPEICHERT" : "WATCHLIST"}
            </button>
            <button onClick={onLab} style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(96,165,250,0.15))", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 4, padding: "12px 16px", color: "#10b981", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, height: "fit-content" }}>
              <Brain size={14} />ANALYSIS LAB<Sparkles size={12} color="#f59e0b" />
            </button>
          </div>
        </div>
      </div>

      {/* SCORE BREAKDOWN: Long-Term */}
      {breakdown && (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #1f2937" }}>
            <Anchor size={14} color="#10b981" />
            <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>LONG-TERM SCORE BREAKDOWN</div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>Live von Finnhub</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <BreakdownCard label="PROFITABILITAET" weight="30%" score={breakdown.profitability} />
            <BreakdownCard label="WACHSTUM" weight="30%" score={breakdown.growth} />
            <BreakdownCard label="BEWERTUNG" weight="25%" score={breakdown.valuation} />
            <BreakdownCard label="HEALTH" weight="15%" score={breakdown.health} />
          </div>
        </div>
      )}

      {/* INSIDER ACTIVITY PANEL */}
      {!isCrypto && (
        <InsiderPanel transactions={insiderTransactions} loading={insiderLoading} executives={executives} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* DAILY LIVE METRIKEN */}
        <DetailPanel title="DAILY LIVE METRIKEN" icon={Zap} color="#f59e0b">
          {liveMetrics ? (
            <>
              <DetailRow label="Intraday Range" value={formatRange(m.intradayRange)} textValue />
              <DetailRow label="Position im Tagesbereich" value={formatRangePosition(m.dayRangePosition)} textValue />
              <DetailRow label="Distance vom Open" value={formatRange(m.distanceFromOpen)} textValue />
              <DetailRow label="Range vs Average" value={formatRangeMultiplier(m.rangeVsAverage)} textValue />
              <DetailRow label="Momentum" value={formatMomentum(m.momentum)} textValue />
            </>
          ) : (
            <MiniLoader label="DAY-TRADING DATA" color="#f59e0b" />
          )}
        </DetailPanel>

        {/* LONG-TERM FUNDAMENTALS */}
        <DetailPanel title="FUNDAMENTALDATEN" icon={Anchor} color="#10b981">
          {fundamentals ? (
            <>
              <DetailRow label="ROE" value={formatPct(f.roe)} textValue />
              <DetailRow label="Net Margin" value={formatPct(f.netMargin)} textValue />
              <DetailRow label="EPS Growth 5Y" value={formatPct(f.epsGrowth5Y ?? f.epsGrowthTTMYoy)} textValue />
              <DetailRow label="Revenue Growth 5Y" value={formatPct(f.revenueGrowth5Y ?? f.revenueGrowthTTMYoy)} textValue />
              <DetailRow label="P/E Ratio" value={formatRatio(f.pe)} textValue />
              <DetailRow label="PEG Ratio" value={formatRatio(f.peg)} textValue />
              <DetailRow label="P/B Ratio" value={formatRatio(f.pb)} textValue />
              <DetailRow label="Debt/Equity" value={formatRatio(f.debtToEquity)} textValue />
              <DetailRow label="Beta" value={formatRatio(f.beta)} textValue />
              <DetailRow label="52W High" value={f.week52High ? `$${formatPrice(f.week52High)}` : "—"} textValue />
              <DetailRow label="52W Low" value={f.week52Low ? `$${formatPrice(f.week52Low)}` : "—"} textValue />
            </>
          ) : (
            isCrypto ? (
              <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 12 }}>
                Fundamentaldaten nicht verfuegbar fuer Crypto
              </div>
            ) : (
              <MiniLoader label="FUNDAMENTAL DATA" color="#10b981" />
            )
          )}
        </DetailPanel>
      </div>
    </div>
  );
}

// ============================================
// TICKER TAPE LOADER - Schoene Bloomberg-style Animation
// ============================================
function TickerTapeLoader({ title, subtitle, loaded, total, currentTicker, tickers = [], color = "#10b981" }) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  
  // Tape mit den Tickers animiert durchscrollen lassen
  const displayTickers = tickers && tickers.length > 0 ? tickers : ["LOADING"];
  
  // Generiere fake "Preisbewegungen" fuer Animation (rein visuell)
  const generateFakePrice = (ticker, idx) => {
    const seed = ticker.charCodeAt(0) + idx;
    const change = ((seed % 200) - 100) / 100; // -1 bis +1
    return change;
  };
  
  return (
    <div style={{ 
      background: "linear-gradient(135deg, #111827 0%, #0f1623 100%)",
      border: "1px solid #1f2937",
      borderRadius: 8,
      padding: "32px 28px",
      marginBottom: 20,
      overflow: "hidden",
      position: "relative"
    }}>
      {/* Glow-Effekt im Hintergrund */}
      <div style={{
        position: "absolute",
        top: -50,
        left: `${pct - 10}%`,
        width: 200,
        height: 200,
        background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
        pointerEvents: "none",
        transition: "left 0.6s ease-out"
      }} />
      
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ 
              width: 8, height: 8, borderRadius: "50%", background: color,
              boxShadow: `0 0 12px ${color}`,
              animation: "pulse-dot 1.2s ease-in-out infinite"
            }} />
            <div style={{ fontSize: 10, letterSpacing: 3, color: color, fontWeight: 700 }}>
              {title}
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{subtitle}</div>
        </div>
        
        {/* Counter */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: color, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            {loaded}<span style={{ color: "#4b5563", fontSize: 22 }}>/{total}</span>
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 2, marginTop: 4 }}>{pct}% LOADED</div>
        </div>
      </div>
      
      {/* PROGRESS BAR */}
      <div style={{ position: "relative", marginBottom: 22 }}>
        <div style={{ 
          height: 6,
          background: "#1f2937",
          borderRadius: 3,
          overflow: "hidden",
          position: "relative"
        }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color} 0%, ${color}aa 100%)`,
            borderRadius: 3,
            transition: "width 0.4s ease-out",
            boxShadow: `0 0 10px ${color}77`,
            position: "relative"
          }}>
            {/* Shimmer effect */}
            <div style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 40,
              height: "100%",
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              animation: "shimmer 1.5s ease-in-out infinite",
              opacity: 0.8
            }} />
          </div>
        </div>
      </div>
      
      {/* CURRENT TICKER + TAPE */}
      <div style={{ 
        background: "#0a0e1a",
        borderRadius: 4,
        padding: "10px 14px",
        border: "1px solid #1f2937",
        display: "flex",
        alignItems: "center",
        gap: 14,
        overflow: "hidden",
        position: "relative"
      }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", flexShrink: 0 }}>NOW:</div>
        <div style={{ 
          fontSize: 13,
          fontWeight: 700,
          color: color,
          letterSpacing: 1,
          flexShrink: 0,
          minWidth: 60
        }}>
          {currentTicker || "..."}
        </div>
        
        {/* Animated Ticker Tape */}
        <div style={{ flex: 1, overflow: "hidden", height: 22, position: "relative", maskImage: "linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)" }}>
          <div style={{ 
            display: "flex",
            gap: 24,
            position: "absolute",
            whiteSpace: "nowrap",
            animation: "ticker-scroll 25s linear infinite",
            alignItems: "center",
            height: "100%"
          }}>
            {[...displayTickers, ...displayTickers, ...displayTickers].map((t, i) => {
              const fakeChange = generateFakePrice(t, i);
              const isPos = fakeChange >= 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  <span style={{ color: "#9ca3af", fontWeight: 600 }}>{t}</span>
                  <span style={{ color: isPos ? "#10b981" : "#ef4444", fontSize: 10 }}>
                    {isPos ? "▲" : "▼"} {Math.abs(fakeChange).toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-50px); }
          100% { transform: translateX(50px); }
        }
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ============================================
// MINI LOADER - kompakte Version fuer einzelne Detail-Bereiche
// ============================================
function MiniLoader({ label, color = "#10b981" }) {
  return (
    <div style={{ 
      padding: "24px 16px",
      textAlign: "center",
      color: "#6b7280",
      fontSize: 11
    }}>
      <div style={{ 
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        background: "#0a0e1a",
        border: `1px solid ${color}33`,
        borderRadius: 4,
        marginBottom: 10
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: color,
          boxShadow: `0 0 8px ${color}`,
          animation: "pulse-dot 1s ease-in-out infinite"
        }} />
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: color, fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
}

function BreakdownCard({ label, weight, score }) {
  return (
    <div style={{ padding: 14, background: "#0a0e1a", borderRadius: 4, border: "1px solid #1f2937" }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#6b7280", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span><span>{weight}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: getColor(score), lineHeight: 1 }}>{score}</div>
      <div style={{ height: 3, background: "#1f2937", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: getColor(score), transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ============================================
// INSIDER PANEL - Live SEC Form 4 Filings
// ============================================
function InsiderPanel({ transactions, loading, executives }) {
  const [showAllSells, setShowAllSells] = useState(false);
  const [showAllBuys, setShowAllBuys] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({}); // { "name:date": true }
  
  const isLoaded = transactions !== undefined && !loading;
  const txs = transactions || [];
  const execs = executives || [];
  
  // Reichere Transaktionen mit Position an
  const enrichedTxs = useMemo(() => {
    return txs.map(t => ({
      ...t,
      matchedRole: matchInsiderRole(t.name, execs)
    }));
  }, [txs, execs]);
  
  // Gruppiere Transaktionen pro Insider + Tag
  const grouped = useMemo(() => {
    const buyGroups = {};
    const sellGroups = {};
    
    enrichedTxs.forEach(t => {
      const key = `${t.name}::${t.date}`;
      const target = (t.action === "bought" || t.action === "acquired") ? buyGroups : sellGroups;
      // Verkaeufe = nur action "sold". Andere actions als Kauf werten.
      const isBuy = t.action === "bought" || t.action === "acquired";
      const groupTarget = isBuy ? buyGroups : sellGroups;
      
      if (!groupTarget[key]) {
        groupTarget[key] = {
          name: t.name,
          date: t.date,
          role: t.matchedRole,
          trades: [],
          totalShares: 0,
          totalValue: 0,
          avgPrice: 0,
          hasRealBuy: false // Code P = echter Kauf
        };
      }
      groupTarget[key].trades.push(t);
      groupTarget[key].totalShares += t.shares || 0;
      groupTarget[key].totalValue += t.value || 0;
      if (t.code === "P") groupTarget[key].hasRealBuy = true;
    });
    
    // Average Price berechnen + zu Arrays
    const toArray = (obj) => Object.entries(obj).map(([key, g]) => ({
      ...g,
      key,
      avgPrice: g.totalShares > 0 ? g.totalValue / g.totalShares : 0
    }));
    
    return {
      buys: toArray(buyGroups).sort((a, b) => new Date(b.date) - new Date(a.date)),
      sells: toArray(sellGroups).sort((a, b) => new Date(b.date) - new Date(a.date))
    };
  }, [enrichedTxs]);
  
  // Sentiment basiert nur auf ECHTEN Kaeufen (Code P) vs Verkaeufen
  const sentiment = useMemo(() => {
    if (!txs || txs.length === 0) return null;
    const realBuys = enrichedTxs.filter(t => t.action === "bought" && t.code === "P");
    const sells = enrichedTxs.filter(t => t.action === "sold");
    
    const totalBuy = realBuys.reduce((s, t) => s + (t.value || 0), 0);
    const totalSell = sells.reduce((s, t) => s + (t.value || 0), 0);
    const uniqueBuyers = new Set(realBuys.map(t => t.name)).size;
    
    let score = 50;
    const total = totalBuy + totalSell;
    if (total > 0) score = Math.round((totalBuy / total) * 100);
    if (uniqueBuyers >= 3) score = Math.min(100, score + 15);
    
    let signal = "neutral";
    if (uniqueBuyers === 0 && sells.length > 0) signal = "bearish";
    else if (score >= 70 && totalBuy > 100000) signal = "bullish";
    else if (score >= 85) signal = "very_bullish";
    else if (score <= 30 && totalSell > 1000000) signal = "bearish";
    
    return { score, totalBuy, totalSell, buyCount: realBuys.length, sellCount: sells.length, uniqueBuyers, signal };
  }, [enrichedTxs]);
  
  const formatValue = (v) => {
    if (v >= 1000000) return `$${(v/1000000).toFixed(2)}M`;
    if (v >= 1000) return `$${(v/1000).toFixed(0)}K`;
    return `$${(v || 0).toFixed(0)}`;
  };
  
  const formatShares = (s) => {
    if (s >= 1000000) return `${(s/1000000).toFixed(2)}M`;
    if (s >= 1000) return `${(s/1000).toFixed(0)}K`;
    return (s || 0).toString();
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const signalColors = {
    very_bullish: "#10b981",
    bullish: "#10b981",
    neutral: "#9ca3af",
    bearish: "#ef4444",
    very_bearish: "#ef4444",
    no_data: "#9ca3af"
  };
  const signalText = {
    very_bullish: "STARK BULLISCH",
    bullish: "BULLISCH",
    neutral: "NEUTRAL",
    bearish: "BAERISCH",
    very_bearish: "STARK BAERISCH",
    no_data: "KEINE DATEN"
  };

  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #1f2937" }}>
        <User size={14} color="#f59e0b" />
        <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>INSIDER ACTIVITY (90 TAGE)</div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>SEC Form 4 Filings · Live</div>
      </div>

      {!isLoaded ? (
        <MiniLoader label="INSIDER TRANSACTIONS" color="#f59e0b" />
      ) : enrichedTxs.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 12 }}>
          Keine Insider-Aktivitaet in den letzten 90 Tagen.
        </div>
      ) : (
        <>
          {/* SENTIMENT SUMMARY */}
          {sentiment && (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 16, marginBottom: 20, padding: 14, background: "#0a0e1a", borderRadius: 4, border: "1px solid #1f2937", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>SIGNAL</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: signalColors[sentiment.signal] }}>{signalText[sentiment.signal]}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Score: {sentiment.score}/100</div>
              </div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>ECHTE KAEUFE (P)</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{formatValue(sentiment.totalBuy)}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{sentiment.buyCount} Trades · {sentiment.uniqueBuyers} unique</div>
              </div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>VERKAUFS-VOL</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{formatValue(sentiment.totalSell)}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{sentiment.sellCount} Trades</div>
              </div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#6b7280", marginBottom: 4 }}>CLUSTER BUYING</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: sentiment.uniqueBuyers >= 3 ? "#10b981" : "#9ca3af" }}>
                  {sentiment.uniqueBuyers >= 3 ? "JA" : "NEIN"}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                  {sentiment.uniqueBuyers >= 3 ? "starkes Signal!" : `${sentiment.uniqueBuyers} Käufer`}
                </div>
              </div>
            </div>
          )}

          {/* ZWEI-SPALTEN-LAYOUT: KAEUFE | VERKAEUFE */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            
            {/* KAEUFE */}
            <div style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: "1px dashed rgba(16,185,129,0.2)" }}>
                <ArrowUpRight size={12} color="#10b981" />
                <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, color: "#10b981" }}>KAEUFE & ACQUISITIONS</div>
                <div style={{ marginLeft: "auto", fontSize: 10, color: "#6b7280" }}>{grouped.buys.length} Gruppen</div>
              </div>
              {grouped.buys.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "#6b7280", fontSize: 11 }}>
                  Keine Kaeufe in den letzten 90 Tagen.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(showAllBuys ? grouped.buys : grouped.buys.slice(0, 8)).map(g => (
                    <InsiderGroup 
                      key={g.key} 
                      group={g} 
                      type="buy" 
                      expanded={!!expandedGroups[g.key]}
                      onToggle={() => toggleGroup(g.key)}
                      formatValue={formatValue}
                      formatShares={formatShares}
                    />
                  ))}
                  {grouped.buys.length > 8 && (
                    <button onClick={() => setShowAllBuys(!showAllBuys)}
                      style={{ background: "transparent", border: "1px dashed rgba(16,185,129,0.3)", color: "#10b981", padding: "8px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, letterSpacing: 1.5, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                      {showAllBuys ? "WENIGER ZEIGEN" : `+ ${grouped.buys.length - 8} WEITERE`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* VERKAEUFE */}
            <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: "1px dashed rgba(239,68,68,0.2)" }}>
                <ArrowDownRight size={12} color="#ef4444" />
                <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, color: "#ef4444" }}>VERKAEUFE</div>
                <div style={{ marginLeft: "auto", fontSize: 10, color: "#6b7280" }}>{grouped.sells.length} Gruppen</div>
              </div>
              {grouped.sells.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "#6b7280", fontSize: 11 }}>
                  Keine Verkaeufe.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(showAllSells ? grouped.sells : grouped.sells.slice(0, 5)).map(g => (
                    <InsiderGroup 
                      key={g.key} 
                      group={g} 
                      type="sell" 
                      expanded={!!expandedGroups[g.key]}
                      onToggle={() => toggleGroup(g.key)}
                      formatValue={formatValue}
                      formatShares={formatShares}
                    />
                  ))}
                  {grouped.sells.length > 5 && (
                    <button onClick={() => setShowAllSells(!showAllSells)}
                      style={{ background: "transparent", border: "1px dashed rgba(239,68,68,0.3)", color: "#ef4444", padding: "8px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, letterSpacing: 1.5, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                      {showAllSells ? "WENIGER ZEIGEN" : `+ ${grouped.sells.length - 5} WEITERE`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Sub-Komponente: Eine Insider-Gruppe (zusammengefasst + ausklappbar)
function InsiderGroup({ group, type, expanded, onToggle, formatValue, formatShares }) {
  const color = type === "buy" ? "#10b981" : "#ef4444";
  const isMultiTrade = group.trades.length > 1;
  
  return (
    <div style={{ 
      background: "#0a0e1a",
      border: `1px solid ${color}22`,
      borderRadius: 4,
      overflow: "hidden",
      transition: "border-color 0.2s"
    }}>
      {/* HEADER (klickbar) */}
      <div onClick={onToggle}
        style={{ 
          padding: "10px 12px",
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 12,
          alignItems: "center"
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#0f1623"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
            <User size={10} color="#f59e0b" style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</span>
            {isMultiTrade && (
              <span style={{ background: `${color}22`, color: color, fontSize: 8, padding: "2px 5px", borderRadius: 2, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>
                {group.trades.length}x
              </span>
            )}
            {group.hasRealBuy && (
              <span style={{ background: "#10b98122", color: "#10b981", fontSize: 8, padding: "2px 5px", borderRadius: 2, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>
                ECHT
              </span>
            )}
          </div>
          {group.role && (
            <div style={{ fontSize: 9, color: "#10b981", marginTop: 2, letterSpacing: 0.5, fontWeight: 600 }}>{group.role}</div>
          )}
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{group.date}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color }}>{formatValue(group.totalValue)}</div>
          <div style={{ fontSize: 9, color: "#6b7280" }}>{formatShares(group.totalShares)} @ ${formatPrice(group.avgPrice)}</div>
        </div>
        <div style={{ color: "#6b7280", fontSize: 14, paddingLeft: 4, transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          ›
        </div>
      </div>
      
      {/* EXPANDED DETAILS */}
      {expanded && (
        <div style={{ borderTop: `1px dashed ${color}22`, padding: "8px 12px", background: "#06080f" }}>
          <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1.5, marginBottom: 6 }}>EINZEL-TRADES</div>
          {group.trades.map((t, i) => {
            const codeLabel = { P: "ECHTER KAUF", S: "VERKAUF", A: "AWARD", M: "OPTIONS", G: "GESCHENK" }[t.code] || t.code;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, padding: "6px 0", fontSize: 10, borderBottom: i < group.trades.length - 1 ? "1px dotted #1f2937" : "none", alignItems: "center" }}>
                <div style={{ background: `${color}15`, color, padding: "2px 6px", borderRadius: 2, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
                  {codeLabel}
                </div>
                <div style={{ color: "#9ca3af" }}>
                  {formatShares(t.shares)} @ ${formatPrice(t.price)}
                </div>
                <div style={{ fontWeight: 700, color, fontSize: 11 }}>{formatValue(t.value)}</div>
              </div>
            );
          })}
          {group.trades[0]?.filingDate && (
            <div style={{ fontSize: 9, color: "#6b7280", marginTop: 6, fontStyle: "italic" }}>
              SEC-Filing: {group.trades[0].filingDate}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// DEMO ANALYSIS DATA - für Testing ohne API
// ============================================
const DEMO_ANALYSES = {
  NVDA: {
    scenarios: {
      bull: { probability: 45, priceTarget: 240, thesis: "Hyperscaler-CapEx bleibt erhoeht, Blackwell-Chips dominieren Markt, Software-Moat (CUDA) wird tiefer. Enterprise-AI-Adoption beschleunigt sich.", keyDrivers: ["Microsoft/Google/Meta CapEx >$300B", "Blackwell Uebergangs-Cycle ohne Verzoegerung", "Sovereign-AI-Nachfrage (EU, Mittlerer Osten)"], triggers: ["Q1 Guidance >$45B Revenue", "China-Export-Deal", "Enterprise-AI Inferenz-Boom"] },
      base: { probability: 40, priceTarget: 195, thesis: "Wachstum normalisiert sich auf 30-40% YoY, Marge stabilisiert bei 70%+. Konkurrenz (AMD, Custom Silicon) knabbert langsam Marktanteil, aber NVDA behaelt Krone.", keyDrivers: ["Data Center Revenue waechst 25-30%", "Gaming/Auto-Segmente stabil", "FCF bleibt stark >$60B"], triggers: ["Keine groesseren Enttaeuschungen", "AMD MI350 < Erwartung", "Keine China-Eskalation"] },
      bear: { probability: 15, priceTarget: 135, thesis: "Hyperscaler reduzieren CapEx abrupt (Ueberkapazitaet), Custom-Chips (Google TPU, AWS Trainium) nehmen 20%+ Marktanteil, KI-Investment-Blase platzt.", keyDrivers: ["Microsoft/Meta CapEx-Cut", "AWS Trainium3 liefert >80% NVDA Performance", "Enterprise-AI ROI enttaeuscht"], triggers: ["Ein Hyperscaler announced CapEx-Reduktion", "AMD gewinnt grossen Deal (Oracle, Meta)", "Taiwan-Krise"] },
      summary: "Aktuelle Bewertung preist base-case ein; bull-case erfordert Beweis dass Hyperscaler-CapEx weiter steigt."
    },
    macro: {
      fedRates: { impact: "negative", strength: 65, explanation: "Hohe Zinsen belasten Growth-Multiples. Zinssenkung wuerde NVDA-Multiple expandieren lassen, da zukuenftige Cashflows mehr wert werden." },
      inflation: { impact: "neutral", strength: 40, explanation: "NVDA hat Pricing-Power (70%+ Marge), Inflation kann weitergegeben werden. Aber Input-Kosten bei TSMC steigen leicht." },
      dollarStrength: { impact: "negative", strength: 55, explanation: "~56% Revenue ausserhalb USA. Starker Dollar senkt umgerechnete Auslandsumsaetze, besonders China/Japan/Europa." },
      consumerSpending: { impact: "neutral", strength: 35, explanation: "NVDA ist primaer B2B (Hyperscaler, Enterprise). Gaming-Segment (~10% Rev) etwas sensitiv, aber nicht entscheidend." },
      liquidityConditions: { impact: "positive", strength: 80, explanation: "Lockere Liquiditaet = Hyperscaler finanzieren CapEx leichter + Risk-On-Umfeld favorisiert High-Beta-Tech. Kernfahrer der NVDA-Rally." },
      keyTakeaway: "NVDA ist extrem sensitiv fuer Liquiditaets-Bedingungen und Hyperscaler-CapEx-Zyklen. Fed-Pivot waere Rocket-Fuel; China/Taiwan-Eskalation kritisches Abwaertsrisiko."
    },
    "event:China blockiert Taiwan": {
      immediateImpact: { direction: "down", magnitude: "extreme", timeframe: "hours", priceMove: "-25% bis -40%" },
      mediumTerm: { direction: "down", explanation: "TSMC produziert ~90% der fortgeschrittenen NVDA-Chips. Blockade = Produktions-Stop. Selbst bei Wiederaufnahme nach Monaten waere Supply Chain massiv gestoert. Samsung/Intel koennen Luecke nicht schliessen." },
      cascadingEffects: ["Gesamter Halbleiter-Sektor faellt 20-30%", "Hyperscaler-CapEx wird gecancelt bis Klarheit", "KI-Nachfrage bleibt, aber Angebot bricht weg -> Preis-Explosion fuer bestehende GPUs"],
      hedgingIdeas: ["Puts auf SMH ETF", "Long Intel (US-Fab profitiert langfristig)", "Long Samsung/SK Hynix (Korea als Ausweich)", "Gold als Safe-Haven"],
      probability: 8,
      tradingIdea: "Permanente Tail-Risk-Absicherung via 10% OTM Puts auf SMH, 6-Monats-Laufzeit. Kosten ~2% des Portfolios, versichert gegen Extremszenario."
    },
    sector: {
      currentCycle: "mid",
      sectorPosition: "leading",
      relativeStrength: 88,
      favoredScenarios: ["KI-CapEx-Zyklus laeuft weiter 2-3 Jahre", "Fed-Pivot zu neutralen Zinsen", "Enterprise-AI-Adoption beschleunigt"],
      rotatingInto: ["AI-Infrastruktur (NVDA, AMD, ASML)", "Hyperscaler (MSFT, GOOGL, META)", "Power/Utilities (Strombedarf)"],
      rotatingOutOf: ["Zykliker (Industrials)", "Consumer Discretionary (ausser AI-Plays)", "Small-Cap Tech"],
      stockVsPeers: "NVDA fuehrt vor AMD (MI-Serie 2-3 Generationen zurueck) und Intel (Gaudi kaum Marktanteil). Custom-Silicon von Cloud-Providern ist groesste Langfrist-Bedrohung, nicht direkte Chip-Konkurrenz.",
      recommendation: "Overweight. NVDA ist der Goldstandard fuer AI-Compute-Exposure. Timing-Risiko hoch, aber Position im Portfolio gerechtfertigt solange Hyperscaler-CapEx-Story intakt ist."
    },
    political: {
      tariffRisk: { level: "medium", affectedRevenue: "~13% China Revenue (direkt)", details: "Trump-Admin koennte KI-Chip-Exporte weiter beschraenken. NVDA hat H20 speziell fuer China entwickelt, aber weitere Restriktionen moeglich." },
      sanctionsRisk: { level: "high", details: "Taiwan-Abhaengigkeit via TSMC ist kritisch. Jegliche Eskalation China-Taiwan haette existenzielle Auswirkungen. US-Exportkontrolle gegen China verschaerft sich laufend." },
      regulatoryRisk: { level: "medium", details: "FTC-Untersuchung zu NVDAs Marktdominanz im AI-Chip-Bereich. EU/UK pruefen potentielle antitrust-Themen. CUDA-Oekosystem koennte ins Visier geraten." },
      electionRisk: { level: "low", details: "Beide US-Parteien unterstuetzen heimische Chip-Produktion und Eindaemmung Chinas. Politische Kontinuitaet fuer NVDA-Geschaeft." },
      geopoliticalHotspots: ["Taiwan-Strait", "US-China Tech-War", "EU Chips Act", "Naher Osten (Sovereign-AI-Deals)"],
      overallRiskScore: 68,
      keyWatchPoints: ["Taiwan-Wahlen und Rhetorik aus Peking", "Neue US-Export-Kontrollen", "TSMC Arizona-Ramp-up", "China Inlands-Chip-Entwicklung (Huawei Ascend)"]
    },
    historical: {
      parallels: [
        {
          name: "Cisco Systems — Dot-Com Peak",
          date: "2000-03",
          similarity: 72,
          situation: "Cisco war Platzhirsch fuer Internet-Infrastruktur, ~80% Marktanteil bei Routern. PE-Ratio ueber 200, alle groessten Tech-Firmen kauften massiv Infrastructure. Analysten erwarteten kontinuierliches 30%+ Wachstum.",
          expectedAtTime: "Analysten erwarteten Fortsetzung des Infrastructure-Booms, Kurszielen von $100+ (Cisco stand bei $80). Narrative: 'Cisco baut das Rueckgrat des Internets'.",
          actualOutcome: "Peak im Maerz 2000 bei ~$80. Dann 86% Crash bis Oktober 2002 auf $11. Cisco-Business war real, aber Ueberkapazitaeten bei Telekoms fuehrten zu Bestell-Collapse. 20+ Jahre spaeter immer noch unter 2000er-Hoch.",
          performance: { "1m": "-8%", "3m": "-28%", "6m": "-52%", "12m": "-78%" },
          lesson: "Echtes Wachstum kann reale Ueber-Investition vertuschen. Wenn die groessten Kunden 80% ihrer Zukunfts-CapEx vorziehen, crasht die Nachfrage danach brutal."
        },
        {
          name: "Huawei-Sanktionen",
          date: "2019-05",
          similarity: 65,
          situation: "US blockiert Verkauf von US-Halbleiter-Tech an Huawei. Analoge Situation zu heutiger NVDA-China-Dynamik.",
          expectedAtTime: "Analysten erwarteten begrenzten Schaden, da Huawei nur 5-10% der Revenue einzelner Chip-Firmen ausmachte.",
          actualOutcome: "Kurzfristig -5-10% fuer betroffene Chip-Aktien, aber langfristig erzwang es China-Alternativen. Heute: SMIC produziert 7nm, Huawei Ascend ist echter NVDA-Rivale geworden.",
          performance: { "1m": "-7%", "3m": "+2%", "6m": "+12%", "12m": "+45%" },
          lesson: "Exportkontrollen treiben kurzfristig Unsicherheit, beschleunigen aber langfristig Konkurrenz-Entwicklung im Zielland. China-Chip-Ecosystem ist heute wegen der Sanktionen widerstandsfaehiger."
        },
        {
          name: "Intel Datacenter-Dominanz Peak",
          date: "2020-07",
          similarity: 58,
          situation: "Intel hatte 95%+ Marktanteil bei Server-CPUs, 60%+ Bruttomarge, galt als unangreifbar. Genau wie NVDA heute im GPU-Markt.",
          expectedAtTime: "Konsensus: Intel's Manufacturing-Vorsprung und x86-Oekosystem-Moat sind uneinholbar. Kursziele bei $75+.",
          actualOutcome: "AMD holte CPU-Fuehrung zurueck (EPYC), TSMC ueberholte Intel-Fab, Custom-Silicon (Apple M1, AWS Graviton) griff x86 an. Intel-Aktie verlor 60% von 2020-2024.",
          performance: { "1m": "-3%", "3m": "+5%", "6m": "-12%", "12m": "-25%" },
          lesson: "Moats in der Chip-Industrie erodieren langsamer als erwartet, aber dann schneller. Custom-Silicon ist genau die Bedrohung, die Intel verpasst hat — und die jetzt NVDA droht."
        },
        {
          name: "Microsoft unter Ballmer (Cloud-Pivot-Vorphase)",
          date: "2013-01",
          similarity: 45,
          situation: "MSFT stagnierte, Mobile verloren. Aber Cloud-Business (Azure) begann zu skalieren, kaum einer sah es. Analog zu Inferenz-Shift bei NVDA.",
          expectedAtTime: "Konsensus war bearisch: Post-PC-Welt bedroht MSFT-Kerngeschaeft. Kursziele im Bereich $30.",
          actualOutcome: "Mit Satya-Nadella-Pivot (2014) und Azure-Explosion: +1000% bis 2024. Die unterschaetzte zweite Welle (Cloud) war groesser als die erste (Windows).",
          performance: { "1m": "+4%", "3m": "+8%", "6m": "+12%", "12m": "+40%" },
          lesson: "Fuer NVDA: Inferenz koennte die zweite, groessere Welle sein nach dem Training-Boom. Aber Timing ist hart - Nadella-Aera brauchte 2 Jahre um sichtbar zu werden."
        }
      ],
      calibration: {
        bullThesisHitRate: 35,
        baseThesisHitRate: 55,
        bearThesisHitRate: 72,
        explanation: "Bei aehnlich hoch bewerteten Marktfuehrern im Infrastruktur-Boom hat die Bear-These historisch oefter gestimmt als erwartet (Cisco 2000). Base-Szenarien sind am haeufigsten eingetreten. Bull-Thesen mit 200%+ Upside hatten historisch nur 30-40% Trefferquote bei diesen Setups."
      },
      blindspots: [
        "Custom-Silicon-Risiko ist in den Analysen unterschaetzt. Intel dachte auch 2020 x86 sei unangreifbar — heute verliert es Marktanteile an ARM/RISC-V. AWS Trainium, Google TPU, Meta MTIA koennten in 3-5 Jahren NVDA-Marktanteil halbieren.",
        "CapEx-Zyklen-Risiko: Die Analysen projizieren lineares Wachstum, aber Infrastruktur-Booms enden historisch abrupt (Telecom 2000, Solar 2011, Mining 2022). Ein einziger Hyperscaler der CapEx halbiert kann Revenue-Kollaps ausloesen.",
        "Bewertungs-Komprimierung: Selbst wenn NVDAs Business weiter waechst, kann das Multiple von 40x auf 20x faellen (wie Cisco: Umsatz hat sich seit 2000 vervielfacht, Aktie ist unter Peak)."
      ],
      verdict: {
        rating: "partially_confirmed",
        confidenceAdjustment: "Bear-These von 15% auf 25% erhoehen",
        summary: "Die Historie bestaetigt NVDAs Fuehrungs-Position und legitime Growth-Story. Aber Parallelen zu Cisco 2000 und Intel 2020 zeigen: Technologische Fuehrung uebersetzt sich nicht garantiert in Aktien-Performance bei hohen Bewertungen. Die Bear-These (15%) ist historisch unterschaetzt — bei vergleichbaren Setups lag die wahre Hit-Rate bei 25-30%. Die groesste Blindspot-Kombination: Custom-Silicon-Disruption + CapEx-Zyklen-Ende + Multiple-Komprimierung kann selbst bei gesundem Business 40%+ Drawdown ausloesen."
      }
    }
  },
  TSLA: {
    scenarios: {
      bull: { probability: 30, priceTarget: 450, thesis: "FSD wird echter Robotaxi-Dienst 2025-2026, Energy Storage Segment explodiert, Cybertruck-Ramp gelingt. Musk-Fokus zurueck auf Tesla.", keyDrivers: ["FSD v13 erreicht echte Autonomie", "Energy-Segment 40%+ Wachstum", "Model 2 unter $25K"], triggers: ["Regulierungs-Gruenes-Licht fuer Robotaxi", "Energy-Margen ueber 25%"] },
      base: { probability: 40, priceTarget: 300, thesis: "EV-Wachstum verlangsamt durch Konkurrenz, aber Tesla bleibt profitabelster EV-Hersteller. FSD bleibt Fahrassistenz, kein echtes Robotaxi.", keyDrivers: ["Marktanteil-Verlust an BYD in China", "Margen-Stabilisierung bei 15-18%", "Energy-Segment waechst moderat"], triggers: ["Keine FSD-Durchbrueche", "China-Volumen stagniert"] },
      bear: { probability: 30, priceTarget: 180, thesis: "BYD und China-EV-Konkurrenz zermahlen Tesla-Marktanteile. Musk-Distraktion (Politik, xAI, X) schadet Operativ. FSD-Erwartungen enttaeuschen.", keyDrivers: ["Margen fallen unter 10%", "China-Revenue -30%", "FSD-Promises enttaeuschen wieder"], triggers: ["Gross-Rueckruf", "Musk-politische-Krise", "China-EV-Subventions-Erhoehung"] },
      summary: "Extreme Spreizung der Szenarien zeigt: TSLA ist mehr Narrative-Play als Fundamental-Play. Binary Outcome je nach FSD/Robotaxi-Fortschritt."
    },
    macro: {
      fedRates: { impact: "negative", strength: 75, explanation: "TSLA ist zinsensensitiv durch High-Multiple + Auto-Finanzierung (hohe Zinsen dampen EV-Nachfrage)." },
      inflation: { impact: "negative", strength: 55, explanation: "Input-Kosten (Lithium, Nickel) + Arbeitskosten belasten Margen. Preiserhoehungen schwierig wegen Konkurrenz." },
      dollarStrength: { impact: "negative", strength: 60, explanation: "~47% Revenue international. Starker Dollar schmerzt China/Europa-Umsaetze umgerechnet." },
      consumerSpending: { impact: "negative", strength: 70, explanation: "Luxus-EV-Nachfrage sehr zyklisch. Konsumenten-Schwaeche trifft Tesla harter als Billig-Auto-Hersteller." },
      liquidityConditions: { impact: "positive", strength: 65, explanation: "TSLA profitiert von Risk-On-Umfeld und Retail-Flows. Meme-Stock-Charakter macht Liquiditaet wichtig." },
      keyTakeaway: "TSLA ist das zinsensensitivste Auto-Asset. Fed-Pivot waere stark positiv, aber Konkurrenz-Dynamik ueberlagert Makro langfristig."
    },
    historical: {
      parallels: [
        {
          name: "GoPro — Hype zu Realitaet",
          date: "2014-10",
          similarity: 55,
          situation: "Kultmarke, Founder-CEO als Visionaer gefeiert, extreme Bewertung, Erwartung dass 'GoPro ist mehr als Kameras'.",
          expectedAtTime: "Media/Platform-Play wurde erwartet. Kursziele implizierten GoPro als 'Apple der Action-Cams'.",
          actualOutcome: "Commodity-Konkurrenz kam schneller als erwartet, Plattform-Vision nie realisiert. 90% Verlust in 3 Jahren.",
          performance: { "1m": "-15%", "3m": "-25%", "6m": "-45%", "12m": "-70%" },
          lesson: "Cult-Brands koennen Plattform-Premium verlieren wenn Kern-Produkt zur Commodity wird. BYD könnte Tesla dasselbe antun."
        },
        {
          name: "Tesla selbst — China-Entry Euphorie",
          date: "2020-12",
          similarity: 70,
          situation: "Tesla Shanghai lief, China schien unbegrenzter Wachstumsmarkt. FSD-Promises fuer 2021.",
          expectedAtTime: "Bull-Cases sahen $500+ mit Robotaxi-Launch 2022. China sollte Revenue verdoppeln.",
          actualOutcome: "China-Wettbewerb (BYD, NIO) explodierte, FSD wurde mehrfach verschoben. Aktie schwankte wild, Nettobilanz 4 Jahre: volatil aber nicht viel Upside.",
          performance: { "1m": "+15%", "3m": "+25%", "6m": "-10%", "12m": "+5%" },
          lesson: "Tesla hat eine Geschichte des ueber-Versprechens bei Autonomie. Jede FSD-Promise sollte skeptisch bewertet werden."
        },
        {
          name: "Nokia — Marktfuehrer verliert Technologie-Wechsel",
          date: "2007-06",
          similarity: 52,
          situation: "Nokia dominierte Handy-Markt mit 40% Marktanteil, hoher Margen. iPhone-Launch wurde als Nischen-Produkt abgetan.",
          expectedAtTime: "Analysten sahen iPhone als teure Spielerei. Nokia-Fuehrung unerschuetterlich.",
          actualOutcome: "Binnen 5 Jahren Nokia-Collapse. Smartphone-Paradigma komplett verpasst. 95% Verlust.",
          performance: { "1m": "+2%", "3m": "-5%", "6m": "-15%", "12m": "-40%" },
          lesson: "Marktfuehrer koennen Technologie-Wechsel verpassen. BYD's Blade-Battery + vertikale Integration koennte Tesla's Modell ueberholen."
        },
        {
          name: "Netflix Qwikster-Krise",
          date: "2011-09",
          similarity: 38,
          situation: "Founder-CEO macht strategischen Fehler (Streaming/DVD-Split), Aktie crasht 75%. Analog zu Musk-Entscheidungen.",
          expectedAtTime: "Viele dachten Netflix sei am Ende. Reed Hastings' Fuehrung wurde infrage gestellt.",
          actualOutcome: "Hastings korrigierte, pivotierte zu Original-Content, Aktie kam zurueck und vervielfachte sich. 1500%+ Gewinn 2012-2021.",
          performance: { "1m": "-40%", "3m": "-60%", "6m": "-75%", "12m": "+15%" },
          lesson: "Founder-CEOs mit Vision koennen aus grossen Fehlern lernen. Wenn Musk-Risiko materialisiert aber Tesla pivotiert, kann das Bottom-Trade sein."
        }
      ],
      calibration: {
        bullThesisHitRate: 25,
        baseThesisHitRate: 45,
        bearThesisHitRate: 40,
        explanation: "Tesla-Bull-Thesen mit Robotaxi-Durchbruch haben historisch enttaeuscht (Promises seit 2016). Bear-These ist glaubwuerdiger als aktueller Konsensus, da China-EV-Wettbewerb real und beschleunigend ist. Base bleibt wahrscheinlichstes Szenario."
      },
      blindspots: [
        "BYD-Bedrohung ist in allen Analysen unterschaetzt. BYD verkauft mittlerweile mehr EVs als Tesla, hat bessere Margen in China, und expandiert aggressiv nach Europa/LatAm.",
        "Musk-Konzentrations-Risiko: Im Gegensatz zu anderen CEOs ist TSLA's Bewertung stark an Musk's Person gekoppelt. Ein Gesundheits-Event oder massiver politischer Skandal koennte 30%+ Abschlag bedeuten.",
        "FSD-Regulierung: Selbst wenn FSD technisch funktioniert, koennen regulatorische Haftung und Versicherungs-Fragen Robotaxi-Launch um Jahre verzoegern."
      ],
      verdict: {
        rating: "contradicted",
        confidenceAdjustment: "Bull-These von 30% auf 20% reduzieren, Bear von 30% auf 40% erhoehen",
        summary: "Die Historie widerspricht der Bull-These deutlich. Parallelen zu Nokia, GoPro und Tesla's eigener Vergangenheit zeigen: Hoch bewertete Marktfuehrer mit technologischen Disruptions-Drohungen gewinnen selten die erwartete Upside. FSD-Promises haben historische Hit-Rate unter 20%. Der Bull-Case erfordert multiple gleichzeitige Durchbrueche (FSD, Energy, Margen) — das ist ein sehr enger Pfad."
      }
    }
  }
};
DEMO_ANALYSES.NVDA["event:Fed senkt Zinsen um 50bp"] = {
  immediateImpact: { direction: "up", magnitude: "moderate", timeframe: "hours", priceMove: "+3% bis +6%" },
  mediumTerm: { direction: "up", explanation: "Zinssenkungen expandieren Growth-Multiples. NVDA als High-Beta-Tech profitiert ueberproportional. Hyperscaler-CapEx-Finanzierung wird billiger." },
  cascadingEffects: ["Gesamter Tech-Sektor rallyt 5-10%", "Dollar schwaecht sich ab, hilft international", "Bitcoin/Risk-Assets rallyen parallel"],
  hedgingIdeas: ["Weniger Hedging noetig in diesem Szenario", "Long-Dated Calls werden attraktiv"],
  probability: 35,
  tradingIdea: "Long NVDA ueber FOMC-Meeting via 1-Monats-Calls. Fed-Pivot ist bereits teils eingepreist, aber Ueberraschung -50bp waere Rocket-Fuel."
};

// ============================================
// ANALYSIS LAB COMPONENT
// ============================================
function AnalysisLab({ stock }) {
  const [activeLevel, setActiveLevel] = useState(null);
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customEvent, setCustomEvent] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  const hasDemoData = !!DEMO_ANALYSES[stock.ticker];

  const loadDemoData = () => {
    const demo = DEMO_ANALYSES[stock.ticker];
    if (!demo) return;
    setCache({ ...demo });
    setDemoMode(true);
    setActiveLevel("scenarios");
    setError(null);
  };

  const clearCache = () => {
    setCache({});
    setDemoMode(false);
    setActiveLevel(null);
    setError(null);
  };

  const runAnalysis = async (levelId, eventInput = "") => {
    const cacheKey = levelId === "event" ? `event:${eventInput}` : levelId;
    if (cache[cacheKey]) { setActiveLevel(levelId); return; }
    
    setLoading(true); setError(null); setActiveLevel(levelId);
    
    try {
      const priorAnalyses = levelId === "historical" ? cache : null;
      const result = await generateAnalysis(stock, levelId, eventInput, priorAnalyses);
      setCache(prev => ({ ...prev, [cacheKey]: result }));
    } catch (err) {
      console.error(err);
      setError(`API-Call fehlgeschlagen: ${err.message || "Unbekannter Fehler"}. Tipp: Nutze "LOAD DEMO" fuer vorgefertigte Analysen.`);
    } finally {
      setLoading(false);
    }
  };

  const completedAnalyses = Object.keys(cache).filter(k => k !== "historical").length;
  const canRunHistorical = completedAnalyses >= 1;

  const currentKey = activeLevel === "event" ? `event:${customEvent}` : activeLevel;
  const currentData = activeLevel ? cache[currentKey] : null;
  const currentLevel = ANALYSIS_LEVELS.find(l => l.id === activeLevel);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(96,165,250,0.08))", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Brain size={18} color="#10b981" />
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#10b981", fontWeight: 600 }}>ANALYSIS LAB</div>
              <Sparkles size={12} color="#f59e0b" />
              {demoMode && (
                <div style={{ padding: "2px 8px", background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontSize: 9, fontWeight: 700, letterSpacing: 1, borderRadius: 3, border: "1px solid rgba(245,158,11,0.3)" }}>
                  DEMO DATA
                </div>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stock.ticker} <span style={{ color: "#6b7280", fontSize: 14, fontWeight: 400 }}>· {stock.name}</span></div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Tiefe Analysen on-demand — jede Ebene einzeln anklickbar</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {hasDemoData && completedAnalyses === 0 && (
              <button onClick={loadDemoData}
                style={{ background: "#f59e0b", color: "#0a0e1a", border: "none", padding: "10px 16px", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 700, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={12} />LOAD DEMO
              </button>
            )}
            {completedAnalyses > 0 && (
              <button onClick={clearCache}
                style={{ background: "transparent", color: "#9ca3af", border: "1px solid #1f2937", padding: "10px 16px", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 600, borderRadius: 4, cursor: "pointer" }}>
                RESET
              </button>
            )}
            <div style={{ textAlign: "right", paddingLeft: 8 }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280" }}>ENGINE</div>
              <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginTop: 4 }}>Gemini 2.0 Flash</div>
            </div>
          </div>
        </div>
        {hasDemoData && completedAnalyses === 0 && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 4, fontSize: 11, color: "#f59e0b", lineHeight: 1.5 }}>
            ◆ TIPP: Klick <b>"LOAD DEMO"</b> um alle 6 Analyse-Ebenen mit vorgefertigten Daten zu laden. So kannst du Historical Validation direkt testen, auch wenn die Live-API nicht verfuegbar ist.
          </div>
        )}
      </div>

      {/* LEVEL SELECTOR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
        {ANALYSIS_LEVELS.filter(l => l.id !== "historical").map(level => {
          const isActive = activeLevel === level.id;
          const hasData = level.id === "event" ? Object.keys(cache).some(k => k.startsWith("event:")) : !!cache[level.id];
          return (
            <button key={level.id}
              onClick={() => level.id !== "event" && runAnalysis(level.id)}
              disabled={loading}
              style={{
                background: isActive ? `${level.color}15` : "#111827",
                border: `1px solid ${isActive ? level.color : "#1f2937"}`,
                borderRadius: 6, padding: 16, cursor: loading ? "wait" : "pointer", textAlign: "left",
                fontFamily: "inherit", color: "#e4e7ee", transition: "all 0.2s"
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <level.icon size={16} color={level.color} />
                {hasData && <CheckCircle2 size={12} color="#10b981" />}
              </div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 700, color: isActive ? level.color : "#e4e7ee", marginBottom: 4 }}>{level.label}</div>
              <div style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.4 }}>{level.desc}</div>
            </button>
          );
        })}
      </div>

      {/* HISTORICAL VALIDATION - Meta-Ebene */}
      {(() => {
        const level = ANALYSIS_LEVELS.find(l => l.id === "historical");
        const isActive = activeLevel === "historical";
        const hasData = !!cache.historical;
        const locked = !canRunHistorical;
        return (
          <button
            onClick={() => !locked && runAnalysis("historical")}
            disabled={loading || locked}
            style={{
              width: "100%", marginBottom: 24,
              background: isActive ? `${level.color}15` : locked ? "#0a0e1a" : "linear-gradient(135deg, rgba(20,184,166,0.08), rgba(16,185,129,0.08))",
              border: `1px solid ${isActive ? level.color : locked ? "#1f2937" : "rgba(20,184,166,0.4)"}`,
              borderRadius: 6, padding: 18, cursor: locked ? "not-allowed" : loading ? "wait" : "pointer",
              textAlign: "left", fontFamily: "inherit", color: "#e4e7ee",
              opacity: locked ? 0.5 : 1, display: "flex", alignItems: "center", gap: 16
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 4, background: `${level.color}15`, flexShrink: 0 }}>
              <History size={22} color={level.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700, color: level.color }}>◆ META-ANALYSE</div>
                {hasData && <CheckCircle2 size={12} color="#10b981" />}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{level.label}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>
                {locked
                  ? "Erst mindestens 1 andere Analyse ausfuehren — diese Ebene prueft alle bisherigen Analysen gegen historische Parallelen"
                  : `Alle ${completedAnalyses} bisherige Analyse(n) gegen historische Praezedenzfaelle pruefen`}
              </div>
            </div>
            <ChevronRightIcon locked={locked} color={level.color} />
          </button>
        );
      })()}

      {/* EVENT SIMULATOR INPUT */}
      {activeLevel === "event" && (
        <div style={{ background: "#111827", border: "1px solid #f59e0b", borderRadius: 6, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#f59e0b", marginBottom: 12, fontWeight: 700 }}>◆ EVENT SIMULIEREN</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={customEvent} onChange={(e) => setCustomEvent(e.target.value)}
              placeholder="z.B. 'China blockiert Taiwan' oder 'Fed senkt Zinsen um 50bp'"
              style={{ flex: 1, background: "#0a0e1a", border: "1px solid #1f2937", padding: "10px 14px", color: "#e4e7ee", fontFamily: "inherit", fontSize: 12, borderRadius: 4, outline: "none" }}
              onKeyDown={(e) => e.key === "Enter" && customEvent && runAnalysis("event", customEvent)} />
            <button onClick={() => customEvent && runAnalysis("event", customEvent)} disabled={!customEvent || loading}
              style={{ background: "#f59e0b", color: "#0a0e1a", border: "none", padding: "10px 18px", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 700, borderRadius: 4, cursor: customEvent ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6, opacity: customEvent ? 1 : 0.5 }}>
              <Send size={12} />SIMULIEREN
            </button>
          </div>
        </div>
      )}

      {/* ANALYSIS OUTPUT */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 24, minHeight: 300 }}>
        {!activeLevel && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
            <Brain size={32} style={{ margin: "0 auto 16px", opacity: 0.4 }} />
            <div style={{ fontSize: 13 }}>Waehle eine Analyse-Ebene um zu starten</div>
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>Jede Ebene wird live von Claude generiert basierend auf {stock.ticker}-Kontext</div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <Loader2 size={28} color="#10b981" style={{ margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: 12, color: "#9ca3af" }}>Claude analysiert {currentLevel?.label.toLowerCase()}...</div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#ef4444", fontSize: 12 }}>
            <AlertTriangle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }} />{error}
          </div>
        )}

        {!loading && currentData && currentLevel && (
          <AnalysisRenderer levelId={activeLevel} data={currentData} level={currentLevel} stock={stock} />
        )}
      </div>
    </div>
  );
}

// ============================================
// ANALYSIS GENERATOR (Claude API Calls)
// ============================================
async function generateAnalysis(stock, levelId, eventInput = "", priorAnalyses = null) {
  const stockCtx = `
Aktie: ${stock.ticker} (${stock.name || stock.ticker})
Preis: $${stock.price} (${stock.change >= 0 ? "+" : ""}${(stock.change || 0).toFixed(2)}%)
Sektor: ${stock.sector || "Unknown"}${stock.marketCap ? `, Market Cap: ${stock.marketCap}` : ""}
Asset-Typ: ${stock.assetType || "stock"}
`.trim();

  // Build prior analyses summary for historical validation
  let priorSummary = "";
  if (priorAnalyses && Object.keys(priorAnalyses).length > 0) {
    const parts = [];
    if (priorAnalyses.scenarios) {
      const s = priorAnalyses.scenarios;
      parts.push(`SZENARIEN-ANALYSE:\n- Bull (${s.bull.probability}%): Ziel $${s.bull.priceTarget} — ${s.bull.thesis}\n- Base (${s.base.probability}%): Ziel $${s.base.priceTarget} — ${s.base.thesis}\n- Bear (${s.bear.probability}%): Ziel $${s.bear.priceTarget} — ${s.bear.thesis}`);
    }
    if (priorAnalyses.macro) {
      const m = priorAnalyses.macro;
      parts.push(`MAKRO-ANALYSE: Fed ${m.fedRates.impact} (${m.fedRates.strength}), Inflation ${m.inflation.impact}, Dollar ${m.dollarStrength.impact}. Takeaway: ${m.keyTakeaway}`);
    }
    Object.keys(priorAnalyses).filter(k => k.startsWith("event:")).forEach(k => {
      const e = priorAnalyses[k];
      const eventName = k.replace("event:", "");
      parts.push(`EVENT-SIMULATION "${eventName}": ${e.immediateImpact.direction} ${e.immediateImpact.magnitude} (${e.immediateImpact.priceMove}), ${e.probability}% Wahrscheinlichkeit. Idee: ${e.tradingIdea}`);
    });
    if (priorAnalyses.sector) {
      const s = priorAnalyses.sector;
      parts.push(`SEKTOR-ROTATION: ${s.currentCycle} Phase, ${s.sectorPosition}, Rel-Strength ${s.relativeStrength}. Empfehlung: ${s.recommendation}`);
    }
    if (priorAnalyses.political) {
      const p = priorAnalyses.political;
      parts.push(`POLITISCHES RISIKO (${p.overallRiskScore}/100): Tariff ${p.tariffRisk.level}, Sanctions ${p.sanctionsRisk.level}, Regulatory ${p.regulatoryRisk.level}. Hotspots: ${p.geopoliticalHotspots.join(", ")}`);
    }
    priorSummary = parts.join("\n\n");
  }

  const prompts = {
    scenarios: {
      system: "Du bist ein erfahrener Trading-Analyst. Gib PRAEZISE, konkrete Analysen auf Deutsch. Antworte NUR mit gueltigem JSON, keine Erklaerung davor oder danach.",
      user: `${stockCtx}\n\nErstelle drei Zukunfts-Szenarien (6-12 Monate) fuer ${stock.ticker}. Antworte als JSON:\n{\n  "bull": { "probability": <1-100>, "priceTarget": <number>, "thesis": "<2-3 Saetze>", "keyDrivers": ["<driver1>", "<driver2>", "<driver3>"], "triggers": ["<was muss passieren>"] },\n  "base": { "probability": <1-100>, "priceTarget": <number>, "thesis": "...", "keyDrivers": [...], "triggers": [...] },\n  "bear": { "probability": <1-100>, "priceTarget": <number>, "thesis": "...", "keyDrivers": [...], "triggers": [...] },\n  "summary": "<1 Satz Gesamt-Einschaetzung>"\n}\nWahrscheinlichkeiten muessen zusammen 100 ergeben.`
    },
    macro: {
      system: "Du bist Makro-Oekonom und Trading-Analyst. Antworte NUR mit gueltigem JSON auf Deutsch.",
      user: `${stockCtx}\n\nAnalysiere wie Makro-Faktoren ${stock.ticker} beeinflussen. Antworte als JSON:\n{\n  "fedRates": { "impact": "<positive|negative|neutral>", "strength": <1-100>, "explanation": "<warum>" },\n  "inflation": { "impact": "...", "strength": <1-100>, "explanation": "..." },\n  "dollarStrength": { "impact": "...", "strength": <1-100>, "explanation": "..." },\n  "consumerSpending": { "impact": "...", "strength": <1-100>, "explanation": "..." },\n  "liquidityConditions": { "impact": "...", "strength": <1-100>, "explanation": "..." },\n  "keyTakeaway": "<was soll ich als Trader beachten, 2-3 Saetze>"\n}`
    },
    event: {
      system: "Du bist Trading-Analyst spezialisiert auf Event-Impact-Analyse. Antworte NUR mit gueltigem JSON auf Deutsch.",
      user: `${stockCtx}\n\nSimuliertes Event: "${eventInput}"\n\nAnalysiere wie dieses Event ${stock.ticker} beeinflussen wuerde. Antworte als JSON:\n{\n  "immediateImpact": { "direction": "<up|down|sideways>", "magnitude": "<small|moderate|large|extreme>", "timeframe": "<hours|days|weeks>", "priceMove": "<z.B. -15% bis -25%>" },\n  "mediumTerm": { "direction": "...", "explanation": "<2-3 Saetze>" },\n  "cascadingEffects": ["<Folgeeffekt 1>", "<Folgeeffekt 2>", "<Folgeeffekt 3>"],\n  "hedgingIdeas": ["<wie koennte man sich absichern>"],\n  "probability": <1-100, wie wahrscheinlich dass das Event eintritt>,\n  "tradingIdea": "<konkrete Idee was ich machen koennte>"\n}`
    },
    sector: {
      system: "Du bist Sektor-Rotations-Analyst. Antworte NUR mit gueltigem JSON auf Deutsch.",
      user: `${stockCtx}\n\nAnalysiere Sektor-Rotation fuer ${stock.ticker}. Antworte als JSON:\n{\n  "currentCycle": "<early|mid|late|recession> Zyklus-Phase",\n  "sectorPosition": "<leading|lagging|neutral>",\n  "relativeStrength": <1-100, Staerke vs Gesamt-Markt>,\n  "favoredScenarios": ["<Makro-Szenario in dem der Sektor outperformt>"],\n  "rotatingInto": ["<in welche Sektoren rotiert Kapital aktuell>"],\n  "rotatingOutOf": ["<aus welchen>"],\n  "stockVsPeers": "<wie steht ${stock.ticker} gegen direkte Konkurrenten>",\n  "recommendation": "<overweight|neutral|underweight vs Benchmark> — warum"\n}`
    },
    political: {
      system: "Du bist Geopolitik- und Regulierungs-Analyst. Antworte NUR mit gueltigem JSON auf Deutsch.",
      user: `${stockCtx}\n\nAnalysiere politische und regulatorische Risiken fuer ${stock.ticker}. Antworte als JSON:\n{\n  "tariffRisk": { "level": "<low|medium|high|critical>", "affectedRevenue": "<z.B. ~20% China Exposure>", "details": "<konkrete Bedrohung>" },\n  "sanctionsRisk": { "level": "...", "details": "..." },\n  "regulatoryRisk": { "level": "...", "details": "<Antitrust, Datenschutz etc.>" },\n  "electionRisk": { "level": "...", "details": "<welche Wahlen koennten relevant sein>" },\n  "geopoliticalHotspots": ["<Taiwan>", "<Naher Osten>", "<etc.>"],\n  "overallRiskScore": <1-100>,\n  "keyWatchPoints": ["<was ich monitoren sollte>"]\n}`
    },
    historical: {
      system: "Du bist Finanz-Historiker und Trading-Analyst. Du pruefst aktuelle Thesen gegen historische Praezedenzfaelle. Sei praezise und ehrlich - wenn die Historie widerspricht, sag es klar. Antworte NUR mit gueltigem JSON auf Deutsch.",
      user: `${stockCtx}\n\nBISHERIGE ANALYSEN FUER ${stock.ticker}:\n\n${priorSummary}\n\n---\n\nDeine Aufgabe: Finde 3-5 historische Parallelen zu diesem Setup und pruefe, ob die obigen Analysen mit der Historie konsistent sind.\n\nAntworte als JSON:\n{\n  "parallels": [\n    {\n      "name": "<z.B. 'Dot-Com Crash 2000' oder 'Fed Pivot Dezember 2018'>",\n      "date": "<YYYY-MM oder Zeitraum>",\n      "similarity": <1-100, wie aehnlich zum aktuellen Setup>,\n      "situation": "<1-2 Saetze: was war die Ausgangslage>",\n      "expectedAtTime": "<was wurde damals erwartet/prognostiziert>",\n      "actualOutcome": "<was ist tatsaechlich passiert>",\n      "performance": { "1m": "<z.B. +12%>", "3m": "<+25%>", "6m": "<-15%>", "12m": "<+40%>" },\n      "lesson": "<1 Satz: was lernen wir daraus fuer heute>"\n    }\n  ],\n  "calibration": {\n    "bullThesisHitRate": <1-100, wie oft hat sich Bull-These historisch bewahrheitet bei aehnlichen Setups>,\n    "baseThesisHitRate": <1-100>,\n    "bearThesisHitRate": <1-100>,\n    "explanation": "<2-3 Saetze wie du auf die Trefferquoten kommst>"\n  },\n  "blindspots": [\n    "<Blindspot 1: was wurde in den Analysen uebersehen, das historisch wichtig war>",\n    "<Blindspot 2>",\n    "<Blindspot 3>"\n  ],\n  "verdict": {\n    "rating": "<confirmed|partially_confirmed|contradicted>",\n    "confidenceAdjustment": "<z.B. 'Bull-Szenario von 40% auf 55% erhoehen' oder 'Bear unterschaetzt'>",\n    "summary": "<3-4 Saetze: Gesamt-Verdict. Bestaetigt oder widerspricht die Historie den Thesen? Was sollte der Trader anders sehen?>"\n  }\n}`
    }
  };

  const p = prompts[levelId];
  return await callClaudeAPI(p.system, p.user);
}

// ============================================
// ANALYSIS RENDERERS
// ============================================
function AnalysisRenderer({ levelId, data, level, stock }) {
  if (levelId === "scenarios") return <ScenariosRender data={data} stock={stock} />;
  if (levelId === "macro") return <MacroRender data={data} />;
  if (levelId === "event") return <EventRender data={data} />;
  if (levelId === "sector") return <SectorRender data={data} />;
  if (levelId === "political") return <PoliticalRender data={data} />;
  if (levelId === "historical") return <HistoricalRender data={data} stock={stock} />;
  return null;
}

// Small chevron helper for historical button
function ChevronRightIcon({ locked, color }) {
  return (
    <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: locked ? "#374151" : color }}>
      →
    </div>
  );
}

function ScenariosRender({ data, stock }) {
  const scenarios = [
    { key: "bull", label: "BULL CASE", icon: TrendingUp, color: "#10b981", data: data.bull },
    { key: "base", label: "BASE CASE", icon: ArrowUpRight, color: "#f59e0b", data: data.base },
    { key: "bear", label: "BEAR CASE", icon: TrendingDown, color: "#ef4444", data: data.bear }
  ];
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 2, color: "#6b7280", marginBottom: 16 }}>◆ 6-12 MONATS SZENARIEN</div>
      <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
        {scenarios.map(s => {
          const change = ((s.data.priceTarget - stock.price) / stock.price * 100).toFixed(1);
          return (
            <div key={s.key} style={{ border: `1px solid ${s.color}40`, borderRadius: 6, padding: 18, background: `${s.color}08` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <s.icon size={18} color={s.color} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color, letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ padding: "3px 10px", background: `${s.color}20`, color: s.color, fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3 }}>{s.data.probability}% WAHRSCHEINLICH</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 1 }}>KURSZIEL</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>${formatPrice(s.data.priceTarget)}</div>
                  <div style={{ fontSize: 11, color: s.color }}>{change >= 0 ? "+" : ""}{change}%</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#d1d5db", marginBottom: 12, lineHeight: 1.6 }}>{s.data.thesis}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>KEY DRIVERS</div>
                  {s.data.keyDrivers.map((d, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#d1d5db", padding: "4px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, marginTop: 6, flexShrink: 0 }} />
                      {d}
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>TRIGGER</div>
                  {s.data.triggers.map((t, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#d1d5db", padding: "4px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, marginTop: 6, flexShrink: 0 }} />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: 16, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 4 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#10b981", marginBottom: 6 }}>◆ ZUSAMMENFASSUNG</div>
        <div style={{ fontSize: 13, color: "#e4e7ee", lineHeight: 1.5 }}>{data.summary}</div>
      </div>
    </div>
  );
}

function MacroRender({ data }) {
  const factors = [
    { key: "fedRates", label: "FED ZINSEN", data: data.fedRates },
    { key: "inflation", label: "INFLATION", data: data.inflation },
    { key: "dollarStrength", label: "DOLLAR-STÄRKE", data: data.dollarStrength },
    { key: "consumerSpending", label: "CONSUMER SPENDING", data: data.consumerSpending },
    { key: "liquidityConditions", label: "LIQUIDITÄT", data: data.liquidityConditions }
  ];
  const impactColor = (i) => i === "positive" ? "#10b981" : i === "negative" ? "#ef4444" : "#f59e0b";
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 2, color: "#6b7280", marginBottom: 16 }}>◆ MAKRO-SENSITIVITÄT</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {factors.map(f => (
          <div key={f.key} style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{f.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ padding: "3px 10px", background: `${impactColor(f.data.impact)}15`, color: impactColor(f.data.impact), fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3, textTransform: "uppercase" }}>{f.data.impact}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: impactColor(f.data.impact) }}>{f.data.strength}</div>
              </div>
            </div>
            <div style={{ height: 4, background: "#1f2937", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${f.data.strength}%`, background: impactColor(f.data.impact) }} />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{f.data.explanation}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 16, background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 4 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#60a5fa", marginBottom: 6 }}>◆ TAKEAWAY</div>
        <div style={{ fontSize: 13, color: "#e4e7ee", lineHeight: 1.5 }}>{data.keyTakeaway}</div>
      </div>
    </div>
  );
}

function EventRender({ data }) {
  const dirColor = (d) => d === "up" ? "#10b981" : d === "down" ? "#ef4444" : "#f59e0b";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ padding: 18, background: "#0a0e1a", border: `1px solid ${dirColor(data.immediateImpact.direction)}60`, borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>◆ SOFORT-IMPACT</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: dirColor(data.immediateImpact.direction), marginBottom: 6, textTransform: "uppercase" }}>{data.immediateImpact.direction} · {data.immediateImpact.magnitude}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{data.immediateImpact.priceMove}</div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>Zeitrahmen: {data.immediateImpact.timeframe}</div>
        </div>
        <div style={{ padding: 18, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>◆ EVENT-WAHRSCHEINLICHKEIT</div>
          <div style={{ fontSize: 42, fontWeight: 700, color: getColor(data.probability), lineHeight: 1 }}>{data.probability}%</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>dass das Event eintritt</div>
        </div>
      </div>

      <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6, marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>◆ MITTELFRISTIG</div>
        <div style={{ fontSize: 12, color: "#e4e7ee", lineHeight: 1.6 }}><span style={{ color: dirColor(data.mediumTerm.direction), fontWeight: 700, textTransform: "uppercase" }}>{data.mediumTerm.direction} · </span>{data.mediumTerm.explanation}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 10 }}>◆ CASCADING EFFECTS</div>
          {data.cascadingEffects.map((e, i) => (
            <div key={i} style={{ fontSize: 11, color: "#d1d5db", padding: "6px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ color: "#f59e0b", flexShrink: 0 }}>▸</div>{e}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 10 }}>◆ HEDGING IDEAS</div>
          {data.hedgingIdeas.map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: "#d1d5db", padding: "6px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ color: "#10b981", flexShrink: 0 }}>▸</div>{h}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#f59e0b", marginBottom: 6 }}>◆ TRADING-IDEE</div>
        <div style={{ fontSize: 13, color: "#e4e7ee", lineHeight: 1.5 }}>{data.tradingIdea}</div>
      </div>
    </div>
  );
}

function SectorRender({ data }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 6 }}>ZYKLUS-PHASE</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#a78bfa", textTransform: "capitalize" }}>{data.currentCycle}</div>
        </div>
        <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 6 }}>SEKTOR-POSITION</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#a78bfa", textTransform: "capitalize" }}>{data.sectorPosition}</div>
        </div>
        <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 6 }}>REL. STRENGTH</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: getColor(data.relativeStrength), lineHeight: 1 }}>{data.relativeStrength}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ padding: 16, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#10b981", marginBottom: 10 }}>◆ KAPITAL ROTIERT REIN</div>
          {data.rotatingInto.map((s, i) => (
            <div key={i} style={{ fontSize: 12, padding: "5px 0", color: "#d1d5db" }}>▸ {s}</div>
          ))}
        </div>
        <div style={{ padding: 16, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#ef4444", marginBottom: 10 }}>◆ KAPITAL ROTIERT RAUS</div>
          {data.rotatingOutOf.map((s, i) => (
            <div key={i} style={{ fontSize: 12, padding: "5px 0", color: "#d1d5db" }}>▸ {s}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6, marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>◆ FAVORED SZENARIEN</div>
        {data.favoredScenarios.map((s, i) => (
          <div key={i} style={{ fontSize: 12, padding: "4px 0", color: "#d1d5db" }}>▸ {s}</div>
        ))}
      </div>

      <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6, marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>◆ VS PEERS</div>
        <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.6 }}>{data.stockVsPeers}</div>
      </div>

      <div style={{ padding: 16, background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#a78bfa", marginBottom: 6 }}>◆ EMPFEHLUNG</div>
        <div style={{ fontSize: 13, color: "#e4e7ee", lineHeight: 1.5 }}>{data.recommendation}</div>
      </div>
    </div>
  );
}

function PoliticalRender({ data }) {
  const riskColor = (l) => ({ low: "#10b981", medium: "#f59e0b", high: "#ef4444", critical: "#dc2626" }[l] || "#9ca3af");
  const risks = [
    { key: "tariffRisk", label: "TARIFF RISK", icon: Globe },
    { key: "sanctionsRisk", label: "SANCTIONS RISK", icon: AlertTriangle },
    { key: "regulatoryRisk", label: "REGULATORY", icon: Landmark },
    { key: "electionRisk", label: "ELECTION RISK", icon: Landmark }
  ];
  return (
    <div>
      <div style={{ padding: 20, background: "#0a0e1a", border: `1px solid ${getColor(100 - data.overallRiskScore)}60`, borderRadius: 6, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 6 }}>◆ GESAMT-POLITISCHES-RISIKO</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Hoeher = mehr politische Unsicherheit</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 42, fontWeight: 700, color: getColor(100 - data.overallRiskScore), lineHeight: 1 }}>{data.overallRiskScore}</div>
          <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 2, marginTop: 4 }}>/ 100</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        {risks.map(r => {
          const d = data[r.key];
          return (
            <div key={r.key} style={{ padding: 14, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6, borderLeft: `3px solid ${riskColor(d.level)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <r.icon size={14} color={riskColor(d.level)} />
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{r.label}</div>
                </div>
                <div style={{ padding: "3px 10px", background: `${riskColor(d.level)}15`, color: riskColor(d.level), fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3, textTransform: "uppercase" }}>{d.level}</div>
              </div>
              {d.affectedRevenue && <div style={{ fontSize: 10, color: "#f59e0b", marginBottom: 6 }}>Exposure: {d.affectedRevenue}</div>}
              <div style={{ fontSize: 11, color: "#d1d5db", lineHeight: 1.5 }}>{d.details}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ padding: 16, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#ef4444", marginBottom: 10 }}>◆ GEOPOLITISCHE HOTSPOTS</div>
          {data.geopoliticalHotspots.map((h, i) => (
            <div key={i} style={{ fontSize: 12, padding: "5px 0", color: "#d1d5db" }}>▸ {h}</div>
          ))}
        </div>
        <div style={{ padding: 16, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#ef4444", marginBottom: 10 }}>◆ KEY WATCH POINTS</div>
          {data.keyWatchPoints.map((w, i) => (
            <div key={i} style={{ fontSize: 12, padding: "5px 0", color: "#d1d5db" }}>▸ {w}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// HISTORICAL VALIDATION RENDER
// ============================================
function HistoricalRender({ data, stock }) {
  const verdictColor = { confirmed: "#10b981", partially_confirmed: "#f59e0b", contradicted: "#ef4444" }[data.verdict.rating] || "#9ca3af";
  const verdictLabel = { confirmed: "BESTAETIGT", partially_confirmed: "TEILS BESTAETIGT", contradicted: "WIDERSPROCHEN" }[data.verdict.rating] || "UNKLAR";

  return (
    <div>
      {/* VERDICT CARD - zentrale Aussage oben */}
      <div style={{ padding: 20, background: `${verdictColor}08`, border: `1px solid ${verdictColor}60`, borderRadius: 6, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280", marginBottom: 6 }}>◆ FINALES VERDICT DER HISTORIE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: verdictColor, letterSpacing: 1 }}>{verdictLabel}</div>
          </div>
          <div style={{ padding: "8px 14px", background: `${verdictColor}15`, color: verdictColor, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, borderRadius: 4, border: `1px solid ${verdictColor}40` }}>
            {data.verdict.confidenceAdjustment}
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#e4e7ee", lineHeight: 1.6 }}>{data.verdict.summary}</div>
      </div>

      {/* KALIBRIERUNG - Trefferquoten */}
      <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Eye size={14} color="#14b8a6" />
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#14b8a6" }}>◆ KALIBRIERUNG DER THESEN</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
          <CalibrationBar label="BULL THESE" rate={data.calibration.bullThesisHitRate} color="#10b981" />
          <CalibrationBar label="BASE THESE" rate={data.calibration.baseThesisHitRate} color="#f59e0b" />
          <CalibrationBar label="BEAR THESE" rate={data.calibration.bearThesisHitRate} color="#ef4444" />
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5, padding: "10px 0 0", borderTop: "1px dashed #1f2937" }}>
          {data.calibration.explanation}
        </div>
      </div>

      {/* HISTORISCHE PARALLELEN */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Archive size={14} color="#14b8a6" />
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#14b8a6" }}>◆ HISTORISCHE PARALLELEN ({data.parallels.length})</div>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {data.parallels.map((p, i) => (
            <div key={i} style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <Calendar size={12} color="#14b8a6" />
                    <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: 1 }}>{p.date}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#e4e7ee" }}>{p.name}</div>
                </div>
                <div style={{ padding: "4px 10px", background: `${getColor(p.similarity)}15`, color: getColor(p.similarity), fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3, border: `1px solid ${getColor(p.similarity)}40` }}>
                  {p.similarity}% AEHNLICH
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                <HistRow label="SITUATION" text={p.situation} color="#9ca3af" />
                <HistRow label="ERWARTUNG DAMALS" text={p.expectedAtTime} color="#f59e0b" />
                <HistRow label="TATSAECHLICH PASSIERT" text={p.actualOutcome} color="#60a5fa" />
              </div>

              {/* PERFORMANCE TIMELINE */}
              <div style={{ padding: 12, background: "#111827", borderRadius: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", marginBottom: 8 }}>PERFORMANCE NACH EVENT</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {["1m", "3m", "6m", "12m"].map(period => {
                    const val = p.performance[period];
                    const isPositive = val && val.includes("+");
                    const isNegative = val && val.includes("-");
                    const color = isPositive ? "#10b981" : isNegative ? "#ef4444" : "#9ca3af";
                    return (
                      <div key={period} style={{ textAlign: "center", padding: "6px 4px", background: "#0a0e1a", borderRadius: 3 }}>
                        <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, marginBottom: 3 }}>+{period.toUpperCase()}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color }}>{val || "-"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ padding: "10px 12px", background: "rgba(20,184,166,0.05)", border: "1px solid rgba(20,184,166,0.2)", borderRadius: 4 }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "#14b8a6", marginBottom: 4 }}>◆ LEHRE</div>
                <div style={{ fontSize: 11, color: "#d1d5db", lineHeight: 1.5 }}>{p.lesson}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BLINDSPOTS */}
      <div style={{ padding: 18, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <AlertCircle size={14} color="#ef4444" />
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#ef4444" }}>◆ BLINDSPOTS DEINER ANALYSEN</div>
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 12 }}>Was die Historie zeigt, das in den bisherigen Analysen untergegangen ist:</div>
        {data.blindspots.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < data.blindspots.length - 1 ? "1px dashed #1f2937" : "none" }}>
            <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 11, minWidth: 20 }}>{i + 1}.</div>
            <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalibrationBar({ label, rate, color }) {
  return (
    <div style={{ padding: 12, background: "#111827", borderRadius: 4 }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1, marginBottom: 6 }}>{rate}%</div>
      <div style={{ height: 4, background: "#1f2937", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${rate}%`, background: color, transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 5, letterSpacing: 1 }}>HIT RATE HISTORISCH</div>
    </div>
  );
}

function HistRow({ label, text, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 2, color, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================
function ScoreCard({ label, icon: Icon, score }) {
  return (
    <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 4, padding: "12px 16px", minWidth: 130 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Icon size={11} color="#6b7280" />
        <div style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280" }}>{label}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: getColor(score), lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 9, letterSpacing: 1, color: getColor(score), marginTop: 4, fontWeight: 600 }}>{getSignal(score)}</div>
    </div>
  );
}

function DetailPanel({ title, icon: Icon, color, children }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #1f2937" }}>
        <Icon size={14} color={color} />
        <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function DetailRow({ label, value, score, textValue }) {
  const color = textValue ? "#e4e7ee" : getColor(score);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed #1f2937" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!textValue && <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />}
        <span style={{ fontSize: 12, color: "#d1d5db" }}>{label}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}
