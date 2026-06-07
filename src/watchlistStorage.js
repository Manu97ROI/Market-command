// watchlistStorage.js
// Persistente Speicherung der User-Watchlist im Browser LocalStorage
// Format: Array von Tickers, z.B. ["AAPL", "NVDA", "BTC"]

const STORAGE_KEY = "market-command-watchlist";

export const loadWatchlist = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Watchlist laden fehlgeschlagen:", err);
    return [];
  }
};

export const saveWatchlist = (tickers) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
    return true;
  } catch (err) {
    console.error("Watchlist speichern fehlgeschlagen:", err);
    return false;
  }
};

export const addToWatchlist = (ticker) => {
  const current = loadWatchlist();
  if (current.includes(ticker)) return current;
  const updated = [...current, ticker];
  saveWatchlist(updated);
  return updated;
};

export const removeFromWatchlist = (ticker) => {
  const current = loadWatchlist();
  const updated = current.filter(t => t !== ticker);
  saveWatchlist(updated);
  return updated;
};

export const isInWatchlist = (ticker) => {
  return loadWatchlist().includes(ticker);
};
