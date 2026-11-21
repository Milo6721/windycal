// "Summarize my day / week": a few kind sentences about how the person is eating.
import { spec, guard, readBody, gemini } from "./_gemini.js";

const n = (v) => Math.max(0, Math.min(100000, Math.round(+v || 0)));

export default async function handler(req, res) {
  const key = guard(req, res); if (!key) return;
  const body = readBody(req);
  const days = Array.isArray(body.days) ? body.days.slice(0, 7) : [];
  if (!days.length) return res.status(400).json({ error: "empty" });
  const g = body.goal || {};
  const payload = {
    scope: body.scope === "week" ? "week" : "day",
    language: body.lang === "pl" ? "Polish" : "American English",
    goal: { kcal: n(g.kcal), protein: n(g.protein), carbs: n(g.carbs), fat: n(g.fat) },
    days: days.map((d) => ({
      date: String(d.date || "").slice(0, 10),
      kcal: n(d.kcal), protein: n(d.protein), carbs: n(d.carbs), fat: n(d.fat),
      foods: (Array.isArray(d.foods) ? d.foods : []).slice(0, 30).map((f) => String(f).slice(0, 120)),
    })),
  };
  const out = await gemini(key, spec.summary_system, JSON.stringify(payload), { temperature: 0.6 });
  if (out.error) return res.status(out.status).json({ error: out.error });
  if (!out.text.trim()) return res.status(502).json({ error: "bad_output" });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ text: out.text.trim() });
}
