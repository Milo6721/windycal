// Weekly: a calendar of one week at a time. Each day shows its total, a small ring against the
// goal, and the meals you wrote, like the lines on Today. Arrows move between weeks.
// Below: the week's averages, a short note from the AI coach about your habits, and the chosen
// day in full (swipe a meal to the left to delete it), with a one-line AI note for that day.
import { state, keyOf, totalsOf } from './app.js';
import { t, num, locale, longDate, getLang } from './i18n.js';
import { targets } from './goal.js';
import { waterOf, waterOn, waterGoal, glassSVG } from './water.js';
import { aiPaused } from './estimate.js';
import { icon, MACROS } from './icons.js';

const SPARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 14c.3 2.3 1.2 3.2 3.5 3.5-2.3.3-3.2 1.2-3.5 3.5-.3-2.3-1.2-3.2-3.5-3.5 2.3-.3 3.2-1.2 3.5-3.5z" opacity=".55"/></svg>';
const AI_KEY = 'windy.coach.v1';
let weekOff = 0, sel = null, root = null, coachT = 0, noteT = 0;
let cache = {};
try { cache = JSON.parse(localStorage.getItem(AI_KEY) || '{}'); } catch {}
const keep = () => {
  const keys = Object.keys(cache); if (keys.length > 40) keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - 40).forEach(k => delete cache[k]);
  try { localStorage.setItem(AI_KEY, JSON.stringify(cache)); } catch {}
};

// The week runs Monday to Sunday.
function weekDays(off) {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const start = new Date(now), first = 1;
  start.setDate(now.getDate() - ((now.getDay() - first + 7) % 7) + off * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = keyOf(d), entries = (state.days[key] || []).filter(e => e.text);
    const tot = totalsOf(entries); for (const k in tot) tot[k] = Math.round(tot[k]);
    return { key, d, entries, tot, water: waterOf(key) };
  });
}
const sameDay = (a, b) => keyOf(a) === keyOf(b);
const rangeLabel = days => {
  const a = days[0].d, b = days[6].d, o = { month: 'short', day: 'numeric' };
  return a.getMonth() === b.getMonth()
    ? `${a.toLocaleDateString(locale(), { month: 'short' })} ${a.getDate()}–${b.getDate()}`
    : `${a.toLocaleDateString(locale(), o)} – ${b.toLocaleDateString(locale(), o)}`;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderWeekly(el) {
  root = el;
  const T = targets(state.settings), days = weekDays(weekOff), today = new Date();
  if (!sel || !days.some(x => x.key === sel)) sel = (days.find(x => sameDay(x.d, today)) || days.find(x => x.entries.length) || days[0]).key;
  const past = days.filter(x => x.d <= today || sameDay(x.d, today)); // planned days ahead don't count yet

  // a ring for each day: how far toward the goal, split into protein, carbs and fat by their calories
  const R = 15, C = 2 * Math.PI * R;
  const donut = x => {
    const kc = [x.tot.protein * 4, x.tot.carbs * 4, x.tot.fat * 9], sum = kc.reduce((a, b) => a + b, 0);
    const span = C * Math.min(x.tot.kcal / T.kcal, 1);
    let at = 0;
    const arcs = sum ? kc.map((v, i) => {
      const len = Math.max(0, (v / sum) * span - (span < C ? 0 : 1.6) - 1.4);
      const a = `<circle class="dn-${MACROS[i]}" cx="18" cy="18" r="${R}" stroke-dasharray="${len.toFixed(2)} ${C}" stroke-dashoffset="${(-at).toFixed(2)}"/>`;
      at += (v / sum) * span; return len > .5 ? a : '';
    }).join('') : '';
    return `<svg class="donut" viewBox="0 0 36 36"><circle class="dn-bg" cx="18" cy="18" r="${R}"/>${arcs}</svg>`;
  };
  const litres = n => n * 250 >= 1000 ? (n * 0.25).toLocaleString(locale(), { maximumFractionDigits: 2 }) + ' l' : n * 250 + ' ml';

  el.innerHTML = `
    <div class="coach" id="coach">
      <div class="coach-h"><span class="coach-ic">${SPARK}</span><b>${t('coachTitle')}</b><button type="button" class="coach-re" aria-label="${t('tryAgain')}" title="${t('tryAgain')}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/></svg></button></div>
      <p class="coach-t"></p>
    </div>

    <div class="wk-nav">
      <button type="button" class="wk-arrow" data-go="-1" aria-label="${t('prevWeek')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="wk-range"><b>${rangeLabel(days)}</b><span>${weekOff === 0 ? t('thisWeekShort') : weekOff === -1 ? t('lastWeek') : days[0].d.getFullYear()}</span></div>
      <button type="button" class="wk-arrow" data-go="1" aria-label="${t('nextWeek')}" ${weekOff >= 1 ? 'disabled' : ''}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
      ${weekOff !== 0 ? `<button type="button" class="wk-now" data-go="now">${t('thisWeekShort')}</button>` : ''}
    </div>
    <div class="cal">${days.map((x, i) => {
      const isToday = sameDay(x.d, today), future = x.d > today && !isToday, over = x.tot.kcal > T.kcal;
      return `<button type="button" class="cal-d ${isToday ? 'today' : ''} ${future ? 'future' : ''} ${x.key === sel ? 'sel' : ''} ${over ? 'over' : ''} ${x.tot.kcal ? '' : 'none'}" data-k="${x.key}" style="--i:${i}">
        <span class="cal-h"><span class="cal-wd">${x.d.toLocaleDateString(locale(), { weekday: 'short' })}</span><span class="cal-n">${x.d.getDate()}</span></span>
        <span class="cal-ring">${donut(x)}<span class="cal-k"><b>${x.tot.kcal ? num(x.tot.kcal) : '–'}</b>${x.tot.kcal ? '<i>kcal</i>' : ''}</span></span>
        <span class="cal-m">${MACROS.map(k => `<span class="m-${k}"><i></i>${x.tot[k]} g</span>`).join('')}</span>
        ${waterOn() ? `<span class="cal-w ${x.water ? '' : 'dry'}">${glassSVG(Math.min(x.water / waterGoal(), 1))}<span>${x.water ? litres(x.water) : '–'}</span></span>` : ''}
      </button>`;
    }).join('')}</div>

    <div class="wk-day" id="wkday"></div>`;

  el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    weekOff = b.dataset.go === 'now' ? 0 : Math.min(1, weekOff + +b.dataset.go); sel = null;
    el.classList.remove('wk-slide-l', 'wk-slide-r'); void el.offsetWidth;
    el.classList.add(b.dataset.go === '-1' ? 'wk-slide-r' : 'wk-slide-l');
    renderWeekly(el);
  }));
  el.querySelectorAll('.cal-d').forEach(c => c.addEventListener('click', () => { sel = c.dataset.k; el.querySelectorAll('.cal-d').forEach(x => x.classList.toggle('sel', x === c)); pickDay(days.find(x => x.key === sel), T, true); }));
  el.querySelector('.coach-re').addEventListener('click', () => askCoach(past, T, true));
  pickDay(days.find(x => x.key === sel), T, false);
  askCoach(past, T, false);
}

// ---------- the chosen day ----------
function pickDay(x, T, animate) {
  const box = root.querySelector('#wkday'); if (!box) return;
  box.innerHTML = `<h3>${longDate(x.d)}<span>${x.tot.kcal > 0 ? `${num(x.tot.kcal)} / ${num(T.kcal)} kcal` : ''}</span></h3>
    <p class="wk-note" hidden></p>`;
  if (!x.entries.length) box.insertAdjacentHTML('beforeend', `<p class="wk-empty">${t('noEntries')}</p>`);
  // grouped like Today: planned first, then morning, afternoon, evening
  const when = e => { if (e.planned) return 'plannedGroup'; const h = new Date(e.ts).getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; };
  const order = ['plannedGroup', 'morning', 'afternoon', 'evening'];
  for (const g of order) {
    const group = x.entries.filter(e => when(e) === g); if (!group.length) continue;
    const kc = group.reduce((s, e) => s + totalsOf([e]).kcal, 0);
    box.insertAdjacentHTML('beforeend', `<div class="divider wk-div"><span>${t(g)}</span><em>${num(kc)} kcal</em></div>`);
    for (const e of group) {
      const row = document.createElement('div'); row.className = 'wk-item'; row.dataset.id = e.id;
      const a = document.createElement('span'), b = document.createElement('span');
      a.textContent = e.text; b.textContent = e.items?.length ? `${num(totalsOf([e]).kcal)} kcal` : '';
      row.append(a, b); box.append(row);
    }
  }
  if (animate) { box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap'); }
  askNote(x, T);
}

// ---------- AI: the coach for the week, a note for the day ----------
const payloadOf = (days, T) => ({
  lang: getLang(), goal: { kcal: T.kcal, protein: T.protein, carbs: T.carbs, fat: T.fat },
  days: days.filter(x => x.entries.length).map(x => ({
    date: `${x.key} (${x.d.toLocaleDateString('en-US', { weekday: 'long' })})`, kcal: x.tot.kcal, protein: x.tot.protein, carbs: x.tot.carbs, fat: x.tot.fat,
    water_glasses: waterOn() ? x.water : undefined,
    foods: x.entries.map(e => { const h = new Date(e.ts).getHours(); return `${e.text} (${Math.round(totalsOf([e]).kcal)} kcal, ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'})`; }),
  })),
});
async function ask(style, payload) {
  if (aiPaused() || navigator.onLine === false) return '';
  try {
    const r = await fetch('/api/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(22000),
      body: JSON.stringify({ summary: { ...payload, scope: style === 'coach' ? 'week' : 'day', style } }) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.text ? j.text : '';
  } catch { return ''; }
}
function show(p, text, typing) {
  p.hidden = false;
  if (!typing) { p.textContent = text; return; }
  p.textContent = ''; let i = 0;
  const step = () => { if (!p.isConnected) return; i = Math.min(text.length, i + 3); p.textContent = text.slice(0, i); if (i < text.length) requestAnimationFrame(step); };
  step();
}

// Windy's own words when the AI is not available.
function ownCoach(days, T) {
  const d = days.filter(x => x.entries.length), pl = getLang() === 'pl';
  if (!d.length) return t('coachEmpty');
  const a = Math.round(d.reduce((s, x) => s + x.tot.kcal, 0) / d.length), p = Math.round(d.reduce((s, x) => s + x.tot.protein, 0) / d.length);
  const lowP = p < T.protein * 0.8, w = waterOn() ? Math.round(d.reduce((s, x) => s + x.water, 0) / d.length) : null;
  return pl
    ? `${d.length} ${d.length === 1 ? 'zapisany dzień' : 'zapisane dni'}, średnio ${num(a)} z ${num(T.kcal)} kcal. ${lowP ? `Białka średnio ${p} g z ${T.protein} g: dodaj coś białkowego do śniadania i kolacji.` : 'Białko trzymasz dobrze.'}${w != null && w < waterGoal() * 0.7 ? ' Pij trochę więcej wody w ciągu dnia.' : ''}`
    : `${d.length} logged ${d.length === 1 ? 'day' : 'days'}, averaging ${num(a)} of ${num(T.kcal)} kcal. ${lowP ? `Protein averaged ${p} of ${T.protein} g: add something protein-rich to breakfast and dinner.` : 'Your protein is on track.'}${w != null && w < waterGoal() * 0.7 ? ' Try to drink a bit more water through the day.' : ''}`;
}

function askCoach(days, T, force) {
  const p = root.querySelector('.coach-t'), box = root.querySelector('#coach'); if (!p) return;
  const payload = payloadOf(days, T), key = 'c:' + JSON.stringify(payload);
  if (!payload.days.length) { box.classList.remove('thinking'); show(p, t('coachEmpty'), false); return; }
  if (!force && cache[key]) { box.classList.remove('thinking'); show(p, cache[key].text, false); return; }
  show(p, ownCoach(days, T), false); box.classList.add('thinking');
  clearTimeout(coachT); // wait a moment, so quick edits do not each ask the AI
  coachT = setTimeout(async () => {
    const text = await ask('coach', payload);
    if (!p.isConnected) return;
    box.classList.remove('thinking');
    if (text) { cache[key] = { text, at: Date.now() }; keep(); show(p, text, true); }
  }, force ? 0 : 900);
}

// Windy's own short read of one day, when the AI is not available.
function ownNote(x, T) {
  const pl = getLang() === 'pl', k = x.tot.kcal, pct = Math.round((k / T.kcal) * 100), p = x.tot.protein;
  const top = x.entries.slice().sort((a, b) => totalsOf([b]).kcal - totalsOf([a]).kcal)[0];
  const tip = p < T.protein * 0.7 ? (pl ? ` Białka ${p} z ${T.protein} g, więc na podobny dzień dodaj coś białkowego.` : ` Protein was ${p} of ${T.protein} g, so add something protein-rich on a day like this.`)
    : k > T.kcal * 1.1 ? (pl ? ' Trochę ponad cel; lżejsza kolacja to wyrówna.' : ' A bit over the goal; a lighter dinner evens it out.') : (pl ? ' Dobrze zbilansowany dzień.' : ' A well-balanced day.');
  return pl ? `${num(k)} kcal, ${pct}% celu. Najwięcej dało: ${top.text}.${tip}` : `${num(k)} kcal, ${pct}% of your goal. The biggest part was ${top.text}.${tip}`;
}

function askNote(x, T) {
  const p = root.querySelector('.wk-note'); if (!p || !x.entries.length) return;
  const payload = payloadOf([x], T), key = 'n:' + JSON.stringify(payload);
  if (cache[key]) { show(p, cache[key].text, false); return; }
  p.hidden = false; p.classList.add('thinking'); p.textContent = t('aiThinking');
  clearTimeout(noteT);
  noteT = setTimeout(async () => {
    const text = await ask('note', payload);
    if (!p.isConnected) return;
    p.classList.remove('thinking');
    if (text) { cache[key] = { text, at: Date.now() }; keep(); show(p, text, true); } else show(p, ownNote(x, T), false);
  }, 400);
}
