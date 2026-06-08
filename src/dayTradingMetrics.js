// dayTradingMetrics.js
// Berechnet die 5 Day-Trading-Metriken aus Quote + Candle-Daten
// Alle Berechnungen aus FREI verfuegbaren Finnhub-Daten

// ============================================
// 1. INTRADAY RANGE
// (Tageshoch - Tagestief) / Open in %
// Zeigt heutige Volatilitaet
// ============================================
export const calcIntradayRange = (quote) => {
  if (!quote || !quote.open || !quote.high || !quote.low) return null;
  const range = quote.high - quote.low;
  const rangePct = (range / quote.open) * 100;
  return rangePct;
};

// ============================================
// 2. POSITION IM TAGESBEREICH
// Wo steht der Preis zwischen Tageshoch und Tagestief?
// 0 = am Tief, 50 = Mitte, 100 = am Hoch
// Wichtig fuer "Mean Reversion" Trades (kauf am Tief, verkauf am Hoch)
// ============================================
export const calcDayRangePosition = (quote) => {
  if (!quote || !quote.price || !quote.high || !quote.low) return null;
  const range = quote.high - quote.low;
  if (range === 0) return 50;
  const position = ((quote.price - quote.low) / range) * 100;
  return Math.max(0, Math.min(100, position));
};

// ============================================
// 3. DISTANCE VOM OPEN
// Aktuelle Bewegung seit Marktstart in %
// ============================================
export const calcDistanceFromOpen = (quote) => {
  if (!quote || !quote.open || !quote.price) return null;
  return ((quote.price - quote.open) / quote.open) * 100;
};

// ============================================
// 4. RANGE VS DURCHSCHNITT (vergangene Tage)
// Ist heute mehr/weniger Bewegung als die letzten 5 Tage?
// Proxy fuer Volatility-Spike
// ============================================
export const calcRangeVsAverage = (quote, candles) => {
  if (!quote || !candles || candles.length < 2) return null;
  
  const todayRange = calcIntradayRange(quote);
  if (todayRange === null) return null;
  
  // Berechne durchschnittliche Range der letzten Tage (ohne heute)
  const historicalCandles = candles.slice(0, -1); // alle ausser heute
  if (historicalCandles.length === 0) return null;
  
  const avgRange = historicalCandles.reduce((sum, c) => {
    if (!c.open) return sum;
    return sum + ((c.high - c.low) / c.open * 100);
  }, 0) / historicalCandles.length;
  
  if (avgRange === 0) return null;
  return todayRange / avgRange; // 1.0 = wie immer, 2.0 = doppelt so volatil
};

// ============================================
// 5. MOMENTUM
// Simple Berechnung aus letzten Candles:
// Wie konsistent ist die Bewegung der letzten Tage?
// +100 = stark bullisch, -100 = stark baerisch, 0 = neutral
// ============================================
export const calcMomentum = (candles) => {
  if (!candles || candles.length < 2) return null;
  
  // Nehme letzte 3 Tage (oder weniger wenn nicht verfuegbar)
  const recent = candles.slice(-Math.min(3, candles.length));
  let positiveDays = 0;
  let totalChange = 0;
  
  for (let i = 1; i < recent.length; i++) {
    const change = (recent[i].close - recent[i - 1].close) / recent[i - 1].close;
    totalChange += change;
    if (change > 0) positiveDays++;
  }
  
  // Score: gewichtete Kombination aus Richtung-Konsistenz + Gesamtbewegung
  const directionScore = (positiveDays / (recent.length - 1)) * 100 - 50; // -50 bis 50
  const magnitudeScore = totalChange * 100 * 10; // Gesamtbewegung skaliert
  
  const momentum = directionScore + magnitudeScore;
  return Math.max(-100, Math.min(100, momentum));
};

// ============================================
// ALLES BERECHNEN
// Returns { intradayRange, dayRangePosition, distanceFromOpen, rangeVsAverage, momentum }
// ============================================
export const calcAllMetrics = (quote, candles) => {
  return {
    intradayRange: calcIntradayRange(quote),
    dayRangePosition: calcDayRangePosition(quote),
    distanceFromOpen: calcDistanceFromOpen(quote),
    rangeVsAverage: calcRangeVsAverage(quote, candles),
    momentum: calcMomentum(candles)
  };
};

// ============================================
// LIVE DAILY SCORE
// Komplett neue Score-Logik basierend auf Live-Metriken
// Score 0-100, hoeher = bessere Day-Trading-Chance
// Logik: belohnt hohe Volatility + klare Direction + Mean-Reversion-Chancen
// ============================================
export const calcLiveDailyScore = (metrics, quote) => {
  if (!metrics) return 50;
  
  let score = 50;
  
  // Range Spike: ueberdurchschnittliche Volatility ist gut fuer Day Trading (+/-15)
  if (metrics.rangeVsAverage !== null) {
    if (metrics.rangeVsAverage >= 2.0) score += 15;
    else if (metrics.rangeVsAverage >= 1.5) score += 10;
    else if (metrics.rangeVsAverage >= 1.2) score += 5;
    else if (metrics.rangeVsAverage < 0.7) score -= 10; // zu ruhig = nichts los
  }
  
  // Intraday Range: starke Bewegung heute = Chance (+/-10)
  if (metrics.intradayRange !== null) {
    if (metrics.intradayRange >= 5) score += 10;
    else if (metrics.intradayRange >= 3) score += 7;
    else if (metrics.intradayRange >= 2) score += 3;
    else if (metrics.intradayRange < 1) score -= 5;
  }
  
  // Mean Reversion Chance: extreme Position im Tagesbereich (+/-10)
  // Sehr nah am Tief = potentieller Kauf, sehr nah am Hoch = potentieller Verkauf
  if (metrics.dayRangePosition !== null) {
    if (metrics.dayRangePosition <= 15) score += 10; // sehr nah am Tief
    else if (metrics.dayRangePosition >= 85) score += 8; // sehr nah am Hoch
    else if (metrics.dayRangePosition >= 40 && metrics.dayRangePosition <= 60) score -= 3; // langweilig
  }
  
  // Momentum: klare Richtung bevorzugt (+/-10)
  if (metrics.momentum !== null) {
    if (Math.abs(metrics.momentum) >= 60) score += 10;
    else if (Math.abs(metrics.momentum) >= 30) score += 5;
  }
  
  // Distance from Open: starke Bewegung weg vom Open (+/-5)
  if (metrics.distanceFromOpen !== null) {
    if (Math.abs(metrics.distanceFromOpen) >= 3) score += 5;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

// ============================================
// FORMAT HELPERS
// ============================================
export const formatRange = (range) => {
  if (range === null || range === undefined) return "—";
  return range.toFixed(2) + "%";
};

export const formatRangePosition = (pos) => {
  if (pos === null || pos === undefined) return "—";
  if (pos <= 15) return `${pos.toFixed(0)}% (TIEF)`;
  if (pos >= 85) return `${pos.toFixed(0)}% (HOCH)`;
  return `${pos.toFixed(0)}%`;
};

export const formatRangeMultiplier = (mult) => {
  if (mult === null || mult === undefined) return "—";
  return mult.toFixed(2) + "x";
};

export const formatMomentum = (m) => {
  if (m === null || m === undefined) return "—";
  if (m >= 60) return "STRONG ↑";
  if (m >= 30) return "BULLISH ↑";
  if (m >= 10) return "leicht ↑";
  if (m <= -60) return "STRONG ↓";
  if (m <= -30) return "BEARISH ↓";
  if (m <= -10) return "leicht ↓";
  return "neutral";
};
