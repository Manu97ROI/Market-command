// /api/auth-check.js
// Verifiziert ob das eingegebene Passwort mit dem in Vercel gespeicherten uebereinstimmt.
// Wird vom Login-Screen aufgerufen.

export default async function handler(req, res) {
  const expectedPassword = process.env.APP_PASSWORD;
  
  if (!expectedPassword) {
    return res.status(500).json({ error: "APP_PASSWORD ist nicht gesetzt in Vercel" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Nur POST erlaubt" });
  }

  const { password } = req.body || {};
  
  if (!password) {
    return res.status(400).json({ error: "Passwort fehlt" });
  }

  // Constant-time comparison um Timing-Angriffe zu vermeiden
  const provided = String(password);
  const expected = String(expectedPassword);
  
  if (provided.length !== expected.length) {
    return res.status(401).json({ error: "Falsches Passwort" });
  }
  
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  
  if (mismatch !== 0) {
    return res.status(401).json({ error: "Falsches Passwort" });
  }
  
  // Erfolg: gebe ein Token zurueck (= das Passwort selbst, verschluesselt durch HTTPS)
  // Wird im Browser localStorage gespeichert
  return res.status(200).json({ success: true, token: expected });
}
