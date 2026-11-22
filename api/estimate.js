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
  const out = await gemini(key, deep ? spec.models_smart : spec.models_fast, spec.system + (deep ? spec.deep_extra : ""), text, {
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
  const out = await gemini(key, spec.models_smart, spec.summary_system, JSON.stringify(payload), {
    temperature: 0.6,
    thinkingConfig: { thinkingBudget: 1024 },
  });
  if (out.error) return res.status(out.status).json({ error: out.error, detail: out.detail });
  if (!out.text.trim()) return res.status(502).json({ error: "bad_output" });
  return res.status(200).json({ text: out.text.trim() });
}

// ---------- which Gemini model to use ----------
// Google retires models now and then, so instead of trusting a fixed name the function
// asks Google which models this key can use and picks the newest Flash ones.
let known = null, knownAt = 0;
async function availableModels(key) {
  if (known && Date.now() - knownAt < 6 * 3600e3) return known;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
      headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const j = await r.json();
      known = (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => String(m.name || "").replace(/^models\//, ""));
      knownAt = Date.now();
    }
  } catch {}
  return known || [];
}
const version = (name) => { const m = name.match(/^gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
const plainFlash = (name) => /^gemini-(\d+(\.\d+)?-)?flash(-lite)?(-latest)?$/.test(name); // no preview, image, audio, tts…
async function pickModels(key, smart) {
  const all = (await availableModels(key)).filter(plainFlash);
  const lite = all.filter((n) => n.includes("-lite")), full = all.filter((n) => !n.includes("-lite"));
  const byNewest = (a, b) => version(b) - version(a) || (a.includes("latest") ? 1 : -1);
  lite.sort(byNewest); full.sort(byNewest);
  const found = smart ? [...full, ...lite] : [...lite, ...full];
  return [...new Set([process.env.GEMINI_MODEL, ...found, ...(smart ? spec.models_smart : spec.models_fast)].filter(Boolean))].slice(0, 6);
}

// Newer models sometimes reject an option older ones accepted (how thinking is set,
// or the schema format). When that happens the same model is asked again, more simply.
function simpler(config, detail, step) {
  const c = { ...config };
  if (step === 0 && c.thinkingConfig) { delete c.thinkingConfig; return c; }
  if (step <= 1 && c.responseSchema) {
    c.responseJsonSchema = lower(c.responseSchema); delete c.responseSchema; delete c.thinkingConfig; return c;
  }
  return null;
}
const lower = (n) => Array.isArray(n) ? n.map(lower) : n && typeof n === "object"
  ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, k === "type" && typeof v === "string" ? v.toLowerCase() : lower(v)])) : n;

async function gemini(key, list, system, userText, generationConfig) {
  const smart = list === spec.models_smart;
  const models = await pickModels(key, smart);
  const errors = [];
  let limited = null;
  const t0 = Date.now();
  for (const model of models) {
    let config = model.startsWith("gemini-2.0") ? { ...generationConfig, thinkingConfig: undefined } : generationConfig;
    for (let step = 0; step < 3 && Date.now() - t0 < 22000; step++) {
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
          signal: AbortSignal.timeout(15000),
        });
      } catch { errors.push(`${model}: no answer`); break; }
      if (r.ok) {
        const out = await r.json();
        const cand = out.candidates && out.candidates[0];
        if (!cand || !cand.content) return { text: "" };
        return { text: (cand.content.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("") };
      }
      const raw = await r.text().catch(() => "");
      let detail = "";
      try { detail = String(JSON.parse(raw).error.message || ""); } catch { detail = raw; }
      detail = detail.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").split("\n")[0].slice(0, 160);
      console.error("Gemini", model, r.status, detail);
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key/i.test(detail))) return { error: "bad_key", status: 503, detail };
      if (r.status === 400) { const next = simpler(config, detail, step); if (next) { config = next; continue; } }
      if (r.status === 429) limited = { error: "rate_limited", status: 429, detail: `${model}: ${detail}` };
      errors.push(`${model}: ${r.status} ${detail}`);
      break; // try the next model
    }
  }
  if (limited && errors.every((e) => / 429 | 404 /.test(e))) return limited;
  return { error: "upstream", status: 502, detail: (errors.find((e) => !/ 404 /.test(e)) || errors[0] || "no model answered").slice(0, 220) };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
