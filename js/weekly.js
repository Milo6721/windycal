// Weekly: a calendar of one week at a time. Each day shows its total, a small ring against the
// goal, and the meals you wrote, like the lines on Today. Arrows move between weeks.
// Below: the chosen day in full (swipe a meal to the left to delete it), with a one-line AI note.
// Right-click a day (or press and hold it on a phone) for a quick look at its numbers.
import { state, keyOf, totalsOf } from './app.js';
import { t, num, locale, longDate, getLang } from './i18n.js';
import { targets } from './goal.js';
import { waterOf, waterOn, waterGoal, glassSVG } from './water.js';
import { aiPaused } from './estimate.js';
import { icon, MACROS } from './icons.js';

const AI_KEY = 'windy.coach.v1';
let weekOff = 0, sel = null, root = null, noteT = 0, shown = [];
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
    <div class="wk-nav">
      <button type="button" class="wk-arrow" data-go="-1" aria-label="${t('prevWeek')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="wk-range"><b>${rangeLabel(days)}</b><span>${weekOff === 0 ? t('thisWeekShort') : weekOff === -1 ? t('lastWeek') : days[0].d.getFullYear()}</span></div>
      <button type="button" class="wk-arrow" data-go="1" aria-label="${t('nextWeek')}" ${weekOff >= 1 ? 'disabled' : ''}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
      ${weekOff !== 0 ? `<button type="button" class="wk-now" data-go="now">${t('thisWeekShort')}</button>` : ''}
    </div>
    <div class="cal">${days.map((x, i) => {
      const isToday = sameDay(x.d, today), future = x.d > today && !isToday, over = x.tot.kcal > T.kcal;
      return `<button type="button" title="${t('dayPeek')}" class="cal-d ${isToday ? 'today' : ''} ${future ? 'future' : ''} ${x.key === sel ? 'sel' : ''} ${over ? 'over' : ''} ${x.tot.kcal ? '' : 'none'}" data-k="${x.key}" style="--i:${i}">
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
  shown = days;
  pickDay(days.find(x => x.key === sel), T, false);
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

// ---------- AI: a note for the chosen day ----------
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

// ---------- a quick look at one day: right-click it, or press and hold on a phone ----------
const peek = document.createElement('div'); peek.className = 'peek'; peek.setAttribute('role', 'dialog');
document.body.append(peek);
let peekT = 0, held = 0;
export const closePeek = () => { peek.classList.remove('open'); document.querySelector('.cal-d.peeking')?.classList.remove('peeking'); };
function openPeek(cell, x, y) {
  const day = shown.find(d => d.key === cell.dataset.k); if (!day) return;
  const T = targets(state.settings), k = day.tot.kcal, over = k > T.kcal, pct = Math.min(k / T.kcal, 1);
  const top = day.entries.filter(e => e.items?.length).sort((a, b) => totalsOf([b]).kcal - totalsOf([a]).kcal).slice(0, 3);
  closePeek(); cell.classList.add('peeking');
  peek.innerHTML = `
    <div class="pk-h"><b>${esc(longDate(day.d))}</b><span>${day.entries.length ? `${day.entries.length} ${t(day.entries.length === 1 ? 'pkMeal' : 'pkMeals')}` : t('noEntries')}</span></div>
    <div class="pk-k ${over ? 'over' : ''}"><b>${num(k)}</b><span>/ ${num(T.kcal)} kcal</span><em>${k ? (over ? t('over', num(k - T.kcal)) : t('left', num(T.kcal - k))) : ''}</em></div>
    <u class="pk-bar ${over ? 'over' : ''}"><s style="transform:scaleX(${pct})"></s></u>
    <div class="pk-m">${MACROS.map(m => `<div class="m-${m}"><span>${icon(m, 13)}${t(m)}</span><b>${day.tot[m]}<i> / ${T[m]} g</i></b><u><s style="transform:scaleX(${Math.min(day.tot[m] / T[m], 1)})"></s></u></div>`).join('')}</div>
    ${waterOn() ? `<div class="pk-w">${glassSVG(Math.min(day.water / waterGoal(), 1))}<span>${t('water')}</span><b>${day.water * 250} / ${waterGoal() * 250} ml</b></div>` : ''}
    ${top.length ? `<div class="pk-f">${top.map(e => `<div><span>${esc(e.text)}</span><b>${num(totalsOf([e]).kcal)}</b></div>`).join('')}</div>` : ''}`;
  peek.style.left = '0px'; peek.style.top = '0px'; peek.classList.add('measure');
  const w = peek.offsetWidth, h = peek.offsetHeight; peek.classList.remove('measure');
  const r = cell.getBoundingClientRect();
  // on a phone it sits above (or below) the day you're holding; on a computer at the pointer
  if (x == null) { x = r.left + r.width / 2 - w / 2; y = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10; }
  const left = Math.max(8, Math.min(x, innerWidth - w - 8)), topY = Math.max(8, Math.min(y, innerHeight - h - 8));
  peek.style.left = left + 'px'; peek.style.top = topY + 'px';
  peek.style.transformOrigin = `${Math.max(0, Math.min(w, r.left + r.width / 2 - left))}px ${r.top > topY ? h : 0}px`;
  void peek.offsetWidth; peek.classList.add('open');
  navigator.vibrate?.(8);
}
addEventListener('contextmenu', ev => {
  const cell = ev.target.closest?.('.weekly .cal-d'); if (!cell) return;
  ev.preventDefault(); getSelection()?.removeAllRanges();
  if (Date.now() - held < 700) return; // the long-press already opened it
  openPeek(cell, ev.clientX + 4, ev.clientY + 4);
});
addEventListener('touchstart', ev => {
  const cell = ev.target.closest?.('.weekly .cal-d'); if (!cell) return;
  clearTimeout(peekT);
  peekT = setTimeout(() => { held = Date.now(); openPeek(cell); }, 450);
}, { passive: true });
for (const n of ['touchmove', 'touchend', 'touchcancel']) addEventListener(n, () => clearTimeout(peekT), { passive: true });
// the press that opened it must not also pick the day underneath
addEventListener('click', ev => { if (Date.now() - held < 700 && ev.target.closest?.('.cal-d')) { ev.stopPropagation(); ev.preventDefault(); } }, true);
document.addEventListener('pointerdown', ev => { if (peek.classList.contains('open') && !ev.target.closest('.peek') && Date.now() - held > 700) closePeek(); }, true);
addEventListener('keydown', ev => { if (ev.key === 'Escape') closePeek(); });
addEventListener('resize', closePeek);
document.getElementById('scroll')?.addEventListener('scroll', closePeek, { passive: true });
