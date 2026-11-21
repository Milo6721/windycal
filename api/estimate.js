// The only server part of Windy. It holds the Gemini API key (GEMINI_API, set in
// Vercel → Project → Settings → Environment Variables) and turns one line of free
// text into structured nutrition data. The browser never sees the key.
import { createRequire } from "node:module";

const spec = createRequire(import.meta.url)("../lib/spec.json");
const MAX_CHARS = 240;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  // Only the Windy page itself may call this function.
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: "forbidden" });
  }

  const key = process.env.GEMINI_API || process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "no_key" });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const text = String((body && body.text) || "").trim();
  if (!text) return res.status(400).json({ error: "empty" });
  if (text.length > MAX_CHARS) return res.status(400).json({ error: "too_long" });

  const model = process.env.GEMINI_MODEL || spec.model;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: spec.system }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: spec.schema,
          temperature: 0.2,
          // One short line in, one small JSON object out: no thinking, for speed.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (r.status === 429) return res.status(429).json({ error: "rate_limited" });
    if (r.status === 401 || r.status === 403) return res.status(503).json({ error: "bad_key" });
    if (!r.ok) return res.status(502).json({ error: "upstream", status: r.status });

    const out = await r.json();
    const cand = out.candidates && out.candidates[0];
    if (!cand || !cand.content) return res.status(200).json({ is_food: false, items: [] }); // blocked or empty
    const data = safeParse((cand.content.parts || []).map((p) => p.text || "").join(""));
    if (!data || !Array.isArray(data.items)) return res.status(502).json({ error: "bad_output" });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ is_food: data.is_food !== false, items: data.items });
  } catch {
    return res.status(502).json({ error: "unreachable" });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
