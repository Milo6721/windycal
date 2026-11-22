// A short tip each morning, written by the AI from what you ate yesterday.
// It shows once a day under the heading, quietly, and goes away when you close it.
import { state, save, dayKey, totalsOf } from './app.js';
import { t, getLang, num } from './i18n.js';
import { targets } from './goal.js';
import { waterOf, waterGoal, waterOn } from './water.js';
import { aiPaused } from './estimate.js';

const SPARK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/></svg>';
let asking = false;

function yesterday() {
  const k = dayKey(-1), entries = (state.days[k] || []).filter(e => e.items?.length);
  const tot = totalsOf(entries);
  return { entries, tot, water: waterOf(k) };
}

// Windy's own tip, for when the AI cannot answer.
function ownTip(y, T) {
  const pl = getLang() === 'pl', p = Math.round(y.tot.protein), k = Math.round(y.tot.kcal);
  if (p < T.protein * 0.7) return pl ? `Wczoraj białka było ${p} g z ${T.protein} g. Dziś dorzuć coś białkowego do śniadania, np. jajka albo skyr.` : `Yesterday you had ${p} of ${T.protein} g protein. Try adding something protein-rich to breakfast today, like eggs or Greek yogurt.`;
  if (k > T.kcal * 1.1) return pl ? `Wczoraj wyszło ${num(k)} kcal, trochę ponad cel. Dziś spokojnie: lżejsza kolacja wystarczy.` : `Yesterday came to ${num(k)} kcal, a little over your goal. No stress today: a lighter dinner is plenty.`;
  if (waterOn() && y.water < waterGoal() * 0.6) return pl ? `Wczoraj ${y.water} szklanki wody. Postaw dziś szklankę obok siebie od rana.` : `Yesterday you had ${y.water} glasses of water. Keep a glass within reach from the morning today.`;
  return pl ? `Wczoraj był spokojny, zbilansowany dzień (${num(k)} kcal). Tak trzymaj.` : `Yesterday was a calm, balanced day (${num(k)} kcal). Keep it going.`;
}

export async function renderTip(view) {
  const el = document.getElementById('tip'); if (!el) return;
  const today = dayKey(0), saved = (state.tips || {})[today];
  const show = view === 'today' && new Date().getHours() >= 4 && saved?.text && !saved.dismissed;
  el.hidden = !show;
  if (show) { el.querySelector('span').textContent = saved.text; return; }
  if (view !== 'today' || saved || asking || new Date().getHours() < 4) return;
  const y = yesterday(); if (!y.entries.length) return;
  const T = targets(state.settings);
  asking = true;
  let text = '';
  if (!aiPaused() && navigator.onLine !== false) {
    try {
      const r = await fetch('/api/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ tip: { lang: getLang(), goal: { kcal: T.kcal, protein: T.protein, carbs: T.carbs, fat: T.fat, water: waterOn() ? waterGoal() : 0 },
          yesterday: { kcal: y.tot.kcal, protein: y.tot.protein, carbs: y.tot.carbs, fat: y.tot.fat, water: y.water, foods: y.entries.map(e => `${e.text} (${Math.round(totalsOf([e]).kcal)} kcal)`) } } }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.text) text = j.text;
    } catch {}
  }
  asking = false;
  state.tips = { [today]: { text: text || ownTip(y, T), ai: !!text } }; // only today's tip is kept
  save();
  renderTip(view);
  if (!el.hidden) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
}

export function initTip(getView) {
  const head = document.querySelector('.head');
  const el = document.createElement('p'); el.id = 'tip'; el.className = 'tip'; el.hidden = true;
  el.innerHTML = `<i>${SPARK}</i><span></span><button type="button" aria-label="${t('close')}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  head.append(el);
  el.querySelector('button').addEventListener('click', () => {
    const today = dayKey(0); if (state.tips?.[today]) state.tips[today].dismissed = true;
    save(); el.classList.add('bye'); setTimeout(() => { el.classList.remove('bye'); renderTip(getView()); }, 260);
  });
}
