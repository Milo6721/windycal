// The day summary sheet. Tap the bar (or swipe it up) and it rises on a breeze:
// Day, Week, Month and an AI read of how you are eating. Swipe sideways to move between them.
import { state, totalsOf, keyOf, curKey } from './app.js';
import { t, num, locale, getLang, longDate } from './i18n.js';
import { targets } from './goal.js';
import { Spring, countTo, sfx } from './fx.js';
import { icon, MACROS } from './icons.js';

const PAGES = ['sDay', 'sWeek', 'sMonth', 'sAI'];
let el, track, bar, page = 0, open = false, aiBuilt = false;
export const summaryOpen = () => open;

const lastDays = n => {
  const out = [];
  for (let off = -(n - 1); off <= 0; off++) {
    const d = new Date(); d.setDate(d.getDate() + off);
    const key = keyOf(d), entries = state.days[key] || [];
    out.push({ key, d, entries, tot: totalsOf(entries) });
  }
  return out;
};
const stat = (value, label, suffix = '') => `<div class="stat"><b><i data-n="${Math.round(value)}">0</i>${suffix}</b><span>${label}</span></div>`;
const bars = (days, goal, labels) => {
  const max = Math.max(goal * 1.2, ...days.map(x => x.tot.kcal));
  return `<div class="s-chart n${days.length}">
    <div class="goal-line" style="bottom:${(goal / max) * 100}%"><span>${t('goalWord')} ${num(goal)}</span></div>
    ${days.map((x, i) => `<div class="s-col ${x.tot.kcal > 0 ? 'has' : ''} ${x.tot.kcal > goal ? 'over' : ''}" title="${longDate(x.d)} · ${num(x.tot.kcal)} kcal"><i style="height:${x.tot.kcal > 0 ? Math.max((x.tot.kcal / max) * 100, 3) : 0}%;animation-delay:${i * (days.length > 10 ? 12 : 45)}ms"></i></div>`).join('')}
  </div>${labels ? `<div class="s-x n${days.length}">${days.map(x => `<span>${x.d.toLocaleDateString(locale(), { weekday: 'narrow' })}</span>`).join('')}</div>` : ''}`;
};
const runCounts = (root, instant) => root.querySelectorAll('[data-n]').forEach(n => { n._n = instant ? undefined : 0; countTo(n, +n.dataset.n, num, instant, 800); });

function renderDay(sec, animate) {
  const T = targets(state.settings), entries = state.days[curKey()] || [], tot = totalsOf(entries);
  for (const k in tot) tot[k] = Math.round(tot[k]);
  const C = 2 * Math.PI * 52, over = tot.kcal > T.kcal;
  const times = { morning: 0, afternoon: 0, evening: 0 };
  let biggest = null;
  for (const e of entries) {
    const k = totalsOf([e]).kcal, h = new Date(e.ts).getHours();
    times[h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'] += k;
    if (k > 0 && (!biggest || k > biggest.k)) biggest = { k, text: e.text };
  }
  const tmax = Math.max(1, ...Object.values(times));
  sec.innerHTML = `
    <div class="s-day">
      <div class="s-ring ${over ? 'over' : ''}">
        <svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fg" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
        <div class="s-ring-in"><b><i data-n="${Math.round(tot.kcal)}">0</i></b><span>${t('ofGoal', num(T.kcal))}</span></div>
      </div>
      <div class="s-macs">${MACROS.map(k => `
        <div class="s-mac m-${k}"><span class="ic">${icon(k, 18)}</span>
          <div class="s-mac-t"><span>${t(k)}</span><b><i data-n="${Math.round(tot[k])}">0</i> / ${T[k]} g</b></div>
          <u><s style="transform:scaleX(${Math.min(tot[k] / T[k], 1)})"></s></u></div>`).join('')}
      </div>
    </div>
    <div class="s-times">${Object.entries(times).map(([k, v]) => `<div><span>${t(k)}</span><b><i data-n="${Math.round(v)}">0</i> kcal</b><u><s style="transform:scaleX(${v / tmax})"></s></u></div>`).join('')}</div>
    <p class="s-note">${over ? t('over', num(tot.kcal - T.kcal)) : t('left', num(T.kcal - tot.kcal))}<span></span></p>`;
  if (biggest) sec.querySelector('.s-note span').textContent = ` · ${t('biggest')}: ${biggest.text} (${num(biggest.k)} kcal)`;
  const fg = sec.querySelector('.ring-fg'), frac = Math.min(tot.kcal / T.kcal, 1);
  const sp = new Spring(x => { fg.style.strokeDashoffset = Math.max(0, C * (1 - x)); }, { stiffness: 90, damping: 12 });
  animate ? sp.set(frac) : sp.jump(frac);
  runCounts(sec, !animate);
}

function renderRange(sec, n, animate) {
  const T = targets(state.settings), days = lastDays(n), logged = days.filter(x => x.tot.kcal > 0), c = logged.length || 1;
  const total = logged.reduce((s, x) => s + x.tot.kcal, 0);
  const onGoal = logged.filter(x => x.tot.kcal <= T.kcal * 1.05 && x.tot.kcal >= T.kcal * 0.8).length;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].tot.kcal > 0) streak++; else if (i < days.length - 1) break; }
  const macro = k => logged.reduce((s, x) => s + x.tot[k], 0) / c;
  sec.innerHTML = `
    <div class="s-stats">
      ${stat(total, t('sTotal'), ' kcal')}${stat(total / c, t('avgKcal'))}
      ${n === 7 ? stat(onGoal, t('sOnGoal'), ` / ${logged.length}`) : stat(logged.length, t('sLogged'), ` / ${n}`)}
      ${n === 7 ? '' : stat(streak, t('sStreak'))}
    </div>
    ${bars(days, T.kcal, n === 7)}
    <div class="s-avgmac">${MACROS.map(k => `<div class="m-${k}"><span class="ic">${icon(k, 15)}</span><b><i data-n="${Math.round(macro(k))}">0</i> g</b><span>${t(k)}</span></div>`).join('')}</div>
    ${logged.length ? '' : `<p class="s-note">${t('noWeek')}</p>`}`;
  runCounts(sec, !animate);
}

// ---------- AI read ----------
function renderAI(sec) {
  if (aiBuilt) return; aiBuilt = true;
  sec.innerHTML = `
    <div class="s-ai">
      <div class="s-ai-btns"><button type="button" data-ai="day">${t('aiDay')}</button><button type="button" data-ai="week">${t('aiWeek')}</button></div>
      <div class="s-ai-out"><p class="s-ai-hint">${t('aiHint')}</p></div>
    </div>`;
  sec.querySelectorAll('[data-ai]').forEach(b => b.addEventListener('click', () => askAI(sec, b.dataset.ai)));
}
let aiRun = 0;
async function askAI(sec, scope) {
  const out = sec.querySelector('.s-ai-out'), run = ++aiRun;
  const days = (scope === 'day' ? lastDays(1) : lastDays(7)).filter(x => x.entries.length);
  const say = msg => { out.innerHTML = ''; out.append(Object.assign(document.createElement('p'), { className: 's-ai-hint', textContent: msg })); };
  if (scope === 'day') { const k = curKey(); days.length = 0; const entries = state.days[k] || []; if (entries.length) days.push({ key: k, entries, tot: totalsOf(entries) }); }
  if (!days.length) return say(t('aiEmpty'));
  sec.querySelectorAll('[data-ai]').forEach(b => b.classList.toggle('on', b.dataset.ai === scope));
  out.innerHTML = `<div class="ai-wave"></div><p class="s-ai-think">${t('aiThinking')}</p>`;
  sfx('pop');
  const T = targets(state.settings);
  let text = '', why = 'unreachable';
  try {
    const r = await fetch('/api/summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope, lang: getLang(), goal: { kcal: T.kcal, protein: T.protein, carbs: T.carbs, fat: T.fat },
        days: days.map(x => ({ date: x.key, kcal: x.tot.kcal, protein: x.tot.protein, carbs: x.tot.carbs, fat: x.tot.fat,
          foods: x.entries.filter(e => e.text).map(e => `${e.text} (${Math.round(totalsOf([e]).kcal)} kcal)`) })),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.text) text = j.text; else why = j.error || 'upstream';
  } catch {}
  if (run !== aiRun) return;
  if (!text) return say(t(['no_key', 'bad_key', 'rate_limited'].includes(why) ? 'why_' + why : 'aiFail'));
  out.innerHTML = '';
  const p = Object.assign(document.createElement('p'), { className: 'ai-text' }); out.append(p);
  sfx('land');
  let i = 0; // the answer writes itself out, a few letters per frame
  const step = () => { if (run !== aiRun) return; i = Math.min(text.length, i + 3); p.textContent = text.slice(0, i); if (i < text.length) requestAnimationFrame(step); };
  step();
}

// ---------- the sheet ----------
function renderPage(i, animate = true) {
  const sec = track.children[i];
  if (i === 0) renderDay(sec, animate);
  else if (i === 1) renderRange(sec, 7, animate);
  else if (i === 2) renderRange(sec, 30, animate);
  else renderAI(sec);
}
function movePill() {
  const on = el.querySelector('.sum-tabs button.on'), pill = el.querySelector('.sum-tabs .pill');
  if (on) { pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft}px)`; }
}
function go(i, animate = true) {
  page = Math.max(0, Math.min(PAGES.length - 1, i));
  el.querySelectorAll('.sum-tabs button').forEach((b, n) => b.classList.toggle('on', n === page));
  movePill();
  track.style.transform = `translateX(${-page * 100}%)`;
  renderPage(page, animate);
}
export function refreshSummary() { if (open) renderPage(page, false); }
export function closeSummary() { if (!open) return; open = false; el.classList.remove('open'); bar.classList.remove('lifted'); }
export function openSummary() {
  if (open) return; open = true;
  el.style.bottom = (innerHeight - bar.getBoundingClientRect().top + 10) + 'px';
  el.querySelectorAll('.sum-tabs button').forEach((b, n) => { b.textContent = t(PAGES[n]); });
  aiBuilt = false;
  el.classList.remove('open'); void el.offsetWidth; el.classList.add('open'); bar.classList.add('lifted');
  go(0); sfx('pop');
  requestAnimationFrame(movePill);
}
export const toggleSummary = () => (open ? closeSummary() : openSummary());

export function initSummary() {
  bar = document.getElementById('bar');
  el = document.createElement('div'); el.className = 'sum'; el.id = 'sum';
  el.innerHTML = `
    <svg class="sum-wind" viewBox="0 0 640 60" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength="100" d="M-20 16h380c40 0 60-12 100-12s60 14 200 8"/>
      <path pathLength="100" d="M-20 32h260c50 0 70 12 120 12s90-16 300-8"/>
      <path pathLength="100" d="M-20 48h440c30 0 50-10 80-10s50 8 160 6"/>
    </svg>
    <div class="sum-top"><div class="days sum-tabs"><span class="pill"></span>${PAGES.map(() => '<button type="button"></button>').join('')}</div></div>
    <div class="sum-view"><div class="sum-track">${PAGES.map(() => '<section></section>').join('')}</div></div>`;
  document.body.append(el);
  track = el.querySelector('.sum-track');
  el.querySelectorAll('.sum-tabs button').forEach((b, n) => b.addEventListener('click', () => { if (n !== page) { sfx('pop'); go(n); } }));

  // Swipe sideways to change page (on the sheet or on the bar), up on the bar to open, down to close.
  const swipe = (node, onBar) => {
    let x0 = 0, y0 = 0, down = false, moved = false, w = 1;
    node.addEventListener('pointerdown', ev => { if (ev.target.closest('button') && !onBar) return; down = true; moved = false; x0 = ev.clientX; y0 = ev.clientY; w = el.offsetWidth || 1; });
    node.addEventListener('pointermove', ev => {
      if (!down) return;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      moved = true;
      if (open && Math.abs(dx) > Math.abs(dy)) {
        const edge = (page === 0 && dx > 0) || (page === PAGES.length - 1 && dx < 0);
        track.style.transition = 'none';
        track.style.transform = `translateX(calc(${-page * 100}% + ${dx * (edge ? 0.25 : 1)}px))`;
      }
    });
    const end = ev => {
      if (!down) return; down = false;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      track.style.transition = '';
      if (!moved) { if (onBar) toggleSummary(); return; }
      if (Math.abs(dx) > Math.abs(dy)) { if (open) go(page + (dx < -w * 0.18 ? 1 : dx > w * 0.18 ? -1 : 0), Math.abs(dx) > w * 0.18); }
      else if (dy < -24 && onBar) openSummary();
      else if (dy > 40) closeSummary();
      else if (open) go(page, false);
    };
    node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end);
    node.addEventListener('pointerleave', ev => { if (down && moved) end(ev); });
  };
  swipe(el.querySelector('.sum-view'), false); swipe(bar, true);
  document.addEventListener('pointerdown', ev => { if (open && !ev.target.closest('#sum') && !ev.target.closest('#bar')) closeSummary(); });
  document.addEventListener('keydown', ev => {
    if (!open || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (ev.key === 'ArrowRight') go(page + 1); else if (ev.key === 'ArrowLeft') go(page - 1); else if (ev.key === 'Escape') closeSummary();
  });
  addEventListener('resize', () => { if (open) { el.style.bottom = (innerHeight - bar.getBoundingClientRect().top + 10) + 'px'; movePill(); } });
}
