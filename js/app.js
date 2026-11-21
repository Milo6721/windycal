// Windy: write what you ate, in plain words.
import { t, num, longDate, setLang, getLang, locale } from './i18n.js';
import { getEstimate } from './estimate.js';
import { targets } from './goal.js';
import { Spring, countTo, sfx, setSound, toast } from './fx.js';
import { initSettings, openSettings, closeSettings, settingsOpen } from './settings.js';
import { renderWeekly } from './weekly.js';

const $ = id => document.getElementById(id);
const KEY = 'windy.v1';
const RING = 125.66;
const SPARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 14c.3 2.3 1.2 3.2 3.5 3.5-2.3.3-3.2 1.2-3.5 3.5-.3-2.3-1.2-3.2-3.5-3.5 2.3-.3 3.2-1.2 3.5-3.5z" opacity=".55"/></svg>';
const MIC = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg>';

// ---------- state ----------
export const state = { days: {}, settings: {} };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
state.days = state.days || {}; state.settings = state.settings || {};
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

let view = 'today';
const pad = n => String(n).padStart(2, '0');
export const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayKey = (off = 0) => { const d = new Date(); d.setDate(d.getDate() + off); return keyOf(d); };
const curKey = () => dayKey(view === 'tomorrow' ? 1 : 0);
const list = k => (state.days[k] = state.days[k] || []);
const locate = id => { for (const k in state.days) { const e = state.days[k].find(x => x.id === id); if (e) return e; } return null; };

export function totalsOf(entries) {
  const s = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries || []) for (const it of e.items || []) {
    const m = e.mult || 1;
    s.kcal += it.calories * m; s.protein += it.protein * m; s.carbs += it.carbs * m; s.fat += it.fat * m;
  }
  return s;
}

// ---------- undo ----------
const UNDO = [], REDO = [];
const snap = () => JSON.stringify(state.days);
function pushUndo() { UNDO.push(snap()); if (UNDO.length > 60) UNDO.shift(); REDO.length = 0; }
function restore(s) { state.days = JSON.parse(s); save(); renderLog(); renderTotals(); resume(); }
function undo() {
  if (!UNDO.length) return toast(t('nothingUndo'));
  REDO.push(snap()); restore(UNDO.pop()); sfx('pop');
  toast(t('undone'), { label: t('redo'), kbd: '⇧⌘Z', run: redo });
}
function redo() {
  if (!REDO.length) return toast(t('nothingRedo'));
  UNDO.push(snap()); restore(REDO.pop()); sfx('pop');
  toast(t('redone'), { label: t('undo'), kbd: '⌘Z', run: undo });
}

// ---------- the log ----------
const rows = new Map(); // entry id → row element
const tokens = new Map(); // entry id → latest request number
let rendering = false;

function makeRow(e) {
  const row = document.createElement('div');
  row.className = 'row' + (e ? '' : ' draft');
  row.innerHTML = `
    <div class="l">
      <textarea class="txt" rows="1" spellcheck="false" autocomplete="off" autocapitalize="off" enterkeyhint="done"></textarea>
      <div class="sub"><i class="dot"></i><span></span></div>
      <button class="mic" type="button">${MIC}</button>
      <button class="x" type="button" tabindex="-1"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <button class="r" type="button" tabindex="-1">
      <span class="kcal"><b>0</b><small>kcal</small></span>
      <span class="macs">${t('pcf').map(l => `${l} <i>0</i>`).join(' · ')}</span>
      <span class="state">${SPARK}<span></span></span>
    </button>
    <div class="adj"><div class="adj-in"><span>${t('portion')}</span>
      <div class="slide"><input type="range" min="0.5" max="2" step="0.5" value="1" aria-label="${t('portion')}">
      <div class="ticks"><span>½×</span><span>1×</span><span>1.5×</span><span>2×</span></div></div><b>1×</b></div></div>`;
  row._e = e || null;
  const ta = row.querySelector('.txt');
  ta.value = e ? e.text : '';
  ta.placeholder = e ? '' : t(view === 'tomorrow' ? 'placeholderTomorrow' : 'placeholder');
  row.querySelector('.mic').title = t('dictate');

  ta.addEventListener('input', () => {
    fit(ta); updateHint();
    clearTimeout(row._t);
    if (ta.value.trim().length >= 2) row._t = setTimeout(() => commit(row), 1400); // a short pause finishes the line
  });
  ta.addEventListener('keydown', ev => onKey(ev, row, ta));
  ta.addEventListener('blur', () => { if (!rendering && row.isConnected) { clearTimeout(row._t); commit(row); } });
  row.querySelector('.r').addEventListener('click', () => {
    if (!row._e?.items?.length || row._e.status === 'pending') return ta.focus();
    row.classList.toggle('adjusting'); sfx('pop');
  });
  const range = row.querySelector('input[type=range]');
  range.addEventListener('input', () => {
    const live = row._e && locate(row._e.id); if (!live) return;
    if (!row._adj) { pushUndo(); row._adj = true; }
    live.mult = +range.value; paint(row, true); renderTotals();
  });
  range.addEventListener('change', () => { row._adj = false; save(); });
  row.querySelector('.mic').addEventListener('click', () => dictate(row));
  const x = row.querySelector('.x'); x.title = t('mDelete'); x.setAttribute('aria-label', t('mDelete'));
  x.addEventListener('click', () => { clearTimeout(row._t); ta.value = ''; commit(row); });
  if (e) { rows.set(e.id, row); paint(row, false); }
  return row;
}

const fit = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
const fitAll = () => document.querySelectorAll('.txt').forEach(fit);
const draftRow = () => $('log').querySelector('.row.draft');
const siblingRow = (row, dir) => { let n = row; do { n = dir > 0 ? n.nextElementSibling : n.previousElementSibling; } while (n && !n.classList.contains('row')); return n; };
const focusRow = (row, end = true) => { if (!row) return; const ta = row.querySelector('.txt'); ta.focus(); const p = end ? ta.value.length : 0; ta.setSelectionRange(p, p); };

function onKey(ev, row, ta) {
  if (ev.isComposing) return;
  if (ev.key === 'Enter') {
    ev.preventDefault(); clearTimeout(row._t);
    const next = siblingRow(row, 1);
    commit(row);
    focusRow(row.classList.contains('out') ? next : siblingRow(row, 1) || draftRow());
  } else if (ev.key === 'Backspace' && !ta.value) {
    const prev = siblingRow(row, -1);
    if (row._e || prev) { ev.preventDefault(); commit(row); focusRow(prev || draftRow()); }
  } else if (ev.key === 'ArrowUp' && ta.selectionStart === 0 && siblingRow(row, -1)) {
    ev.preventDefault(); focusRow(siblingRow(row, -1));
  } else if (ev.key === 'ArrowDown' && ta.selectionEnd === ta.value.length && siblingRow(row, 1)) {
    ev.preventDefault(); focusRow(siblingRow(row, 1));
  } else if (ev.key === 'Tab' && !row._e && !ta.value && suggestion()) {
    ev.preventDefault(); acceptSuggestion();
  } else if (ev.key === 'Escape') ta.blur();
}

// A line is finished: create, change or remove its entry, then estimate it.
function commit(row) {
  const ta = row.querySelector('.txt'), text = ta.value.replace(/\s+/g, ' ').trim();
  let e = row._e && locate(row._e.id);
  if (!e) {
    if (!text) return;
    pushUndo();
    e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, ts: Date.now(), status: 'pending', items: [], mult: 1 };
    list(curKey()).push(e);
    row._e = e; rows.set(e.id, row); row.classList.remove('draft'); ta.placeholder = '';
    const d = makeRow(null); d.classList.add('in'); $('log').insertBefore(d, row.nextSibling); fit(d.querySelector('.txt'));
    placeDividers(); updateHint(); save(); estimate(e);
  } else if (!text) {
    pushUndo();
    const k = Object.keys(state.days).find(x => state.days[x].includes(e));
    state.days[k] = state.days[k].filter(x => x !== e);
    rows.delete(e.id); tokens.delete(e.id);
    row.style.height = row.offsetHeight + 'px'; row.classList.add('out'); row._e = null;
    requestAnimationFrame(() => { row.style.height = '0'; row.style.padding = '0'; });
    setTimeout(() => { row.remove(); placeDividers(); updateHint(); }, 320);
    save(); renderTotals(); sfx('off');
    toast(t('removed'), { label: t('undo'), kbd: '⌘Z', run: undo });
  } else if (text !== e.text) {
    pushUndo();
    e.text = text; e.mult = 1; row.classList.remove('adjusting');
    save(); estimate(e);
  }
}

// The real work. The shimmer runs exactly as long as the request does.
async function estimate(e, quiet = false, fresh = false) {
  const tok = (tokens.get(e.id) || 0) + 1; tokens.set(e.id, tok);
  const text = e.text;
  if (!quiet) { e.status = 'pending'; const r = rows.get(e.id); if (r) paint(r, false); renderTotals(); }
  const res = await getEstimate(text, getLang(), fresh);
  const live = locate(e.id);
  if (!live || tokens.get(e.id) !== tok || live.text !== text) return;
  const real = res.source === 'ai' || res.source === 'cache';
  if (quiet && !real) return; // still no AI: keep what we have
  live.items = res.items; live.why = real ? undefined : res.reason;
  live.status = real ? (res.notFood ? 'unknown' : 'done') : res.source === 'table' ? 'rough' : 'waiting';
  save();
  const row = rows.get(e.id);
  if (row) {
    paint(row, true);
    if (live.items.length) { row.classList.remove('landed'); void row.offsetWidth; row.classList.add('landed'); clearTimeout(row._land); row._land = setTimeout(() => row.classList.remove('landed'), 1200); }
  }
  renderTotals();
  if (live.items.length) sfx('land');
}

function paint(row, animate) {
  const e = row._e && locate(row._e.id); if (!e) return;
  row._e = e;
  const has = e.items?.length > 0, m = e.mult || 1;
  row.classList.toggle('thinking', e.status === 'pending');
  row.classList.toggle('waiting', e.status === 'waiting');
  row.classList.toggle('unknown', e.status === 'unknown');
  row.classList.toggle('has-sub', has && e.status !== 'pending');
  row.querySelector('.state span').textContent = t(e.status === 'waiting' ? (['no_key', 'bad_key', 'rate_limited', 'offline'].includes(e.why) ? 'why_' + e.why : 'waiting') : e.status === 'unknown' ? 'unknown' : 'estimating');
  if (!has) return;
  const tot = totalsOf([e]);
  const grams = e.items.reduce((s, it) => s + (it.grams || 0), 0) * m;
  const rough = e.status === 'rough' || e.items.some(it => it.confidence === 'low');
  const dot = row.querySelector('.dot');
  dot.className = 'dot' + (rough ? ' rough' : e.items.some(it => it.confidence === 'medium') ? ' mid' : '');
  row.querySelector('.sub span').textContent =
    (m !== 1 ? `${m}× · ` : '') + e.items.map(it => it.portion).filter(Boolean).join(', ') +
    (grams ? ` · ~${num(grams)} g` : '') + (e.status === 'rough' ? ` · ${t('rough')}` : '');
  countTo(row.querySelector('.kcal b'), tot.kcal, num, !animate, 520);
  const ms = row.querySelectorAll('.macs i');
  [tot.protein, tot.carbs, tot.fat].forEach((v, i) => countTo(ms[i], v, num, !animate, 520));
  const range = row.querySelector('input[type=range]');
  if (document.activeElement !== range) range.value = m;
  row.querySelector('.adj-in b').textContent = (m === 0.5 ? '½' : m) + '×';
}

const period = ts => { const h = new Date(ts).getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; };
function placeDividers() {
  const log = $('log');
  log.querySelectorAll('.divider').forEach(d => d.remove());
  if (view !== 'today') return;
  let last = null;
  for (const row of log.querySelectorAll('.row:not(.draft):not(.out)')) {
    const p = row._e && period(row._e.ts);
    if (p && p !== last) { last = p; const d = document.createElement('div'); d.className = 'divider'; d.textContent = t(p); log.insertBefore(d, row); }
  }
}

function renderLog() {
  rendering = true;
  const log = $('log'); log.innerHTML = ''; rows.clear();
  for (const e of list(curKey())) log.append(makeRow(e));
  log.append(makeRow(null));
  log.append(Object.assign(document.createElement('div'), { className: 'hint', id: 'hint' }));
  const clr = Object.assign(document.createElement('button'), { className: 'clear', id: 'clear', type: 'button', textContent: t('clearDay') });
  clr.onclick = clearDay; log.append(clr);
  placeDividers(); fitAll(); updateHint();
  rendering = false;
}

// "Same as yesterday" for breakfast, or a quiet hello on an empty page.
function suggestion() {
  if (view !== 'today' || new Date().getHours() >= 11 || list(dayKey(0)).length) return null;
  const y = state.days[dayKey(-1)] || [];
  return (y.find(e => new Date(e.ts).getHours() < 11) || y[0])?.text || null;
}
function acceptSuggestion() { const d = draftRow(), s = suggestion(); if (!d || !s) return; const ta = d.querySelector('.txt'); ta.value = s; fit(ta); commit(d); focusRow(draftRow()); }
function clearDay() {
  if (!list(curKey()).length) return;
  pushUndo(); state.days[curKey()] = [];
  save(); renderLog(); renderTotals(); sfx('off');
  toast(t('cleared'), { label: t('undo'), kbd: '⌘Z', run: undo });
}
function updateHint() {
  const h = $('hint'); if (!h) return;
  if ($('clear')) $('clear').hidden = list(curKey()).length < 2;
  const d = draftRow(), typing = d && d.querySelector('.txt').value, s = suggestion();
  h.innerHTML = '';
  if (typing || list(curKey()).length) return;
  if (s) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = `${t('sameAs')} ${s}`; b.onclick = acceptSuggestion;
    h.append(b, Object.assign(document.createElement('kbd'), { textContent: 'Tab' }));
  } else h.textContent = view === 'tomorrow' ? t('helloTomorrow') : t('hello', (state.settings.name || '').trim());
}

// ---------- dictation ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function dictate(row) {
  if (!SR) return toast(t('noDictation'));
  const btn = row.querySelector('.mic');
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = locale(); rec.interimResults = false;
  btn.classList.add('listening');
  rec.onresult = ev => { const d = draftRow(); if (!d) return; const ta = d.querySelector('.txt'); ta.value = ev.results[0][0].transcript; fit(ta); commit(d); };
  rec.onerror = ev => { if (ev.error !== 'aborted' && ev.error !== 'no-speech') toast(t('noDictation')); };
  rec.onend = () => { btn.classList.remove('listening'); rec = null; };
  try { rec.start(); } catch { rec = null; btn.classList.remove('listening'); }
}

// ---------- heading and summary bar ----------
const ring = new Spring(x => { $('ring').style.strokeDashoffset = Math.max(0, RING * (1 - x)); }, { stiffness: 110, damping: 13 });
let firstTotals = true;

function renderHead(swap) {
  const head = document.querySelector('.head');
  const d = new Date(); if (view === 'tomorrow') d.setDate(d.getDate() + 1);
  $('title').textContent = t(view);
  $('dateline').textContent = view === 'weekly' ? t('thisWeek') : longDate(d);
  $('eaten').hidden = view === 'weekly';
  if (swap) { head.classList.remove('swap'); void head.offsetWidth; head.classList.add('swap'); }
}

export function renderTotals() {
  if (view === 'weekly') return;
  const instant = firstTotals; firstTotals = false;
  const tot = totalsOf(list(curKey())), T = targets(state.settings), kcal = Math.round(tot.kcal);
  const any = list(curKey()).some(e => e.items?.length);
  $('eaten').textContent = any ? t(view === 'tomorrow' ? 'planned' : 'eaten', num(kcal)) : t(view === 'tomorrow' ? 'nothingPlanned' : 'nothingYet');
  countTo($('bEaten'), kcal, num, instant);
  countTo($('bGoal'), T.kcal, num, instant);
  const over = kcal > T.kcal;
  $('bar').classList.toggle('over', over);
  $('bLeft').textContent = over ? t('over', num(kcal - T.kcal)) : t('left', num(T.kcal - kcal));
  const frac = Math.min(kcal / T.kcal, 1);
  instant ? ring.jump(frac) : ring.set(frac);
  for (const el of document.querySelectorAll('.mac')) {
    const k = el.dataset.m, v = Math.round(tot[k]);
    countTo(el.querySelector('.n'), v, num, instant);
    el.querySelector('u').style.transform = `scaleX(${Math.min(v / T[k], 1)})`;
    el.classList.toggle('full', v > T[k] * 1.15);
  }
}

// ---------- views ----------
function movePill() {
  const on = $('days').querySelector('button.on'), pill = $('pill');
  pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft}px)`;
}
function setView(v, swap = true) {
  if (document.activeElement?.classList.contains('txt')) document.activeElement.blur();
  view = v;
  $('days').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  movePill();
  $('log').hidden = v === 'weekly'; $('weekly').hidden = v !== 'weekly';
  $('bar').classList.toggle('away', v === 'weekly');
  renderHead(swap);
  if (v === 'weekly') renderWeekly($('weekly'));
  else { renderLog(); renderTotals(); }
  $('scroll').scrollTop = 0;
}

function renderChrome() {
  $('days').querySelectorAll('button').forEach(b => { b.textContent = t(b.dataset.view); });
  document.querySelectorAll('.mac').forEach(el => { el.querySelector('.lbl').textContent = t(el.dataset.m); });
  $('setbtn').title = `${t('settings')} (⌘,)`; $('setbtn').setAttribute('aria-label', t('settings'));
  requestAnimationFrame(movePill);
}

export function applySettings() {
  const s = state.settings;
  setLang(s.lang || 'en'); setSound(s.sound !== false);
  const dark = s.theme === 'dark' || ((s.theme || 'auto') === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = dark ? '#1C1B19' : '#ffffff';
  renderChrome(); setView(view, false);
}

// Entries left unfinished (reload mid-request, offline guesses) get another try.
function resume() {
  for (const off of [0, 1]) for (const e of list(dayKey(off))) {
    if (e.status === 'pending') estimate(e);
    else if (e.status === 'rough' || e.status === 'waiting') estimate(e, true);
  }
}

// ---------- right-click menu: what's in a line, and what you can do with it ----------
const ICON = {
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  portion: '<path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.2" fill="var(--card)"/><circle cx="15" cy="16" r="2.2" fill="var(--card)"/>',
  again: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
  move: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  del: '<path d="M4 7h16"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l1 12a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l1-12"/>',
};
const menuEl = document.createElement('div'); menuEl.id = 'menu'; document.body.append(menuEl);
const closeMenu = () => menuEl.classList.remove('open');

function openMenu(row, x, y) {
  const e = row._e && locate(row._e.id); if (!e) return;
  const tot = totalsOf([e]), has = e.items?.length > 0;
  const parts = [['protein', tot.protein, 4], ['carbs', tot.carbs, 4], ['fat', tot.fat, 9]];
  const sum = parts.reduce((a, p) => a + p[1] * p[2], 0) || 1;
  const onToday = (state.days[dayKey(0)] || []).includes(e);
  const item = (act, icon, label, cls = '') => `<button type="button" class="it ${cls}" data-act="${act}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[icon]}</svg>${label}</button>`;
  menuEl.innerHTML = (has ? `
    <div class="m-head"><b>${num(tot.kcal)}<small>kcal</small></b><span></span></div>
    <div class="m-bar">${parts.map(([k, g, f], i) => `<i class="c-${k}" style="flex:${Math.max(g * f, 0.001)};animation-delay:${i * 70}ms"></i>`).join('')}</div>
    <div class="m-legend">${parts.map(([k, g, f]) => `<div><i class="c-${k}"></i><span>${t(k)}</span><b>${num(g)} g</b><em>${Math.round((g * f / sum) * 100)}%</em></div>`).join('')}</div>
    ${e.items.length > 1 ? `<div class="m-items">${e.items.map(() => '<div><span></span><b></b></div>').join('')}</div>` : ''}
    <div class="sep"></div>` : '') +
    item('edit', 'edit', t('mEdit')) + (has ? item('portion', 'portion', t('mPortion')) : '') + item('again', 'again', t('mAgain')) +
    item('move', 'move', t(onToday ? 'mToTomorrow' : 'mToToday')) + '<div class="sep"></div>' + item('del', 'del', t('mDelete'), 'danger');
  if (has) {
    menuEl.querySelector('.m-head span').textContent = e.text;
    menuEl.querySelectorAll('.m-items div').forEach((d, i) => {
      const it = e.items[i], m = e.mult || 1;
      d.firstChild.textContent = it.name; d.lastChild.textContent = `${num(it.calories * m)} kcal`;
    });
  }
  menuEl.onclick = ev => {
    const b = ev.target.closest('.it'); if (!b) return;
    closeMenu();
    const act = b.dataset.act, live = locate(e.id); if (!live) return;
    if (act === 'edit') focusRow(row);
    else if (act === 'portion') { row.classList.add('adjusting'); sfx('pop'); }
    else if (act === 'again') estimate(live, false, true);
    else if (act === 'del') { row.querySelector('.txt').value = ''; commit(row); }
    else if (act === 'move') {
      pushUndo();
      const from = Object.keys(state.days).find(k => state.days[k].includes(live)), to = dayKey(onToday ? 1 : 0);
      state.days[from] = state.days[from].filter(z => z !== live); list(to).push(live);
      save(); renderLog(); renderTotals(); sfx('pop');
      toast(t(onToday ? 'movedTomorrow' : 'movedToday'), { label: t('undo'), kbd: '⌘Z', run: undo });
    }
  };
  menuEl.classList.remove('open'); menuEl.style.left = '0px'; menuEl.style.top = '0px';
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  const left = Math.max(8, Math.min(x, innerWidth - w - 8)), top = Math.max(8, Math.min(y, innerHeight - h - 8));
  menuEl.style.left = left + 'px'; menuEl.style.top = top + 'px';
  menuEl.style.transformOrigin = `${x - left}px ${y - top}px`;
  void menuEl.offsetWidth; menuEl.classList.add('open'); sfx('pop');
}

$('log').addEventListener('contextmenu', ev => {
  const row = ev.target.closest('.row:not(.draft):not(.out)'); if (!row || !row._e) return;
  ev.preventDefault(); openMenu(row, ev.clientX, ev.clientY);
});
let pressT;
$('log').addEventListener('touchstart', ev => { // long-press on a phone
  const row = ev.target.closest('.row:not(.draft):not(.out)'); if (!row || !row._e) return;
  const p = ev.touches[0]; clearTimeout(pressT);
  pressT = setTimeout(() => { document.activeElement?.blur(); openMenu(row, p.clientX, p.clientY); }, 520);
}, { passive: true });
for (const n of ['touchmove', 'touchend', 'touchcancel']) $('log').addEventListener(n, () => clearTimeout(pressT), { passive: true });
document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu')) closeMenu(); });
$('scroll').addEventListener('scroll', closeMenu, { passive: true });
addEventListener('resize', closeMenu); addEventListener('blur', closeMenu);

// ---------- wiring ----------
$('days').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && b.dataset.view !== view) { sfx('pop'); setView(b.dataset.view); } });
$('setbtn').addEventListener('click', openSettings);
$('scroll').addEventListener('click', ev => { if (view !== 'weekly' && (ev.target === $('scroll') || ev.target === $('log'))) focusRow(draftRow()); });
addEventListener('resize', () => { movePill(); fitAll(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);
addEventListener('online', () => { toast(t('back')); resume(); });
addEventListener('offline', () => toast(t('offline')));

document.addEventListener('keydown', ev => {
  const el = document.activeElement, typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  const mod = ev.metaKey || ev.ctrlKey;
  if (mod && ev.key.toLowerCase() === 'z') {
    if (settingsOpen()) return;
    if (el?.classList.contains('txt')) { // mid-edit: let the text field undo its own typing
      const row = el.closest('.row');
      if (el.value.trim() !== (row._e?.text || '')) return;
    }
    ev.preventDefault(); ev.shiftKey ? redo() : undo();
  } else if (mod && ev.key === ',') { ev.preventDefault(); openSettings(); }
  else if (ev.key === 'Escape' && menuEl.classList.contains('open')) closeMenu();
  else if (ev.key === 'Escape' && settingsOpen()) closeSettings();
  else if (!typing && !mod && !ev.altKey && !settingsOpen() && (ev.key === 'n' || ev.key === 'N' || ev.key === '/')) {
    ev.preventDefault(); if (view === 'weekly') setView('today'); focusRow(draftRow());
  }
});

// At midnight, Tomorrow's plan becomes Today's log (entries are stored by date).
let lastDay = dayKey(0);
setInterval(() => {
  if (dayKey(0) !== lastDay) { lastDay = dayKey(0); firstTotals = true; setView(view === 'tomorrow' ? 'today' : view, false); }
  if (navigator.onLine !== false && [0, 1].some(o => list(dayKey(o)).some(e => e.status === 'waiting'))) resume();
}, 30000);

initSettings();
applySettings();
resume();
document.fonts?.ready.then(() => { movePill(); fitAll(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
