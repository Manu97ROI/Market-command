// Vercel Serverless Function
// Routet Anfragen vom Browser durch zu Google Gemini API und versteckt den API-Key.
// Aufruf vom Frontend: POST /api/gemini mit { systemPrompt, userPrompt }

export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY ist nicht gesetzt in Vercel Environment Variables" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Nur POST erlaubt" });
  }

  const { systemPrompt, userPrompt, model = "gemini-2.0-flash" } = req.body || {};
  
  if (!userPrompt) {
    return res.status(400).json({ error: "userPrompt fehlt" });
  }

  // Gemini API Endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  // Body fuer Gemini
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    }
  };
  
  // System Prompt einbauen falls vorhanden
  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error("Gemini API error:", text);
      return res.status(response.status).json({ error: `Gemini error: ${text}` });
    }
    
    const data = await response.json();
    
    // Extrahiere den Text aus der Gemini-Response
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      return res.status(500).json({ error: "Keine Antwort von Gemini erhalten", debug: data });
    }
    
    return res.status(200).json({ text: generatedText });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
