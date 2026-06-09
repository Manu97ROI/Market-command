// longTermScoring.js
// Berechnet Long-Term-Score aus echten Finnhub Fundamentaldaten
// Returns score 0-100 (hoeher = besserer Long-Term Pick)

// Hilfsfunktionen fuer einzelne Metriken (jeweils 0-100)
const scoreROE = (roe) => {
  if (roe == null) return 50;
  if (roe >= 30) return 100;
  if (roe >= 20) return 85;
  if (roe >= 15) return 75;
  if (roe >= 10) return 60;
  if (roe >= 5) return 45;
  if (roe >= 0) return 30;
  return 10;
};

const scorePEG = (peg) => {
  if (peg == null || peg <= 0) return 50;
  if (peg < 1) return 90;
  if (peg < 1.5) return 75;
  if (peg < 2) return 60;
  if (peg < 3) return 40;
  return 20;
};

const scorePE = (pe) => {
  if (pe == null || pe <= 0) return 50;
  if (pe < 15) return 85;
  if (pe < 25) return 70;
  if (pe < 35) return 55;
  if (pe < 50) return 40;
  return 25;
};

const scoreGrowth = (growth) => {
  if (growth == null) return 50;
  if (growth >= 25) return 95;
  if (growth >= 15) return 80;
  if (growth >= 8) return 65;
  if (growth >= 3) return 50;
  if (growth >= 0) return 35;
  if (growth >= -5) return 20;
  return 10;
};

const scoreDebt = (debt) => {
  if (debt == null) return 50;
  if (debt < 0.3) return 90;
  if (debt < 0.6) return 75;
  if (debt < 1) return 60;
  if (debt < 1.5) return 45;
  if (debt < 2.5) return 30;
  return 15;
};

const scoreMargin = (margin) => {
  if (margin == null) return 50;
  if (margin >= 25) return 90;
  if (margin >= 15) return 75;
  if (margin >= 10) return 60;
  if (margin >= 5) return 45;
  if (margin >= 0) return 30;
  return 15;
};

// ============================================
// HAUPT-SCORE
// Gewichtung:
// - Profitabilitaet (ROE, Margin): 30%
// - Wachstum (EPS/Revenue): 30%
// - Bewertung (P/E, PEG): 25%
// - Financial Health (Debt): 15%
// ============================================
export const calcLongTermScoreLive = (fundamentals) => {
  if (!fundamentals) return null;
  
  const f = fundamentals;
  
  // Profitabilitaet (30%)
  const profitability = (scoreROE(f.roe) * 0.6 + scoreMargin(f.netMargin) * 0.4);
  
  // Wachstum (30%) - nimm das beste aus 5Y oder TTM
  const epsGrowth = f.epsGrowth5Y != null ? f.epsGrowth5Y : f.epsGrowthTTMYoy;
  const revGrowth = f.revenueGrowth5Y != null ? f.revenueGrowth5Y : f.revenueGrowthTTMYoy;
  const growth = (scoreGrowth(epsGrowth) * 0.5 + scoreGrowth(revGrowth) * 0.5);
  
  // Bewertung (25%)
  const valuation = (scorePEG(f.peg) * 0.5 + scorePE(f.pe) * 0.5);
  
  // Health (15%)
  const health = scoreDebt(f.debtToEquity);
  
  const total = profitability * 0.30 + growth * 0.30 + valuation * 0.25 + health * 0.15;
  return Math.round(Math.max(0, Math.min(100, total)));
};

// Detail-Breakdown fuer die UI
export const getLongTermBreakdown = (fundamentals) => {
  if (!fundamentals) return null;
  const f = fundamentals;
  
  const epsGrowth = f.epsGrowth5Y != null ? f.epsGrowth5Y : f.epsGrowthTTMYoy;
  const revGrowth = f.revenueGrowth5Y != null ? f.revenueGrowth5Y : f.revenueGrowthTTMYoy;
  
  return {
    profitability: Math.round(scoreROE(f.roe) * 0.6 + scoreMargin(f.netMargin) * 0.4),
    growth: Math.round(scoreGrowth(epsGrowth) * 0.5 + scoreGrowth(revGrowth) * 0.5),
    valuation: Math.round(scorePEG(f.peg) * 0.5 + scorePE(f.pe) * 0.5),
    health: Math.round(scoreDebt(f.debtToEquity)),
    raw: {
      roe: f.roe,
      netMargin: f.netMargin,
      epsGrowth,
      revGrowth,
      pe: f.pe,
      peg: f.peg,
      pb: f.pb,
      debtToEquity: f.debtToEquity
    }
  };
};

// Format Helpers
export const formatPct = (v) => v == null ? "—" : v.toFixed(1) + "%";
export const formatRatio = (v) => v == null ? "—" : v.toFixed(2);
