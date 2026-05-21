// coingeckoClient.js
// Holt Live-Crypto-Daten direkt von CoinGecko API.
// CoinGecko Free Tier: kein API-Key noetig, ~30 Calls/Min.

const cache = new Map();
const CACHE_TTL = 60 * 1000; // 60 Sekunden (CoinGecko aendert sich langsamer als Stocks)

const cachedFetch = async (url) => {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }
  const data = await response.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
};

// Map Ticker (BTC, ETH, SOL) -> CoinGecko ID (bitcoin, ethereum, solana)
const TICKER_TO_ID = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  MATIC: "matic-network",
  ARB: "arbitrum",
  OP: "optimism",
  PEPE: "pepe",
  WIF: "dogwifcoin",
  SHIB: "shiba-inu",
  UNI: "uniswap",
  AAVE: "aave",
  LTC: "litecoin",
  ATOM: "cosmos"
};

// Live Preis + 24h Change holen
export const getCryptoQuote = async (ticker) => {
  const id = TICKER_TO_ID[ticker.toUpperCase()] || ticker.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
  
  try {
    const data = await cachedFetch(url);
    const coin = data[id];
    if (!coin) throw new Error(`Coin nicht gefunden: ${ticker}`);
    
    return {
      price: coin.usd,
      change: coin.usd_24h_change || 0,
      marketCap: coin.usd_market_cap,
      volume24h: coin.usd_24h_vol
    };
  } catch (err) {
    console.error("Crypto quote error:", err);
    throw err;
  }
};

// Mehrere Crypto-Quotes parallel
export const getMultipleCryptoQuotes = async (tickers) => {
  const ids = tickers.map(t => TICKER_TO_ID[t.toUpperCase()] || t.toLowerCase()).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  
  try {
    const data = await cachedFetch(url);
    return tickers.map(ticker => {
      const id = TICKER_TO_ID[ticker.toUpperCase()] || ticker.toLowerCase();
      const coin = data[id];
      if (!coin) return null;
      return {
        symbol: ticker,
        price: coin.usd,
        change: coin.usd_24h_change || 0
      };
    }).filter(Boolean);
  } catch (err) {
    console.error("Multi crypto error:", err);
    return [];
  }
};

// Crypto-Suche: nutzt CoinGecko Search-Endpoint
let allCoinsCache = null;
export const searchCrypto = async (query) => {
  if (!query || query.length < 1) return [];
  
  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
    const data = await cachedFetch(url);
    
    // Nur top 10 Coins zurueckgeben
    return (data.coins || []).slice(0, 10).map(c => ({
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      id: c.id,
      thumb: c.thumb,
      marketCapRank: c.market_cap_rank
    }));
  } catch (err) {
    console.error("Crypto search error:", err);
    return [];
  }
};

// Hole Detail-Info ueber einen Coin (fuer "unbekannte" Coins die ueber Suche kommen)
export const getCryptoProfile = async (id) => {
  const url = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  
  try {
    const data = await cachedFetch(url);
    return {
      ticker: data.symbol.toUpperCase(),
      name: data.name,
      price: data.market_data?.current_price?.usd,
      change: data.market_data?.price_change_percentage_24h,
      marketCap: data.market_data?.market_cap?.usd,
      volume24h: data.market_data?.total_volume?.usd,
      circulatingSupply: data.market_data?.circulating_supply,
      maxSupply: data.market_data?.max_supply,
      description: data.description?.en?.split(".")[0] // erster Satz
    };
  } catch (err) {
    console.error("Crypto profile error:", err);
    throw err;
  }
};

export const formatCryptoMarketCap = (usd) => {
  if (!usd) return "N/A";
  if (usd >= 1e12) return `${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `${(usd / 1e6).toFixed(0)}M`;
  return `${usd.toFixed(0)}`;
};

// Mark ob ein Ticker Crypto ist (für Type-Detection)
export const isCryptoTicker = (ticker) => {
  return ticker.toUpperCase() in TICKER_TO_ID;
};

export { TICKER_TO_ID };
