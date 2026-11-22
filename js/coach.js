// The coach lives one swipe to the right of your log. It knows today's meals, your goal,
// what's left and your last few days, and gives two or three concrete, friendly sentences.
//   Phone: swipe right on the log (the gesture locks to horizontal or vertical after a few
//          pixels, so scrolling never fights it); swipe left on the coach to go back.
//   Desktop: a two-finger trackpad swipe, the C key, or the Coach button in the header.
import { state, keyOf, totalsOf, curKey } from './app.js';
import { t, num, getLang, longDate } from './i18n.js';
import { targets } from './goal.js';
import { waterOf, waterOn, waterGoal, ml } from './water.js';
import { aiPaused } from './estimate.js';
import { Spring, sfx } from './fx.js';

const SPARK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 14c.3 2.3 1.2 3.2 3.5 3.5-2.3.3-3.2 1.2-3.5 3.5-.3-2.3-1.2-3.2-3.5-3.5 2.3-.3 3.2-1.2 3.5-3.5z" opacity=".55"/></svg>';
const KEY = 'windy.coachday.v1';
let el, main, spring, open = false, p = 0, enabled = () => true, cache = {}, asking = 0;
try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
export const coachOpen = () => open;

function paint(x) {
  p = x;
  const w = innerWidth, q = Math.max(0, Math.min(1, x));
  el.style.transform = `translateX(${(x - 1) * w}px)`;
  el.style.visibility = x > 0.001 ? 'visible' : 'hidden';
  main.style.transform = `translateX(${q * w * 0.18}px)`;
  main.style.opacity = String(1 - q * 0.55);
}

// ---------- what the coach sees ----------
function today() {
  const k = curKey(), entries = (state.days[k] || []).filter(e => e.items?.length);
  const tot = totalsOf(entries); for (const f in tot) tot[f] = Math.round(tot[f]);
  return { k, entries, tot, water: waterOf(k) };
}
function payload() {
  const T = targets(state.settings), days = [];
  for (let off = -3; off <= 0; off++) {
    const d = new Date(); d.setDate(d.getDate() + off);
    const k = off === 0 ? curKey() : keyOf(d), entries = (state.days[k] || []).filter(e => e.items?.length);
    if (!entries.length && off) continue;
    const tot = totalsOf(entries);
    days.push({ date: k, kcal: Math.round(tot.kcal), protein: Math.round(tot.protein), carbs: Math.round(tot.carbs), fat: Math.round(tot.fat),
      water_glasses: waterOn() ? waterOf(k) : undefined,
      foods: entries.map(e => { const h = new Date(e.ts).getHours(); return `${e.text} (${Math.round(totalsOf([e]).kcal)} kcal, ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'})`; }) });
  }
  const now = new Date();
  return { scope: 'day', style: 'today', lang: getLang(), now: now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
    goal: { kcal: T.kcal, protein: T.protein, carbs: T.carbs, fat: T.fat }, days };
}
// Windy's own advice, from the numbers, for when the AI cannot answer.
function own() {
  const T = targets(state.settings), d = today(), pl = getLang() === 'pl';
  const left = T.kcal - d.tot.kcal, pLeft = T.protein - d.tot.protein, h = new Date().getHours();
  if (!d.entries.length) return pl ? `Jeszcze nic dziś nie zapisałeś. Na start: ${h < 11 ? 'śniadanie z białkiem, np. jajka albo skyr' : 'posiłek z białkiem i warzywami'}.` : `Nothing logged yet today. A good start: ${h < 11 ? 'a protein breakfast, like eggs or Greek yogurt' : 'a meal with protein and vegetables'}.`;
  const parts = [];
  if (pLeft > 15) parts.push(pl ? `Brakuje Ci ${Math.round(pLeft)} g białka. Skyr, twaróg albo wrap z kurczakiem to zamkną.` : `You're ${Math.round(pLeft)} g short on protein. Greek yogurt or a chicken wrap would close it.`);
  if (left > 0) parts.push(pl ? `Zostało ${num(left)} kcal na dziś.` : `You have ${num(left)} kcal left for today.`);
  else parts.push(pl ? `Jesteś ${num(-left)} kcal ponad cel. Lekka kolacja wystarczy.` : `You're ${num(-left)} kcal over your goal. A light dinner is plenty.`);
  if (waterOn() && d.water < waterGoal() * 0.5 && h >= 13) parts.push(pl ? 'Napij się też wody.' : 'Have a glass of water too.');
  return parts.join(' ');
}

function render() {
  const T = targets(state.settings), d = today(), left = T.kcal - d.tot.kcal, pLeft = Math.max(0, T.protein - d.tot.protein);
  const dt = new Date(); if (curKey() !== keyOf(dt)) dt.setDate(dt.getDate() + (curKey() > keyOf(dt) ? 1 : -1));
  el.querySelector('.co-date').textContent = longDate(dt);
  el.querySelector('.co-stats').innerHTML = `
    <div><b>${num(Math.abs(left))}</b><span>${left >= 0 ? t('coachLeftK') : t('ringOver')}</span></div>
    <div><b>${num(pLeft)} g</b><span>${t('coachLeftP')}</span></div>
    <div><b>${num(d.tot.kcal)}</b><span>${t('coachEaten')}</span></div>
    ${waterOn() ? `<div><b>${ml(d.water)}</b><span>${t('water')}</span></div>` : ''}`;
  const pl = payload(), key = JSON.stringify(pl.days) + pl.lang + JSON.stringify(pl.goal);
  const box = el.querySelector('.co-card'), txt = el.querySelector('.co-text');
  if (cache.key === key && cache.text) { txt.textContent = cache.text; box.classList.remove('thinking'); return; }
  txt.textContent = own(); box.classList.add('thinking');
  const run = ++asking;
  (async () => {
    let text = '';
    if (!aiPaused() && navigator.onLine !== false) {
      try {
        const r = await fetch('/api/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(22000), body: JSON.stringify({ summary: pl }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.text) text = j.text;
      } catch {}
    }
    if (run !== asking) return;
    box.classList.remove('thinking');
    if (!text) return;
    cache = { key, text }; try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
    txt.classList.remove('in'); void txt.offsetWidth; txt.textContent = text; txt.classList.add('in');
  })();
}

export function openCoach() { if (!enabled()) return; if (p < 0.01) render(); el.classList.add('live'); spring.set(1); open = true; sfx('pop'); }
export function closeCoach() { spring.set(0); open = false; }
export const toggleCoach = () => (open ? closeCoach() : openCoach());

export function initCoach(isEnabled) {
  enabled = isEnabled;
  main = document.getElementById('scroll');
  el = document.createElement('section'); el.className = 'coachpage'; el.id = 'coachpage'; el.setAttribute('aria-label', t('coach'));
  el.innerHTML = `<div class="co-in">
      <div class="co-head"><span class="co-spark">${SPARK}</span><h2>${t('coach')}</h2></div>
      <p class="co-date"></p>
      <div class="co-card"><p class="co-text"></p><i class="co-bar"></i></div>
      <div class="co-stats"></div>
      <p class="co-hint">← ${t('coachSwipe')}</p>
    </div>`;
  document.querySelector('.app').append(el);
  spring = new Spring(x => { paint(x); if (x <= 0.001 && !open) { el.classList.remove('live'); main.style.transform = ''; main.style.opacity = ''; } }, { stiffness: 200, damping: 24 });
  spring.jump(0);

  // touch: lock the direction after a few pixels; horizontal moves the coach, vertical scrolls
  let s = null;
  const down = (ev, from) => {
    if (ev.pointerType === 'mouse' || !enabled()) return;
    if (from === 'main' && (open || ev.target.closest('.row:not(.draft), .bar, .pan, input, button'))) return;
    s = { x0: ev.clientX, y0: ev.clientY, p0: p, lock: null, from, t: [] };
  };
  const move = ev => {
    if (!s) return;
    const dx = ev.clientX - s.x0, dy = ev.clientY - s.y0;
    if (!s.lock) {
      if (Math.hypot(dx, dy) < 9) return;
      s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
      if (s.lock === 'y' || (s.from === 'main' && dx < 0) || (s.from === 'coach' && dx > 0)) { s = null; return; }
      el.classList.add('live');
      if (s.p0 < 0.01) render();
    }
    const x = Math.max(0, Math.min(1.04, s.p0 + dx / innerWidth));
    spring.jump(x); s.t.push([performance.now(), x]); if (s.t.length > 5) s.t.shift();
  };
  const up = () => {
    if (!s) return; const d = s; s = null; if (d.lock !== 'x') return;
    const a = d.t[0], b = d.t[d.t.length - 1], v = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) * 1000 : 0;
    const target = p + v * 0.15 > 0.5 ? 1 : 0;
    spring.v = Math.max(-5, Math.min(5, v)); spring.set(target); open = target === 1;
  };
  main.addEventListener('pointerdown', ev => down(ev, 'main'));
  el.addEventListener('pointerdown', ev => down(ev, 'coach'));
  for (const n of [main, el]) { n.addEventListener('pointermove', move); n.addEventListener('pointerup', up); n.addEventListener('pointercancel', () => { s = null; if (p > 0 && p < 1) spring.set(open ? 1 : 0); }); }

  // trackpad: a two-finger swipe sideways
  let acc = 0, accT = 0;
  addEventListener('wheel', ev => {
    if (!enabled() || Math.abs(ev.deltaX) < Math.abs(ev.deltaY) * 1.5) return;
    if (ev.target.closest('.dv, .pan, .sheet, .ctx, .weekly')) return;
    const now = performance.now(); if (now - accT > 300) acc = 0; accT = now;
    acc += ev.deltaX;
    if (!open && acc < -70) { acc = -1e9; openCoach(); }
    else if (open && acc > 70) { acc = 1e9; closeCoach(); }
  }, { passive: true });
  addEventListener('resize', () => paint(p));
}
