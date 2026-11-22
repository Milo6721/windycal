// The only server part of Windy. It holds the Gemini API key (GEMINI_API, set in
// Vercel → Project → Settings → Environment Variables); the browser never sees it.
// One function, two jobs:
//   { text }                     → nutrition estimate for one line ({ text, deep: true } thinks longer)
//   { summary: { scope, ... } }  → a few kind sentences about how you are eating
import { createRequire } from "node:module";

const spec = createRequire(import.meta.url)("../lib/spec.json");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const origin = req.headers.origin;
  if (origin) { // only the Windy page itself may call this function
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: "forbidden" });
  }
  const key = process.env.GEMINI_API || process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "no_key" });
  const body = (typeof req.body === "string" ? safeParse(req.body) : req.body) || {};
  res.setHeader("Cache-Control", "no-store");
  return body.summary ? summary(key, body.summary, res) : estimate(key, body, res);
}

async function estimate(key, body, res) {
  const text = String(body.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty" });
  if (text.length > 240) return res.status(400).json({ error: "too_long" });
  const deep = body.deep === true;
  const out = await gemini(key, spec.system + (deep ? spec.deep_extra : ""), text, {
    responseMimeType: "application/json",
    responseSchema: spec.schema,
    temperature: 0.2,
    thinkingConfig: { thinkingBudget: deep ? 2048 : 0 },
  });
  if (out.error) return res.status(out.status).json({ error: out.error, detail: out.detail });
  if (!out.text) return res.status(200).json({ is_food: false, items: [] });
  const data = safeParse(out.text);
  if (!data || !Array.isArray(data.items)) return res.status(502).json({ error: "bad_output" });
  return res.status(200).json({ is_food: data.is_food !== false, items: data.items });
}

const n = (v) => Math.max(0, Math.min(100000, Math.round(+v || 0)));
async function summary(key, s, res) {
  const days = Array.isArray(s.days) ? s.days.slice(0, 31) : [];
  if (!days.length) return res.status(400).json({ error: "empty" });
  const g = s.goal || {};
  const payload = {
    scope: s.scope === "week" ? "week" : "day",
    language: s.lang === "pl" ? "Polish" : "American English",
    goal: { kcal: n(g.kcal), protein: n(g.protein), carbs: n(g.carbs), fat: n(g.fat) },
    days: days.map((d) => ({
      date: String(d.date || "").slice(0, 10),
      kcal: n(d.kcal), protein: n(d.protein), carbs: n(d.carbs), fat: n(d.fat),
      foods: (Array.isArray(d.foods) ? d.foods : []).slice(0, 30).map((f) => String(f).slice(0, 120)),
    })),
  };
  const out = await gemini(key, spec.summary_system, JSON.stringify(payload), {
    temperature: 0.6,
    thinkingConfig: { thinkingBudget: 1024 },
  });
  if (out.error) return res.status(out.status).json({ error: out.error, detail: out.detail });
  if (!out.text.trim()) return res.status(502).json({ error: "bad_output" });
  return res.status(200).json({ text: out.text.trim() });
}

// Tries the chosen model, retries once when Gemini is busy, and falls back to other
// Flash models if this one is unknown. Errors carry Gemini's own message so they can be read.
const FALLBACK = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
async function gemini(key, system, userText, generationConfig) {
  const models = [...new Set([process.env.GEMINI_MODEL, spec.model, ...FALLBACK].filter(Boolean))];
  let last = { error: "upstream", status: 502 };
  for (const model of models) {
    const config = model.startsWith("gemini-2.0") ? { ...generationConfig, thinkingConfig: undefined } : generationConfig;
    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: config,
          }),
        });
      } catch { last = { error: "unreachable", status: 502 }; continue; }
      if (r.ok) {
        const out = await r.json();
        const cand = out.candidates && out.candidates[0];
        if (!cand || !cand.content) return { text: "" };
        return { text: (cand.content.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("") };
      }
      const raw = await r.text().catch(() => "");
      let detail = "";
      try { detail = String(JSON.parse(raw).error.message || ""); } catch { detail = raw; }
      detail = detail.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").slice(0, 300);
      console.error("Gemini", model, r.status, detail);
      if (r.status === 429) return { error: "rate_limited", status: 429, detail };
      if (r.status === 401 || r.status === 403 || /api key/i.test(detail)) return { error: "bad_key", status: 503, detail };
      last = { error: "upstream", status: 502, detail: `${model}: ${r.status} ${detail}` };
      if (r.status >= 500) { await new Promise((ok) => setTimeout(ok, 700)); continue; } // busy: try again once
      break; // 400 or 404 for this model: try the next one
    }
  }
  return last;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
