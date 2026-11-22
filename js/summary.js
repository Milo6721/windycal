// The summary bar unfolds three ways, following your finger the whole time:
//   drag it up    → Day, Week and Month numbers
//   drag it left  → a long strip across the page: the AI reads how you are eating
//   drag it right → a long strip across the page: your trends as charts
// Let go and it springs open or closed, depending on how far and how fast you pulled.
import { state, totalsOf, keyOf, curKey } from './app.js';
import { t, num, locale, getLang, longDate } from './i18n.js';
import { targets } from './goal.js';
import { Spring, countTo, sfx, toast } from './fx.js';
import { icon, MACROS } from './icons.js';

const WIND_UP = '<svg class="pan-wind" viewBox="0 0 640 60" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="M-20 16h380c40 0 60-12 100-12s60 14 200 8"/><path pathLength="100" d="M-20 32h260c50 0 70 12 120 12s90-16 300-8"/><path pathLength="100" d="M-20 48h440c30 0 50-10 80-10s50 8 160 6"/></svg>';
const PAGES = ['sDay', 'sWeek', 'sMonth'];
let bar, panels = {}, openKind = null, progress = 0, page = 0;
const springs = {};
export const summaryOpen = () => !!openKind;

// ---------- data ----------
const lastDays = n => {
  const out = [];
  for (let off = -(n - 1); off <= 0; off++) {
    const d = new Date(); d.setDate(d.getDate() + off);
    const key = keyOf(d), entries = state.days[key] || [];
    out.push({ key, d, entries, tot: totalsOf(entries) });
  }
  return out;
};
const runCounts = (root, instant) => root.querySelectorAll('[data-n]').forEach(n => { if (!instant) n._n = 0; countTo(n, +n.dataset.n, num, instant, 800); });
const stat = (value, label, suffix = '') => `<div class="stat"><b><i data-n="${Math.round(value)}">0</i>${suffix}</b><span>${label}</span></div>`;
const bars = (days, goal, labels) => {
  const max = Math.max(goal * 1.2, ...days.map(x => x.tot.kcal));
  return `<div class="s-chart n${days.length}">
    <div class="goal-line" style="bottom:${(goal / max) * 100}%"><span>${t('goalWord')} ${num(goal)}</span></div>
    ${days.map((x, i) => `<div class="s-col ${x.tot.kcal > 0 ? 'has' : ''} ${x.tot.kcal > goal ? 'over' : ''}" title="${longDate(x.d)} · ${num(x.tot.kcal)} kcal"><i style="height:${x.tot.kcal > 0 ? Math.max((x.tot.kcal / max) * 100, 3) : 0}%;animation-delay:${i * (days.length > 10 ? 12 : 45)}ms"></i></div>`).join('')}
  </div>${labels ? `<div class="s-x">${days.map(x => `<span>${x.d.toLocaleDateString(locale(), { weekday: 'narrow' })}</span>`).join('')}</div>` : ''}`;
};

// ---------- up: Day / Week / Month ----------
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
        <div class="s-ring-in"><b><i data-n="${tot.kcal}">0</i></b><span>${t('ofGoal', num(T.kcal))}</span></div>
      </div>
      <div class="s-macs">${MACROS.map(k => `
        <div class="s-mac m-${k}"><span class="ic">${icon(k, 18)}</span>
          <div class="s-mac-t"><span>${t(k)}</span><b><i data-n="${tot[k]}">0</i> / ${T[k]} g</b></div>
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
function goPage(i, animate = true) {
  const el = panels.up, track = el.querySelector('.sum-track');
  page = Math.max(0, Math.min(PAGES.length - 1, i));
  el.querySelectorAll('.sum-tabs button').forEach((b, n) => b.classList.toggle('on', n === page));
  const on = el.querySelector('.sum-tabs button.on'), pill = el.querySelector('.sum-tabs .pill');
  if (on) { pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft}px)`; }
  track.style.transform = `translateX(${-page * 100}%)`;
  const sec = track.children[page];
  if (page === 0) renderDay(sec, animate); else renderRange(sec, page === 1 ? 7 : 30, animate);
  fitUp();
}
function fitUp() {
  if (openKind !== 'up' || !geo) return;
  const el = panels.up, sec = el.querySelector('.sum-track').children[page];
  const need = el.querySelector('.sum-top').offsetHeight + sec.scrollHeight + geo.b.height + 14 + 6;
  const room = innerHeight - geo.bottom - 76;
  geo.height = Math.min(room, need);
  el.style.height = geo.height + 'px';
}

// ---------- left: the AI read ----------
let aiRun = 0, aiScope = 'day';
const AI_KEY = 'windy.ai.v1';
let aiCache = {};
try { aiCache = JSON.parse(localStorage.getItem(AI_KEY) || '{}'); } catch {}
function aiDays(scope) {
  if (scope === 'day') { const k = curKey(), entries = state.days[k] || []; return entries.length ? [{ key: k, entries, tot: totalsOf(entries) }] : []; }
  return lastDays(7).filter(x => x.entries.length);
}
function aiPayload(scope) {
  const T = targets(state.settings);
  return {
    scope, lang: getLang(), goal: { kcal: T.kcal, protein: T.protein, carbs: T.carbs, fat: T.fat },
    days: aiDays(scope).map(x => ({ date: x.key, kcal: x.tot.kcal, protein: x.tot.protein, carbs: x.tot.carbs, fat: x.tot.fat,
      foods: x.entries.filter(e => e.text).map(e => `${e.text} (${Math.round(totalsOf([e]).kcal)} kcal)`) })),
  };
}
function aiSide() {
  const T = targets(state.settings), week = lastDays(7);
  const scopeDays = aiScope === 'day' ? lastDays(1) : week;
  const tot = scopeDays.reduce((s, x) => { for (const k in s) s[k] += x.tot[k]; return s; }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const kc = MACROS.map((k, i) => tot[k] * [4, 4, 9][i]), sum = kc.reduce((a, b) => a + b, 0) || 1;
  return `${bars(week, T.kcal, false)}
      <div class="ai-split">${MACROS.map((k, i) => `<i class="bg-${k}" style="flex-grow:${Math.max(kc[i], 0.0001)}"></i>`).join('')}</div>
`;
}
function renderAI() {
  const el = panels.ai.querySelector('.pan-c');
  el.innerHTML = `
    <div class="st-l"><div class="st-title"><span class="ai-spark">${SPARK}</span>${t('aiTitle')}</div>
      <div class="bseg ai-seg"><button type="button" data-s="day" class="${aiScope === 'day' ? 'on' : ''}">${t('sDay')}</button><button type="button" data-s="week" class="${aiScope === 'week' ? 'on' : ''}">${t('sWeek')}</button></div></div>
    <div class="s-ai-out"></div>
    <div class="ai-side">${aiSide()}</div>`;
  el.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { if (aiScope !== b.dataset.s) { aiScope = b.dataset.s; sfx('pop'); renderAI(); askAI(); } }));
  const cached = aiCache[aiScope];
  if (cached && cached.key === JSON.stringify(aiPayload(aiScope))) showText(cached.text, false);
  else el.querySelector('.s-ai-out').innerHTML = `<p class="s-ai-hint">${t('aiHint')}</p>`;
}
const SPARK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 14c.3 2.3 1.2 3.2 3.5 3.5-2.3.3-3.2 1.2-3.5 3.5-.3-2.3-1.2-3.2-3.5-3.5 2.3-.3 3.2-1.2 3.5-3.5z" opacity=".55"/></svg>';
function showText(text, typing) {
  const out = panels.ai.querySelector('.s-ai-out'); out.innerHTML = '';
  const p = Object.assign(document.createElement('p'), { className: 'ai-text' }); out.append(p);
  if (!typing) { p.textContent = text; return; }
  const run = aiRun; let i = 0;
  const step = () => { if (run !== aiRun) return; i = Math.min(text.length, i + 3); p.textContent = text.slice(0, i); if (i < text.length) requestAnimationFrame(step); };
  step();
}
// Asks only when there is something new to read; the same day or week is answered from memory.
async function askAI(force = false) {
  const out = panels.ai.querySelector('.s-ai-out'), scope = aiScope, run = ++aiRun;
  const payload = aiPayload(scope), key = JSON.stringify(payload);
  if (!payload.days.length) { out.innerHTML = `<p class="s-ai-hint">${t('aiEmpty')}</p>`; return; }
  if (!force && aiCache[scope]?.key === key) return showText(aiCache[scope].text, false);
  out.innerHTML = `<div class="ai-wave"></div><p class="s-ai-think">${t('aiThinking')}</p>`; out.scrollTop = 0;
  let text = '', why = 'unreachable', detail = '';
  try {
    const r = await fetch('/api/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: payload }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.text) text = j.text;
    else { why = r.status === 404 ? 'not_deployed' : j.error || 'upstream'; detail = j.detail || ''; }
  } catch {}
  if (run !== aiRun || !panels.ai.isConnected) return;
  if (!text) {
    const own = localRead(scope, payload);
    if (own) {
      out.innerHTML = '';
      const p = Object.assign(document.createElement('p'), { className: 'ai-text', textContent: own });
      const note = Object.assign(document.createElement('small'), { className: 'ai-detail', textContent: (why === 'rate_limited' ? t('aiLimit') : t('aiOwn')) + ' ' });
      const again = Object.assign(document.createElement('button'), { type: 'button', className: 'ai-again', textContent: t('tryAgain') });
      again.onclick = () => askAI(true); note.append(again); p.append(note); out.append(p);
      return;
    }
    const msg = why === 'not_deployed' ? t('aiDeploy') : ['no_key', 'bad_key', 'rate_limited'].includes(why) ? t('why_' + why) : t('aiFail');
    out.innerHTML = '';
    const p = Object.assign(document.createElement('p'), { className: 's-ai-hint', textContent: msg + ' ' });
    if (detail) p.append(Object.assign(document.createElement('small'), { className: 'ai-detail', textContent: detail }));
    const again = Object.assign(document.createElement('button'), { type: 'button', className: 'ai-again', textContent: t('tryAgain') });
    again.onclick = () => askAI(true); p.append(again); out.append(p);
    return;
  }
  aiCache[scope] = { key, text };
  try { localStorage.setItem(AI_KEY, JSON.stringify(aiCache)); } catch {}
  sfx('land'); showText(text, true);
}

// A short written read made from the numbers alone, for when Gemini is resting.
function localRead(scope, payload) {
  const g = payload.goal, d = payload.days; if (!d.length) return '';
  const n = d.length, sum = k => d.reduce((s, x) => s + x[k], 0), avg = k => sum(k) / n;
  const pl = getLang() === 'pl';
  if (scope === 'day') {
    const k = Math.round(sum('kcal')), pct = Math.round((k / g.kcal) * 100), p = Math.round(sum('protein'));
    const top = d[0].foods.slice().sort((a, b) => (+(b.match(/\((\d+)/) || [])[1] || 0) - (+(a.match(/\((\d+)/) || [])[1] || 0))[0];
    const proteinNote = p >= g.protein * 0.8 ? (pl ? 'Białka masz dobrze.' : 'Protein is on track.') : (pl ? `Białka jest ${p} z ${g.protein} g, więc przy kolejnym posiłku warto dorzucić coś białkowego.` : `Protein is at ${p} of ${g.protein} g, so your next meal is a good place for something protein-rich.`);
    return pl
      ? `Dziś masz ${num(k)} z ${num(g.kcal)} kcal (${pct}%). ${proteinNote}${top ? ` Najwięcej dało: ${top.replace(/\s*\(.*\)$/, '')}.` : ''}`
      : `So far today you are at ${num(k)} of ${num(g.kcal)} kcal (${pct}%). ${proteinNote}${top ? ` The biggest part came from ${top.replace(/\s*\(.*\)$/, '')}.` : ''}`;
  }
  const a = Math.round(avg('kcal')), diff = a - g.kcal, p = Math.round(avg('protein'));
  const near = d.filter(x => x.kcal >= g.kcal * 0.8 && x.kcal <= g.kcal * 1.05).length;
  return pl
    ? `W ${n} zapisanych dniach średnio ${num(a)} kcal, czyli ${diff >= 0 ? `${num(diff)} ponad` : `${num(-diff)} poniżej`} celu. Białko średnio ${p} z ${g.protein} g. Blisko celu byłeś w ${near} z ${n} dni.`
    : `Over ${n} logged ${n === 1 ? 'day' : 'days'} you averaged ${num(a)} kcal, ${diff >= 0 ? `${num(diff)} above` : `${num(-diff)} below`} your goal. Protein averaged ${p} of ${g.protein} g, and ${near} of ${n} days landed near your goal.`;
}

// ---------- right: trends ----------
function renderTrend(animate) {
  const el = panels.trend.querySelector('.pan-c');
  const T = targets(state.settings), days = lastDays(7), logged = days.filter(x => x.tot.kcal > 0);
  const avg = logged.length ? logged.reduce((s, x) => s + x.tot.kcal, 0) / logged.length : 0;
  const near = logged.filter(x => x.tot.kcal >= T.kcal * 0.8 && x.tot.kcal <= T.kcal * 1.05).length;
  const max = Math.max(T.kcal * 1.15, ...days.map(x => x.tot.kcal));
  el.innerHTML = `
    <div class="st-l"><div class="st-title">${t('trendTitle')}</div><span class="st-sub">${t('thisWeek')} · ${t('goalWord')} ${num(T.kcal)}</span></div>
    <div class="wk7">
      <i class="wk7-goal" style="bottom:calc(15px + (100% - 31px) * ${(T.kcal / max).toFixed(3)})"></i>
      ${days.map((x, i) => `<div class="wk7-d ${x.tot.kcal > T.kcal ? 'over' : ''} ${i === 6 ? 'now' : ''}">
        <span class="wk7-n">${x.tot.kcal > 0 ? num(x.tot.kcal) : '–'}</span>
        <span class="wk7-b"><i style="height:${x.tot.kcal > 0 ? Math.max((x.tot.kcal / max) * 100, 6) : 0}%;animation-delay:${i * 40}ms"></i></span>
        <span class="wk7-l">${i === 6 ? t('today') : x.d.toLocaleDateString(locale(), { weekday: 'short' })}</span></div>`).join('')}
    </div>
    <div class="tr-stats"><div><b><i data-n="${Math.round(avg)}">0</i></b><span>${t('avgKcal')}</span></div><div><b>${near}/${logged.length || 0}</b><span>${t('sOnGoal')}</span></div></div>`;
  runCounts(el, !animate);
}

// ---------- the unfolding ----------
// Each panel sits behind the bar and is clipped to the bar's exact shape at 0;
// at 1 it is fully open. Everything in between is drawn straight from the finger.
let geo = null;
function measure(kind) {
  const b = bar.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, bottom = vh - b.bottom;
  const room = vh - bottom - 76;
  if (kind === 'up') return { left: b.left, width: b.width, bottom, height: Math.min(room, b.height + 470), b };
  const width = Math.min(vw - (vw < 700 ? 12 : 40), 1180), left = (vw - width) / 2;
  return { left, width, bottom, height: b.height, b };
}
const dist = () => Math.min(240, innerWidth * 0.4);       // how far a sideways pull opens a strip
const span = () => Math.min(320, geo ? geo.height - geo.b.height : 320); // how far an upward pull opens the sheet

function paint(kind, p) {
  const el = panels[kind]; if (!el || !geo) return;
  const q = Math.max(0, Math.min(1, p)), k = 1 - q, g = geo, pc = Math.min(p, 1.03);
  const c = el.querySelector('.pan-c'), f = Math.max(0, Math.min(1, (p - (kind === 'up' ? 0.18 : 0.1)) / (kind === 'up' ? 0.62 : 0.5)));
  el.style.visibility = p > 0.002 ? 'visible' : 'hidden';
  c.style.opacity = f;
  if (kind === 'up') {
    const top = (g.height - g.b.height) * k;
    el.querySelector('.pan-box').style.clipPath = `inset(${top}px 0px 0px 0px round 24px)`;
    c.style.transform = `translateY(${(1 - pc) * 46}px)`;
    el.style.transform = `scaleX(${1 - 0.035 * Math.sin(Math.PI * q)})`;
    c.style.filter = f < 0.98 ? `blur(${(1 - f) * 4}px)` : 'none';
  } else {
    // The bar stretches out to both sides like something elastic being pulled: the edge you
    // pull leads, the other edge follows a moment later, and the bar dips a little in height
    // at the middle of the stretch before it settles. What was on it slides out softly,
    // and the strip's content slides in from the side you pulled toward.
    const dir = kind === 'ai' ? -1 : 1, s2 = Math.min(Math.max(p, 0), 1.02);
    const lead = 1 - Math.pow(1 - Math.min(s2, 1), 1.6) + Math.max(0, s2 - 1), lag = Math.pow(s2, 1.45);
    const qL = dir < 0 ? lead : lag, qR = dir < 0 ? lag : lead;
    const bR = g.b.left + g.b.width, R0 = g.left + g.width;
    const L = g.b.left + (g.left - g.b.left) * qL, R = bR + (R0 - bR) * qR;
    el.style.left = L + 'px'; el.style.width = (R - L) + 'px';
    el.style.transform = `scaleY(${1 - 0.06 * Math.sin(Math.PI * q)})`;
    c.style.left = (g.left - L) + 'px';
    c.style.transform = `translateX(${(1 - pc) * -dir * 48}px)`;
    c.style.filter = f < 0.98 ? `blur(${(1 - f) * 5}px)` : 'none';
    bar.style.setProperty('--slide', `${dir * Math.min(pc, 1) * 120}px`);
    bar.style.setProperty('--fade', Math.max(0, 1 - q * 1.8));
    bar.style.setProperty('--blur', `${Math.min(q * 2, 1) * 5}px`);
  }
  bar.style.setProperty('--open', q);
}
function place(kind) {
  geo = measure(kind);
  const el = panels[kind];
  Object.assign(el.style, { left: geo.left + 'px', width: geo.width + 'px', bottom: geo.bottom + 'px', height: geo.height + 'px' });
  if (kind === 'up') el.querySelector('.pan-box').style.paddingBottom = (geo.b.height + 14) + 'px';
  else { const c = el.querySelector('.pan-c'); c.style.width = geo.width + 'px'; c.style.height = geo.height + 'px'; }
}
function resetBar(kind) {
  bar.classList.remove('k-' + kind, 'sided');
  bar.style.removeProperty('--slide'); bar.style.removeProperty('--fade'); bar.style.removeProperty('--blur');
  if (openKind === kind) { openKind = null; bar.classList.remove('lifted'); bar.style.setProperty('--open', 0); }
}
function begin(kind) { // first frame of an opening: fill it, measure it, let the wind blow
  if (openKind && openKind !== kind) hideNow(openKind);
  openKind = kind; place(kind);
  if (kind === 'up') { panels.up.querySelectorAll('.sum-tabs button').forEach((b, n) => { b.textContent = t(PAGES[n]); }); goPage(page, true); }
  else if (kind === 'ai') renderAI();
  else renderTrend(true);
  const el = panels[kind]; el.classList.add('live');
  el.classList.remove('gust'); void el.offsetWidth; el.classList.add('gust');
  bar.classList.add('lifted', 'k-' + kind); if (kind !== 'up') bar.classList.add('sided');
}
function hideNow(kind) {
  springs[kind].jump(0); panels[kind].classList.remove('live'); resetBar(kind);
}
function settle(kind, target, v = 0) {
  const sp = springs[kind];
  sp.v = v; sp.set(target);
  if (target === 1) { sfx('pop'); if (kind === 'ai') askAI(); }
}
export function closeSummary() { if (openKind) settle(openKind, 0); }
export function openSummary(kind = 'up') { if (openKind !== kind) begin(kind); settle(kind, 1); }
export function refreshSummary() {
  if (!openKind || progress < 0.99) return;
  if (openKind === 'up') goPage(page, false); else if (openKind === 'trend') renderTrend(false); else panels.ai.querySelector('.ai-side').innerHTML = aiSide();
}

function makePanel(kind) {
  const el = document.createElement('div'); el.className = 'pan pan-' + kind; el.id = 'pan-' + kind;
  el.innerHTML = `<div class="pan-box">${kind === 'up' ? WIND_UP : ''}
    <div class="pan-c">${kind === 'up' ? `<div class="sum-top"><div class="days sum-tabs"><span class="pill"></span>${PAGES.map(() => '<button type="button"></button>').join('')}</div></div>
      <div class="sum-view"><div class="sum-track">${PAGES.map(() => '<section></section>').join('')}</div></div>` : ''}</div></div>`;
  document.body.append(el);
  springs[kind] = new Spring(p => {
    if (openKind === kind) progress = p;
    paint(kind, p);
    if (p <= 0.002 && springs[kind].to === 0 && !drag) { el.classList.remove('live'); resetBar(kind); }
  }, { stiffness: 210, damping: 24 });
  springs[kind].jump(0);
  return el;
}

// ---------- the gesture ----------
let drag = null;
function onDown(ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  const src = ev.currentTarget === bar ? 'bar' : 'panel';
  if (src === 'panel' && ev.target.closest('.ai-seg')) return; // let text be selected and buttons pressed
  bar.classList.add('held');
  drag = { src, node: ev.currentTarget, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, axis: null, mode: null, samples: [] };
}
function sample(p) { const now = performance.now(); drag.samples.push([now, p]); while (drag.samples.length > 2 && now - drag.samples[0][0] > 90) drag.samples.shift(); }
function velocity(d) { const s = d.samples; if (s.length < 2) return 0; const [t0, p0] = s[0], [t1, p1] = s[s.length - 1]; return t1 > t0 ? ((p1 - p0) / (t1 - t0)) * 1000 : 0; }
const rubber = p => (p > 1 ? 1 + (p - 1) * 0.2 : p < 0 ? p * 0.2 : p);

function onMove(ev) {
  if (!drag || ev.pointerId !== drag.id) return;
  const dx = ev.clientX - drag.x0, dy = ev.clientY - drag.y0;
  if (!drag.axis) {
    if (Math.hypot(dx, dy) < 7) return;
    drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    try { drag.node.setPointerCapture(drag.id); } catch {}
    if (openKind === 'up' && drag.src === 'panel' && drag.axis === 'x') drag.mode = 'page';
    else if (openKind && ((openKind === 'up' && drag.axis === 'y') || (openKind !== 'up' && drag.axis === 'x'))) { drag.mode = 'adjust'; drag.kind = openKind; drag.p0 = springs[openKind].x; }
    else if (!openKind && drag.src === 'bar') drag.mode = drag.axis === 'y' ? 'up' : 'side';
    else drag.mode = 'none';
    if (drag.mode !== 'none' && drag.mode !== 'page') document.body.classList.add('pulling');
  }
  // The panel follows the finger for the first bit; past a small pull it lets go
  // and glides the rest of the way by itself (or back, when you push it closed).
  const SNAP = 0.22;
  if (drag.mode === 'up') {
    if (dy > 0 && !openKind) return;
    if (openKind !== 'up') begin('up');
    const p = rubber(-dy / span()); springs.up.jump(p); sample(p);
    if (p > SNAP) { drag.mode = 'done'; settle('up', 1, Math.max(1.5, velocity(drag))); }
  } else if (drag.mode === 'side') {
    const kind = dx < 0 ? 'ai' : 'trend';
    if (openKind !== kind) begin(kind);
    const p = rubber(Math.abs(dx) / dist()); springs[kind].jump(p); sample(p);
    if (p > SNAP) { drag.mode = 'done'; settle(kind, 1, Math.max(1.5, velocity(drag))); }
  } else if (drag.mode === 'adjust') {
    const k = drag.kind;
    const delta = k === 'up' ? -dy / span() : k === 'ai' ? -dx / dist() : dx / dist();
    const p = rubber(drag.p0 + delta); springs[k].jump(p); sample(p);
    if (p < 1 - SNAP) { drag.mode = 'done'; settle(k, 0, Math.min(-1.5, velocity(drag))); }
  } else if (drag.mode === 'page') {
    const track = panels.up.querySelector('.sum-track'), w = panels.up.offsetWidth || 1;
    const edge = (page === 0 && dx > 0) || (page === PAGES.length - 1 && dx < 0);
    track.style.transition = 'none';
    track.style.transform = `translateX(calc(${-page * 100}% + ${dx * (edge ? 0.25 : 1)}px))`;
  }
}
function onUp(ev) {
  if (!drag || ev.pointerId !== drag.id) return;
  const d = drag; drag = null; document.body.classList.remove('pulling'); bar.classList.remove('held');
  const dx = ev.clientX - d.x0;
  if (!d.axis) { // a tap
    if (d.src === 'bar') { if (openKind) closeSummary(); else openSummary('up'); }
    else if (openKind && openKind !== 'up' && !ev.target.closest('button, .s-ai-out')) closeSummary();
    return;
  }
  if (d.mode === 'page') {
    const track = panels.up.querySelector('.sum-track'), w = panels.up.offsetWidth || 1;
    track.style.transition = '';
    goPage(page + (dx < -w * 0.18 ? 1 : dx > w * 0.18 ? -1 : 0), Math.abs(dx) > w * 0.18);
    return;
  }
  if (!openKind || d.mode === 'none' || d.mode === 'done') return;
  const kind = openKind, sp = springs[kind], p = sp.x, v = velocity(d);
  const target = d.mode === 'adjust' ? (p + v * 0.2 < 1 - 0.22 ? 0 : 1) : (p + v * 0.2 > 0.12 ? 1 : 0);
  settle(kind, target, Math.max(-4, Math.min(4, v)));
}

export function initSummary() {
  bar = document.getElementById('bar');
  panels.up = makePanel('up'); panels.ai = makePanel('ai'); panels.trend = makePanel('trend');
  panels.up.querySelectorAll('.sum-tabs button').forEach((b, n) => b.addEventListener('click', () => { if (n !== page) { sfx('pop'); goPage(n); } }));
  for (const node of [bar, panels.up, panels.ai, panels.trend]) {
    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  }
  document.addEventListener('pointerdown', ev => { if (openKind && !ev.target.closest('.pan, #bar, #detail, #toast')) closeSummary(); });
  document.addEventListener('keydown', ev => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (ev.key === 'Escape' && openKind) closeSummary();
    else if (openKind === 'up' && ev.key === 'ArrowRight') goPage(page + 1);
    else if (openKind === 'up' && ev.key === 'ArrowLeft') goPage(page - 1);
  });
  addEventListener('resize', () => { if (openKind) { place(openKind); paint(openKind, springs[openKind].x); } });
  // Show once how the bar works.
  try {
    if (!localStorage.getItem('windy.barhint')) setTimeout(() => { toast(t('barHint')); localStorage.setItem('windy.barhint', '1'); }, 1600);
  } catch {}
}
