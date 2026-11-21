// One line of free text → structured nutrition data. The key (GEMINI_API) lives in
// Vercel → Project → Settings → Environment Variables; the browser never sees it.
import { spec, guard, readBody, safeParse, gemini } from "./_gemini.js";

export default async function handler(req, res) {
  const key = guard(req, res); if (!key) return;
  const body = readBody(req);
  const text = String(body.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty" });
  if (text.length > 240) return res.status(400).json({ error: "too_long" });
  const deep = body.deep === true; // "Estimate again": let the model think before it answers

  const out = await gemini(key, spec.system + (deep ? spec.deep_extra : ""), text, {
    responseMimeType: "application/json",
    responseSchema: spec.schema,
    temperature: 0.2,
    thinkingConfig: { thinkingBudget: deep ? -1 : 0 },
  });
  if (out.error) return res.status(out.status).json({ error: out.error });
  if (!out.text) return res.status(200).json({ is_food: false, items: [] });
  const data = safeParse(out.text);
  if (!data || !Array.isArray(data.items)) return res.status(502).json({ error: "bad_output" });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ is_food: data.is_food !== false, items: data.items });
}
