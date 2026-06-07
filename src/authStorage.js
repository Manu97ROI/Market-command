// authStorage.js
// Speichert und verwaltet das Auth-Token im Browser LocalStorage

const TOKEN_KEY = "market-command-auth-token";

export const getAuthToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    return null;
  }
};

export const saveAuthToken = (token) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch (err) {
    return false;
  }
};

export const clearAuthToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch (err) {
    return false;
  }
};

// Verifiziere Passwort gegen Server und speichere Token bei Erfolg
export const login = async (password) => {
  try {
    const response = await fetch("/api/auth-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data.error || "Login fehlgeschlagen" };
    }
    
    const data = await response.json();
    if (data.success && data.token) {
      saveAuthToken(data.token);
      return { success: true };
    }
    return { success: false, error: "Unbekannter Fehler" };
  } catch (err) {
    return { success: false, error: "Netzwerk-Fehler: " + err.message };
  }
};
