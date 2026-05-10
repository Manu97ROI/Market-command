import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, Zap, Target, Fish, ArrowUpRight, ArrowDownRight, Building2, User, Flame, Anchor, Brain, Globe, Landmark, Gauge, Layers, Sparkles, Send, Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, History, Eye, AlertCircle, Calendar, Archive, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getQuote, getProfile, searchSymbols, formatMarketCap, getMultipleQuotes } from "./finnhubClient.js";

// ============================================
// STOCK DATABASE mit erweitertem Kontext fuer LLM
// ============================================
const STOCK_DB = {
  NVDA: {
    ticker: "NVDA", name: "NVIDIA Corp.", price: 184.32, change: 3.45, sector: "Technology", marketCap: "4.5T",
    daily: { momentum: 88, gapPct: 2.1, preMarketVol: "high", intraDayRange: 4.2, volVsAvg: 1.85, catalyst: "AI Earnings Beat", catalystStrength: 90, breakoutProximity: 95, volatility: 82 },
    longterm: { epsGrowth5Y: 68.5, revenueGrowth5Y: 52.3, moat: 95, debtToEquity: 0.15, roe: 115.4, fcfGrowth: 78.2, pe: 58.3, peg: 0.85, sectorTrend: 92 },
    whales: [
      { name: "Citadel Advisors", type: "hedge_fund", action: "bought", shares: 2400000, avgPrice: 178.50, value: "428M", date: "3d ago", confidence: "high" },
      { name: "Berkshire Hathaway", type: "institution", action: "bought", shares: 850000, avgPrice: 175.20, value: "149M", date: "1w ago", confidence: "very_high" },
      { name: "Jensen Huang (CEO)", type: "insider", action: "sold", shares: 120000, avgPrice: 182.10, value: "21.8M", date: "5d ago", confidence: "neutral" },
      { name: "BlackRock", type: "institution", action: "bought", shares: 1800000, avgPrice: 176.80, value: "318M", date: "2w ago", confidence: "high" }
    ],
    context: "Marktfuehrer KI-Chips (~80% Data Center GPUs), abhaengig von TSMC Taiwan fuer Produktion. Hauptkunden: Microsoft, Google, Meta, Amazon. Export-Restriktionen China kritisch. CUDA-Software-Moat sehr stark."
  },
  AAPL: {
    ticker: "AAPL", name: "Apple Inc.", price: 229.87, change: 1.23, sector: "Technology", marketCap: "3.4T",
    daily: { momentum: 55, gapPct: 0.4, preMarketVol: "avg", intraDayRange: 1.8, volVsAvg: 0.95, catalyst: "None", catalystStrength: 30, breakoutProximity: 60, volatility: 45 },
    longterm: { epsGrowth5Y: 15.2, revenueGrowth5Y: 8.5, moat: 92, debtToEquity: 1.45, roe: 148.2, fcfGrowth: 12.5, pe: 32.1, peg: 2.1, sectorTrend: 75 },
    whales: [
      { name: "Warren Buffett / BRK", type: "institution", action: "sold", shares: 100000000, avgPrice: 225.40, value: "22500M", date: "1m ago", confidence: "high" },
      { name: "Vanguard Group", type: "institution", action: "bought", shares: 3200000, avgPrice: 228.10, value: "730M", date: "2w ago", confidence: "neutral" },
      { name: "Tim Cook (CEO)", type: "insider", action: "sold", shares: 50000, avgPrice: 227.80, value: "11M", date: "1w ago", confidence: "neutral" }
    ],
    context: "iPhone ~50% Revenue. China 20% Revenue + Manufacturing Risk. Services wachsen stark. KI-Nachzuegler vs Google/Microsoft. Ecosystem Lock-in stark, aber Smartphone-Markt gesaettigt."
  },
  TSLA: {
    ticker: "TSLA", name: "Tesla Inc.", price: 312.45, change: -2.15, sector: "Automotive", marketCap: "1.0T",
    daily: { momentum: 28, gapPct: -1.8, preMarketVol: "high", intraDayRange: 5.2, volVsAvg: 1.45, catalyst: "Delivery Miss", catalystStrength: 75, breakoutProximity: 25, volatility: 88 },
    longterm: { epsGrowth5Y: -8.5, revenueGrowth5Y: 22.4, moat: 62, debtToEquity: 0.18, roe: 18.5, fcfGrowth: -15.2, pe: 65.2, peg: 3.8, sectorTrend: 55 },
    whales: [
      { name: "Elon Musk", type: "insider", action: "bought", shares: 500000, avgPrice: 308.20, value: "154M", date: "4d ago", confidence: "very_high" },
      { name: "ARK Invest", type: "hedge_fund", action: "bought", shares: 380000, avgPrice: 310.50, value: "118M", date: "1w ago", confidence: "high" },
      { name: "Scion Asset Mgmt", type: "hedge_fund", action: "sold", shares: 250000, avgPrice: 315.20, value: "79M", date: "2w ago", confidence: "high" }
    ],
    context: "EV Leader aber BYD China holt auf. FSD/Robotaxi als Wachstums-Bet. Energy Storage Segment waechst. Musk-Risk (CEO-Distraction). China ~22% Revenue. Margen unter Druck durch Preiskriege."
  },
  MSFT: {
    ticker: "MSFT", name: "Microsoft Corp.", price: 442.18, change: 0.87, sector: "Technology", marketCap: "3.3T",
    daily: { momentum: 52, gapPct: 0.3, preMarketVol: "avg", intraDayRange: 1.2, volVsAvg: 0.88, catalyst: "None", catalystStrength: 25, breakoutProximity: 55, volatility: 38 },
    longterm: { epsGrowth5Y: 18.5, revenueGrowth5Y: 15.8, moat: 94, debtToEquity: 0.35, roe: 38.5, fcfGrowth: 22.1, pe: 35.4, peg: 1.9, sectorTrend: 88 },
    whales: [
      { name: "Vanguard Group", type: "institution", action: "bought", shares: 1500000, avgPrice: 440.50, value: "660M", date: "1w ago", confidence: "neutral" },
      { name: "Satya Nadella (CEO)", type: "insider", action: "bought", shares: 35000, avgPrice: 438.20, value: "15M", date: "2w ago", confidence: "very_high" },
      { name: "State Street", type: "institution", action: "bought", shares: 920000, avgPrice: 441.10, value: "406M", date: "3w ago", confidence: "high" }
    ],
    context: "Cloud (Azure) + Enterprise + OpenAI Partner. Copilot KI-Monetization laeuft. Stabil diversifiziert. Azure waechst schneller als AWS. CapEx steigt stark fuer KI-Infrastruktur."
  },
  AMD: {
    ticker: "AMD", name: "Advanced Micro Devices", price: 142.56, change: -1.42, sector: "Technology", marketCap: "230B",
    daily: { momentum: 72, gapPct: -0.8, preMarketVol: "high", intraDayRange: 3.8, volVsAvg: 1.55, catalyst: "MI350 Launch", catalystStrength: 78, breakoutProximity: 85, volatility: 72 },
    longterm: { epsGrowth5Y: 28.5, revenueGrowth5Y: 22.1, moat: 68, debtToEquity: 0.08, roe: 3.2, fcfGrowth: 18.5, pe: 185.3, peg: 1.2, sectorTrend: 85 },
    whales: [
      { name: "Citadel Advisors", type: "hedge_fund", action: "bought", shares: 1200000, avgPrice: 140.20, value: "168M", date: "2d ago", confidence: "high" },
      { name: "Lisa Su (CEO)", type: "insider", action: "bought", shares: 25000, avgPrice: 139.80, value: "4M", date: "1w ago", confidence: "very_high" },
      { name: "Fidelity", type: "institution", action: "bought", shares: 680000, avgPrice: 141.50, value: "96M", date: "2w ago", confidence: "high" }
    ],
    context: "NVIDIAs einziger echter GPU-Rivale. MI350/MI400 Chips direkt gegen NVDA H100/B200. CPU Marktanteil waechst vs Intel. Kleinere Skala = mehr Volatilitaet, aber mehr Upside."
  },
  BTC: {
    ticker: "BTC", name: "Bitcoin", price: 96420.00, change: 2.85, sector: "Crypto", marketCap: "1.9T",
    daily: { momentum: 82, gapPct: 1.8, preMarketVol: "high", intraDayRange: 3.2, volVsAvg: 1.65, catalyst: "ETF Inflows", catalystStrength: 85, breakoutProximity: 92, volatility: 68 },
    longterm: { epsGrowth5Y: 0, revenueGrowth5Y: 0, moat: 85, debtToEquity: 0, roe: 0, fcfGrowth: 0, pe: 0, peg: 0, sectorTrend: 78 },
    whales: [
      { name: "MicroStrategy", type: "institution", action: "bought", shares: 15400, avgPrice: 94500, value: "1450M", date: "3d ago", confidence: "very_high" },
      { name: "BlackRock IBIT", type: "institution", action: "bought", shares: 8200, avgPrice: 95100, value: "780M", date: "1w ago", confidence: "high" },
      { name: "Metaplanet", type: "institution", action: "bought", shares: 2100, avgPrice: 95800, value: "201M", date: "5d ago", confidence: "high" }
    ],
    context: "Digitales Gold Narrative. ETF-Inflows seit 2024 massiv. Halving-Cycle. Korrelation zu Tech-Aktien schwankt. Macro-Liquiditaet treibt den Kurs. Regulatorisches Risiko bleibt."
  },
  GOOGL: {
    ticker: "GOOGL", name: "Alphabet Inc.", price: 198.45, change: 2.12, sector: "Technology", marketCap: "2.4T",
    daily: { momentum: 68, gapPct: 1.2, preMarketVol: "above_avg", intraDayRange: 2.4, volVsAvg: 1.25, catalyst: "Gemini 3 Launch", catalystStrength: 70, breakoutProximity: 78, volatility: 52 },
    longterm: { epsGrowth5Y: 22.4, revenueGrowth5Y: 18.2, moat: 90, debtToEquity: 0.12, roe: 32.5, fcfGrowth: 25.8, pe: 26.8, peg: 1.2, sectorTrend: 82 },
    whales: [
      { name: "Vanguard Group", type: "institution", action: "bought", shares: 2100000, avgPrice: 196.80, value: "413M", date: "1w ago", confidence: "neutral" },
      { name: "Sundar Pichai (CEO)", type: "insider", action: "sold", shares: 22000, avgPrice: 197.50, value: "4M", date: "3w ago", confidence: "neutral" }
    ],
    context: "Suche-Monopol unter Druck (US Antitrust + KI-Konkurrenz). Gemini holt auf vs OpenAI. YouTube + Cloud stark. Waymo Robotaxi-Option. Regulatorisches Risiko hoch."
  }
};

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

// ============================================
// CLAUDE API WRAPPER fuer Analyse-Generierung
// ============================================
const callClaudeAPI = async (systemPrompt, userPrompt) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });
    if (!response.ok) {
      throw new Error(`API noch nicht angebunden (Phase 2). Nutze "LOAD DEMO" um die App zu testen.`);
    }
    const data = await response.json();
    const text = data.content.map(c => c.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("API Error:", err);
    throw new Error(err.message || `API noch nicht angebunden (Phase 2). Nutze "LOAD DEMO" um die App zu testen.`);
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
export default function TradingApp() {
  const [tab, setTab] = useState("daily");
  const [selectedStock, setSelectedStock] = useState(null);
  const [query, setQuery] = useState("");
  
  // Live-Daten-State
  const [liveQuotes, setLiveQuotes] = useState({}); // { TICKER: { price, change, ... } }
  const [liveStocks, setLiveStocks] = useState({}); // Aktien NICHT in STOCK_DB (Live-only)
  const [liveSearchResults, setLiveSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [apiStatus, setApiStatus] = useState("unknown"); // "ok" | "error" | "unknown"
  const [lastRefresh, setLastRefresh] = useState(null);
  const searchDebounceRef = useRef(null);

  // Hilfsfunktion: Stock aus DB oder Live holen, mit Live-Quote merge
  const getEnrichedStock = (ticker) => {
    const base = STOCK_DB[ticker] || liveStocks[ticker];
    if (!base) return null;
    const liveQuote = liveQuotes[ticker];
    if (liveQuote) {
      return { ...base, price: liveQuote.price, change: liveQuote.change, _live: true };
    }
    return base;
  };

  const allStocks = Object.values(STOCK_DB).map(s => getEnrichedStock(s.ticker)).filter(Boolean);

  // Live-Quotes fuer alle Demo-Stocks holen
  const refreshQuotes = async () => {
    setRefreshing(true);
    try {
      const symbols = Object.keys(STOCK_DB).filter(t => t !== "BTC"); // BTC nicht via Finnhub stock-quote
      const quotes = await getMultipleQuotes(symbols);
      const quoteMap = {};
      quotes.forEach(q => {
        if (q.price && q.price > 0) {
          quoteMap[q.symbol] = { price: q.price, change: q.change || 0 };
        }
      });
      setLiveQuotes(prev => ({ ...prev, ...quoteMap }));
      setApiStatus(Object.keys(quoteMap).length > 0 ? "ok" : "error");
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Refresh fehlgeschlagen:", err);
      setApiStatus("error");
    } finally {
      setRefreshing(false);
    }
  };

  // Beim ersten Laden: Quotes refreshen
  useEffect(() => {
    refreshQuotes();
  }, []);

  // Live-Suche mit Debounce
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!query || query.length < 1) {
      setLiveSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchSymbols(query);
        setLiveSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
        setLiveSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [query]);

  // Wenn neue Aktie ausgewaehlt die NICHT in STOCK_DB ist -> Live-Profil holen
  const selectStock = async (ticker) => {
    setSelectedStock(ticker);
    setQuery("");
    setLiveSearchResults([]);
    setTab("detail");
    
    if (!STOCK_DB[ticker] && !liveStocks[ticker]) {
      // Hole Live Quote + Profile
      try {
        const [quote, profile] = await Promise.all([
          getQuote(ticker).catch(() => null),
          getProfile(ticker).catch(() => null)
        ]);
        if (quote && profile && profile.name) {
          // Erstelle minimales Stock-Objekt mit Live-Daten + neutralen Defaults
          const newStock = {
            ticker,
            name: profile.name,
            price: quote.price,
            change: quote.change || 0,
            sector: profile.sector || "Unknown",
            marketCap: formatMarketCap(profile.marketCap),
            // Neutrale Defaults fuer Scores (Demo-Felder bei unbekannten Aktien)
            daily: { momentum: 50, gapPct: 0, preMarketVol: "avg", intraDayRange: 0, volVsAvg: 1, catalyst: "Live-Daten", catalystStrength: 30, breakoutProximity: 50, volatility: 50 },
            longterm: { epsGrowth5Y: 0, revenueGrowth5Y: 0, moat: 50, debtToEquity: 0.5, roe: 10, fcfGrowth: 0, pe: 0, peg: 0, sectorTrend: 50 },
            whales: [],
            context: `${profile.name} ist ein ${profile.sector || "Unbekannt"}-Unternehmen mit Sitz in ${profile.country || "USA"}. Live-Daten von Finnhub. Whale-Tracking und Fundamentals werden in Phase 2B angebunden.`,
            _liveOnly: true
          };
          setLiveStocks(prev => ({ ...prev, [ticker]: newStock }));
          setLiveQuotes(prev => ({ ...prev, [ticker]: { price: quote.price, change: quote.change || 0 } }));
        }
      } catch (err) {
        console.error("Stock laden fehlgeschlagen:", err);
      }
    }
  };

  const dailyRanked = useMemo(() => allStocks.map(s => ({ ...s, score: calcDailyScore(s) })).sort((a,b) => b.score - a.score), [liveQuotes]);
  const longTermRanked = useMemo(() => allStocks.map(s => ({ ...s, score: calcLongTermScore(s) })).sort((a,b) => b.score - a.score), [liveQuotes]);

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
                    return (
                      <div key={s.symbol} onClick={() => selectStock(s.symbol)}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", fontSize: 12, alignItems: "center" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#1f2937"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div>
                          <span style={{ fontWeight: 700, color: "#10b981" }}>{s.symbol}</span>
                          <span style={{ color: "#6b7280", marginLeft: 10 }}>{s.name}</span>
                        </div>
                        {inDB ? (
                          <span style={{ fontSize: 9, color: "#10b981", letterSpacing: 1, background: "rgba(16,185,129,0.1)", padding: "2px 6px", borderRadius: 3 }}>DB+LIVE</span>
                        ) : (
                          <span style={{ fontSize: 9, color: "#60a5fa", letterSpacing: 1 }}>LIVE</span>
                        )}
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
            { id: "longterm", label: "LONG-TERM", icon: Anchor },
            { id: "detail", label: "DEEP DIVE", icon: Target, disabled: !selectedStock },
            { id: "lab", label: "ANALYSIS LAB", icon: Brain, disabled: !selectedStock }
          ].map(t => (
            <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} disabled={t.disabled}
              style={{ background: "transparent", border: "none", borderBottom: tab === t.id ? "2px solid #10b981" : "2px solid transparent", color: tab === t.id ? "#10b981" : t.disabled ? "#374151" : "#9ca3af", padding: "12px 20px", cursor: t.disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: -1 }}>
              <t.icon size={12} />{t.label}
              {t.id === "lab" && <Sparkles size={10} color="#f59e0b" />}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px" }}>
        {tab === "daily" && <DailyTab stocks={dailyRanked} onSelect={(t) => { setSelectedStock(t); setTab("detail"); }} />}
        {tab === "longterm" && <LongTermTab stocks={longTermRanked} onSelect={(t) => { setSelectedStock(t); setTab("detail"); }} />}
        {tab === "detail" && selectedStock && getEnrichedStock(selectedStock) && <DetailTab stock={getEnrichedStock(selectedStock)} onLab={() => setTab("lab")} />}
        {tab === "lab" && selectedStock && getEnrichedStock(selectedStock) && <AnalysisLab stock={getEnrichedStock(selectedStock)} />}

        <div style={{ textAlign: "center", fontSize: 10, color: "#4b5563", letterSpacing: 2, padding: "32px 16px 16px" }}>
          ◆ PHASE 2A · LIVE QUOTES via FINNHUB · ANALYSE-ENGINE VIA CLAUDE API ◆
        </div>
      </div>
    </div>
  );
}

// ============================================
// DAILY TAB
// ============================================
function DailyTab({ stocks, onSelect }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Flame size={18} color="#f59e0b" />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Heutige Trading-Chancen</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Sortiert nach Momentum, Catalyst-Staerke, Breakout-Proximity</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {stocks.map((s, i) => (
          <div key={s.ticker} onClick={() => onSelect(s.ticker)}
            style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 20, cursor: "pointer", display: "grid", gridTemplateColumns: "40px 140px 1fr auto 120px", gap: 20, alignItems: "center" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"} onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#374151" }}>#{i+1}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981" }}>{s.ticker}</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>{s.sector}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>${s.price.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: s.change >= 0 ? "#10b981" : "#ef4444" }}>{s.change >= 0 ? "+" : ""}{s.change}%</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, fontSize: 11 }}>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>MOMENTUM</div><div style={{ color: getColor(s.daily.momentum), fontWeight: 600 }}>{s.daily.momentum}</div></div>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>VOL vs AVG</div><div style={{ fontWeight: 600 }}>{s.daily.volVsAvg}x</div></div>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>BREAKOUT</div><div style={{ color: getColor(s.daily.breakoutProximity), fontWeight: 600 }}>{s.daily.breakoutProximity}%</div></div>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>CATALYST</div><div style={{ fontWeight: 600, fontSize: 10 }}>{s.daily.catalyst}</div></div>
            </div>
            <div style={{ textAlign: "center" }}>
              {s.daily.catalystStrength > 60 && (
                <div style={{ padding: "4px 10px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontSize: 9, fontWeight: 700, letterSpacing: 1, borderRadius: 3, border: "1px solid rgba(245,158,11,0.3)" }}>
                  <Flame size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />HOT
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: getColor(s.score), lineHeight: 1 }}>{s.score}</div>
              <div style={{ fontSize: 9, letterSpacing: 2, color: getColor(s.score), fontWeight: 600, marginTop: 4 }}>{getSignal(s.score)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// LONG-TERM TAB
// ============================================
function LongTermTab({ stocks, onSelect }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Anchor size={18} color="#10b981" />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Langfristige Kauf-Kandidaten</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Bewertet nach Growth, Moat, Financial Health, Sektor-Trend</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {stocks.map((s, i) => (
          <div key={s.ticker} onClick={() => onSelect(s.ticker)}
            style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 20, cursor: "pointer", display: "grid", gridTemplateColumns: "40px 140px 1fr 120px", gap: 20, alignItems: "center" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"} onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#374151" }}>#{i+1}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981" }}>{s.ticker}</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>{s.sector} · {s.marketCap}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>${s.price.toLocaleString()}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, fontSize: 11 }}>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>EPS 5Y</div><div style={{ color: s.longterm.epsGrowth5Y > 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{s.longterm.epsGrowth5Y}%</div></div>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>REV 5Y</div><div style={{ color: s.longterm.revenueGrowth5Y > 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{s.longterm.revenueGrowth5Y}%</div></div>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>MOAT</div><div style={{ color: getColor(s.longterm.moat), fontWeight: 600 }}>{s.longterm.moat}</div></div>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>PEG</div><div style={{ color: s.longterm.peg > 0 && s.longterm.peg < 1 ? "#10b981" : s.longterm.peg < 2 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>{s.longterm.peg || "N/A"}</div></div>
              <div><div style={{ color: "#6b7280", marginBottom: 2 }}>SEKTOR</div><div style={{ color: getColor(s.longterm.sectorTrend), fontWeight: 600 }}>{s.longterm.sectorTrend}</div></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: getColor(s.score), lineHeight: 1 }}>{s.score}</div>
              <div style={{ fontSize: 9, letterSpacing: 2, color: getColor(s.score), fontWeight: 600, marginTop: 4 }}>{getSignal(s.score)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// DETAIL TAB
// ============================================
function DetailTab({ stock: s, onLab }) {
  const dailyScore = calcDailyScore(s);
  const longScore = calcLongTermScore(s);
  const whaleScore = calcWhaleScore(s.whales);
  const buying = s.whales.filter(w => w.action === "bought");
  const selling = s.whales.filter(w => w.action === "sold");
  const totalBuy = buying.reduce((sum, w) => sum + parseFloat(w.value.replace("M", "")), 0);
  const totalSell = selling.reduce((sum, w) => sum + parseFloat(w.value.replace("M", "")), 0);

  return (
    <div>
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b7280" }}>{s.sector.toUpperCase()} · MCAP {s.marketCap}</div>
            <div style={{ fontSize: 42, fontWeight: 700, color: "#10b981", lineHeight: 1.1, marginTop: 4 }}>{s.ticker}</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{s.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 600 }}>${s.price.toLocaleString()}</div>
              <div style={{ fontSize: 13, color: s.change >= 0 ? "#10b981" : "#ef4444" }}>{s.change >= 0 ? "+" : ""}{s.change}%</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <ScoreCard label="DAILY" icon={Zap} score={dailyScore} />
            <ScoreCard label="LONG-TERM" icon={Anchor} score={longScore} />
            <ScoreCard label="WHALE SENTIMENT" icon={Fish} score={whaleScore} />
            <button onClick={onLab} style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(96,165,250,0.15))", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 4, padding: "12px 16px", color: "#10b981", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, height: "fit-content" }}>
              <Brain size={14} />ANALYSIS LAB<Sparkles size={12} color="#f59e0b" />
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #1f2937" }}>
          <Fish size={16} color="#10b981" />
          <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>WHALE & INSIDER ACTIVITY</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#10b981", marginBottom: 6 }}>◆ BUYING PRESSURE</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>${totalBuy.toFixed(0)}M</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{buying.length} whale(s) accumulating</div>
          </div>
          <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#ef4444", marginBottom: 6 }}>◆ SELLING PRESSURE</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>${totalSell.toFixed(0)}M</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{selling.length} whale(s) distributing</div>
          </div>
        </div>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 120px 90px 100px", gap: 12, padding: "10px 12px", fontSize: 10, letterSpacing: 2, color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
            <div>ENTITY</div><div>TYPE</div><div>ACTION</div><div style={{ textAlign: "right" }}>SHARES @ PRICE</div><div style={{ textAlign: "right" }}>VALUE</div><div style={{ textAlign: "right" }}>WHEN</div>
          </div>
          {s.whales.map((w, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 120px 90px 100px", gap: 12, padding: "14px 12px", fontSize: 12, borderBottom: "1px dashed #1f2937", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {w.type === "insider" ? <User size={12} color="#f59e0b" /> : w.type === "hedge_fund" ? <Fish size={12} color="#8b5cf6" /> : <Building2 size={12} color="#60a5fa" />}
                <div>
                  <div style={{ fontWeight: 600 }}>{w.name}</div>
                  {w.confidence === "very_high" && <div style={{ fontSize: 9, color: "#10b981", letterSpacing: 1, marginTop: 2 }}>◆ HIGH CONVICTION</div>}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>{w.type.replace("_", " ")}</div>
              <div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 1, background: w.action === "bought" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: w.action === "bought" ? "#10b981" : "#ef4444" }}>
                  {w.action === "bought" ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{w.action.toUpperCase()}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div>{formatNum(w.shares)}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>@ ${w.avgPrice.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700, color: w.action === "bought" ? "#10b981" : "#ef4444" }}>${w.value}</div>
              <div style={{ textAlign: "right", fontSize: 10, color: "#9ca3af" }}>{w.date}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <DetailPanel title="DAILY SETUP" icon={Zap} color="#f59e0b">
          <DetailRow label="Momentum" value={s.daily.momentum} score={s.daily.momentum} />
          <DetailRow label="Catalyst" value={s.daily.catalyst} textValue />
          <DetailRow label="Catalyst Strength" value={s.daily.catalystStrength} score={s.daily.catalystStrength} />
          <DetailRow label="Gap %" value={`${s.daily.gapPct}%`} textValue />
          <DetailRow label="Pre-Market Volume" value={s.daily.preMarketVol} textValue />
          <DetailRow label="Intraday Range" value={`${s.daily.intraDayRange}%`} textValue />
          <DetailRow label="Volume vs Avg" value={`${s.daily.volVsAvg}x`} textValue />
          <DetailRow label="Breakout Proximity" value={s.daily.breakoutProximity} score={s.daily.breakoutProximity} />
          <DetailRow label="Volatility" value={s.daily.volatility} score={s.daily.volatility} />
        </DetailPanel>
        <DetailPanel title="LONG-TERM PROFILE" icon={Anchor} color="#10b981">
          <DetailRow label="EPS Growth 5Y" value={`${s.longterm.epsGrowth5Y}%`} textValue />
          <DetailRow label="Revenue Growth 5Y" value={`${s.longterm.revenueGrowth5Y}%`} textValue />
          <DetailRow label="Moat Score" value={s.longterm.moat} score={s.longterm.moat} />
          <DetailRow label="Debt/Equity" value={s.longterm.debtToEquity} textValue />
          <DetailRow label="ROE" value={`${s.longterm.roe}%`} textValue />
          <DetailRow label="FCF Growth" value={`${s.longterm.fcfGrowth}%`} textValue />
          <DetailRow label="P/E Ratio" value={s.longterm.pe || "N/A"} textValue />
          <DetailRow label="PEG Ratio" value={s.longterm.peg || "N/A"} textValue />
          <DetailRow label="Sector Trend" value={s.longterm.sectorTrend} score={s.longterm.sectorTrend} />
        </DetailPanel>
      </div>
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
              <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginTop: 4 }}>Claude Sonnet 4</div>
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
Aktie: ${stock.ticker} (${stock.name})
Preis: $${stock.price} (${stock.change >= 0 ? "+" : ""}${stock.change}%)
Sektor: ${stock.sector}, Market Cap: ${stock.marketCap}
Kontext: ${stock.context}
Daily-Score: ${calcDailyScore(stock)}, Long-Term-Score: ${calcLongTermScore(stock)}
Catalyst heute: ${stock.daily.catalyst}
5Y EPS Growth: ${stock.longterm.epsGrowth5Y}%, Revenue Growth: ${stock.longterm.revenueGrowth5Y}%
P/E: ${stock.longterm.pe}, PEG: ${stock.longterm.peg}, Moat: ${stock.longterm.moat}/100
Whales: ${stock.whales.map(w => `${w.name} ${w.action} $${w.value}`).join("; ")}
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
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>${s.data.priceTarget.toLocaleString()}</div>
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
