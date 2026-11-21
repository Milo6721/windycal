// Free text → nutrition. Order: what this device already knows, then the AI, then the offline table.
import { lookup } from './foods.js';

const KEY = 'windy.cache.v1';
let cache = {};
try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}

const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
function remember(k, items) {
  cache[k] = { items, t: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 600) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, 100).forEach(x => delete cache[x]);
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
}

const clean = it => ({
  name: String(it.name || ''), portion: String(it.portion || ''),
  grams: Math.max(0, +it.grams || 0), calories: Math.max(0, +it.calories || 0),
  protein: Math.max(0, +it.protein || 0), carbs: Math.max(0, +it.carbs || 0), fat: Math.max(0, +it.fat || 0),
  confidence: ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'medium',
});

// source: 'cache' | 'ai' (a real answer), 'table' (rough), 'none' (nothing yet, retry later)
export async function getEstimate(text, lang, fresh = false) {
  const k = norm(text);
  if (!fresh && cache[k]) return { items: cache[k].items, source: 'cache', notFood: !cache[k].items.length };

  let reason = 'offline';
  if (navigator.onLine !== false) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch('/api/estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal: ctl.signal,
      });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.items)) {
          const items = j.is_food === false ? [] : j.items.map(clean);
          remember(k, items);
          return { items, source: 'ai', notFood: !items.length };
        }
        reason = 'bad_output';
      } else reason = (await r.json().catch(() => ({}))).error || 'upstream';
    } catch { reason = 'unreachable'; } finally { clearTimeout(timer); }
  }

  const items = lookup(text, lang);
  return items.length ? { items, source: 'table', reason } : { items: [], source: 'none', reason };
}
