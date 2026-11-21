// Shared by the two functions. Files starting with "_" are not routes on Vercel.
import { createRequire } from "node:module";

export const spec = createRequire(import.meta.url)("../lib/spec.json");

// Checks the caller and the key. Returns the key, or null after answering.
export function guard(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return null; }
  const origin = req.headers.origin;
  if (origin) { // only the Windy page itself may call these functions
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) { res.status(403).json({ error: "forbidden" }); return null; }
  }
  const key = process.env.GEMINI_API || process.env.GEMINI_API_KEY;
  if (!key) { res.status(503).json({ error: "no_key" }); return null; }
  return key;
}

export const readBody = (req) => (typeof req.body === "string" ? safeParse(req.body) : req.body) || {};
export function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// One call to Gemini. Returns { error, status } or { text }.
export async function gemini(key, system, userText, generationConfig) {
  const model = process.env.GEMINI_MODEL || spec.model;
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig,
      }),
    });
  } catch { return { error: "unreachable", status: 502 }; }
  if (r.status === 429) return { error: "rate_limited", status: 429 };
  if (r.status === 401 || r.status === 403) return { error: "bad_key", status: 503 };
  if (!r.ok) return { error: "upstream", status: 502 };
  const out = await r.json();
  const cand = out.candidates && out.candidates[0];
  if (!cand || !cand.content) return { text: "" }; // blocked or empty
  return { text: (cand.content.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("") };
}
