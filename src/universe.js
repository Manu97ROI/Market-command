// universe.js
// Top 50 US-Aktien nach Market Cap (Stand 2026)
// Wird genutzt fuer Daily-Tab Auto-Scanner

export const TOP_50_US = [
  // Mega Cap Tech
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "Technology" },
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Technology" },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Technology" },
  { ticker: "AMZN", name: "Amazon.com", sector: "Consumer" },
  { ticker: "META", name: "Meta Platforms", sector: "Technology" },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Automotive" },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Technology" },
  { ticker: "ORCL", name: "Oracle Corp.", sector: "Technology" },
  { ticker: "NFLX", name: "Netflix Inc.", sector: "Communication" },
  
  // Tech / Semi
  { ticker: "AMD", name: "AMD", sector: "Technology" },
  { ticker: "CRM", name: "Salesforce", sector: "Technology" },
  { ticker: "ADBE", name: "Adobe Inc.", sector: "Technology" },
  { ticker: "PLTR", name: "Palantir", sector: "Technology" },
  { ticker: "QCOM", name: "Qualcomm", sector: "Technology" },
  { ticker: "TXN", name: "Texas Instruments", sector: "Technology" },
  { ticker: "INTC", name: "Intel Corp.", sector: "Technology" },
  { ticker: "MU", name: "Micron Technology", sector: "Technology" },
  { ticker: "ASML", name: "ASML Holding", sector: "Technology" },
  
  // Finance / Banking
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financial" },
  { ticker: "BAC", name: "Bank of America", sector: "Financial" },
  { ticker: "WFC", name: "Wells Fargo", sector: "Financial" },
  { ticker: "GS", name: "Goldman Sachs", sector: "Financial" },
  { ticker: "MS", name: "Morgan Stanley", sector: "Financial" },
  { ticker: "V", name: "Visa Inc.", sector: "Financial" },
  { ticker: "MA", name: "Mastercard", sector: "Financial" },
  
  // Healthcare
  { ticker: "LLY", name: "Eli Lilly", sector: "Healthcare" },
  { ticker: "UNH", name: "UnitedHealth", sector: "Healthcare" },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { ticker: "ABBV", name: "AbbVie", sector: "Healthcare" },
  { ticker: "MRK", name: "Merck", sector: "Healthcare" },
  { ticker: "TMO", name: "Thermo Fisher", sector: "Healthcare" },
  
  // Consumer
  { ticker: "WMT", name: "Walmart", sector: "Consumer" },
  { ticker: "PG", name: "Procter & Gamble", sector: "Consumer" },
  { ticker: "KO", name: "Coca-Cola", sector: "Consumer" },
  { ticker: "COST", name: "Costco", sector: "Consumer" },
  { ticker: "MCD", name: "McDonald's", sector: "Consumer" },
  { ticker: "HD", name: "Home Depot", sector: "Consumer" },
  { ticker: "NKE", name: "Nike", sector: "Consumer" },
  
  // Energy / Industrial
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy" },
  { ticker: "CVX", name: "Chevron", sector: "Energy" },
  { ticker: "CAT", name: "Caterpillar", sector: "Industrial" },
  { ticker: "BA", name: "Boeing", sector: "Industrial" },
  { ticker: "GE", name: "General Electric", sector: "Industrial" },
  
  // Communication / Other
  { ticker: "DIS", name: "Walt Disney", sector: "Communication" },
  { ticker: "T", name: "AT&T", sector: "Communication" },
  { ticker: "VZ", name: "Verizon", sector: "Communication" },
  
  // Hot / Momentum
  { ticker: "COIN", name: "Coinbase", sector: "Financial" },
  { ticker: "MSTR", name: "MicroStrategy", sector: "Technology" },
  { ticker: "SMCI", name: "Super Micro Computer", sector: "Technology" }
];

// Hilfsfunktion: Ticker in Top 50?
export const isInUniverse = (ticker) => TOP_50_US.some(s => s.ticker === ticker);

// Get sector for a ticker (fallback)
export const getSector = (ticker) => {
  const found = TOP_50_US.find(s => s.ticker === ticker);
  return found ? found.sector : "Unknown";
};
