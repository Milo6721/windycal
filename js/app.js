// Windy: write what you ate, in plain words.
import { t, num, longDate, setLang, getLang, locale } from './i18n.js';
import { getEstimate } from './estimate.js';
import { targets } from './goal.js';
import { Spring, countTo, sfx, setSound, toast } from './fx.js';
import { initSettings, openSettings, closeSettings, settingsOpen } from './settings.js';
import { renderWeekly } from './weekly.js';
import { initSummary, refreshSummary, closeSummary, summaryOpen } from './summary.js';
import { icon, MACROS } from './icons.js';

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
export const curKey = () => dayKey(view === 'tomorrow' ? 1 : 0);
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
      <span class="macs">${t('pcf').map((l, i) => `<em class="m-${MACROS[i]}">${l}</em> <i>0</i>`).join(' · ')}</span>
      <span class="state">${SPARK}<span></span></span>
    </button>`;
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
    if (!row._e) return ta.focus();
    const b = row.querySelector('.r').getBoundingClientRect(); openDetail(row, b.right, b.top);
  });
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
    e.text = text; e.mult = 1;
    save(); estimate(e);
  }
}

// The real work. The shimmer runs exactly as long as the request does.
async function estimate(e, quiet = false, fresh = false) {
  const tok = (tokens.get(e.id) || 0) + 1; tokens.set(e.id, tok);
  const text = e.text;
  if (!quiet) { e.status = 'pending'; e.deep = fresh; const r = rows.get(e.id); if (r) paint(r, false); renderTotals(); paintDetail(); }
  const res = await getEstimate(text, getLang(), fresh);
  const live = locate(e.id);
  if (!live || tokens.get(e.id) !== tok || live.text !== text) return;
  const real = res.source === 'ai' || res.source === 'cache';
  if (quiet && !real) return; // still no AI: keep what we have
  live.items = res.items; live.why = real ? undefined : res.reason; delete live.deep;
  live.status = real ? (res.notFood ? 'unknown' : 'done') : res.source === 'table' ? 'rough' : 'waiting';
  save();
  const row = rows.get(e.id);
  if (row) {
    paint(row, true);
    if (live.items.length) { row.classList.remove('landed'); void row.offsetWidth; row.classList.add('landed'); clearTimeout(row._land); row._land = setTimeout(() => row.classList.remove('landed'), 1200); }
  }
  renderTotals(); paintDetail(true);
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
  row.querySelector('.state span').textContent = e.status === 'pending' && e.deep ? t('thinkingMore') : t(e.status === 'waiting' ? (['no_key', 'bad_key', 'rate_limited', 'offline'].includes(e.why) ? 'why_' + e.why : 'waiting') : e.status === 'unknown' ? 'unknown' : 'estimating');
  if (!has) return;
  const tot = totalsOf([e]);
  const grams = e.items.reduce((s, it) => s + (it.grams || 0), 0) * m;
  const rough = e.status === 'rough' || e.items.some(it => it.confidence === 'low');
  const dot = row.querySelector('.dot');
  dot.className = 'dot' + (rough ? ' rough' : e.items.some(it => it.confidence === 'medium') ? ' mid' : '');
  row.querySelector('.sub span').textContent =
    (m !== 1 ? `${fmtMult(m)} · ` : '') + e.items.map(it => it.portion).filter(Boolean).join(', ') +
    (grams ? ` · ~${num(grams)} g` : '') + (e.status === 'rough' ? ` · ${t('rough')}` : '');
  countTo(row.querySelector('.kcal b'), tot.kcal, num, !animate, 520);
  const ms = row.querySelectorAll('.macs i');
  [tot.protein, tot.carbs, tot.fat].forEach((v, i) => countTo(ms[i], v, num, !animate, 520));
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
  refreshSummary();
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
  closeDetail(); if (v === 'weekly') closeSummary();
  renderHead(swap);
  if (v === 'weekly') renderWeekly($('weekly'));
  else { renderLog(); renderTotals(); }
  $('scroll').scrollTop = 0;
}

function renderChrome() {
  $('days').querySelectorAll('button').forEach(b => { b.textContent = t(b.dataset.view); });
  document.querySelectorAll('.mac').forEach(el => { el.classList.add('m-' + el.dataset.m); el.querySelector('.lbl').innerHTML = icon(el.dataset.m, 13) + `<span>${t(el.dataset.m)}</span>`; });
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

// ---------- the detail card: pops up in the bottom-right corner ----------
const ACT = {
  again: '<path d="M10 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M18.5 14c.3 2.3 1.2 3.2 3.5 3.5-2.3.3-3.2 1.2-3.5 3.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  move: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  del: '<path d="M4 7h16"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l1 12a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l1-12"/>',
};
const MIN = 0.25, MAX = 3, MARKS = [0.5, 1, 1.5, 2, 3];
const fmtMult = m => (m === 0.25 ? '¼' : m === 0.5 ? '½' : m === 0.75 ? '¾' : m === 1.5 ? '1½' : m === 2.5 ? '2½' : String(+m.toFixed(2))) + '×';
const pos = v => (v - MIN) / (MAX - MIN);
const card = document.createElement('div'); card.id = 'detail'; card.className = 'detail'; card.setAttribute('role', 'dialog');
document.body.append(card);
let cur = null; // the row whose card is open
export const detailOpen = () => card.classList.contains('open');
export function closeDetail() { if (!cur) return; cur.classList.remove('picked'); cur = null; card.classList.remove('open'); }

function buildDetail() {
  const btn = (act, label, cls = '') => `<button type="button" class="d-act ${cls}" data-act="${act}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ACT[act]}</svg><span>${label}</span></button>`;
  card.innerHTML = `
    <div class="d-head"><div class="d-k"><b>0</b><small>kcal</small></div><button type="button" class="d-close" aria-label="${t('close')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <p class="d-name"></p>
    <div class="d-wave"></div>
    <div class="d-bar">${MACROS.map(k => `<i class="bg-${k}"></i>`).join('')}</div>
    <div class="d-macs">${MACROS.map(k => `<div class="d-mac m-${k}"><span class="ic">${icon(k, 18)}</span><b><i>0</i> g</b><span class="lb">${t(k)}</span><em>0%</em></div>`).join('')}</div>
    <div class="d-items"></div>
    <div class="d-portion">
      <div class="d-p-top"><span>${t('portion')}</span><b class="d-mult">1×</b><em class="d-g"></em></div>
      <div class="slider" role="slider" tabindex="0" aria-label="${t('portion')}" aria-valuemin="${MIN}" aria-valuemax="${MAX}">
        <div class="s-track"><div class="s-fill"></div></div><div class="s-thumb"></div>
      </div>
      <div class="s-marks">${MARKS.map(m => `<button type="button" data-m="${m}" style="left:${pos(m) * 100}%">${fmtMult(m)}</button>`).join('')}</div>
    </div>
    <div class="d-acts">${btn('again', t('mAgain'), 'wide')}${btn('edit', t('mEdit'))}${btn('move', '')}${btn('del', t('mDelete'), 'danger')}</div>`;
}

function setThumb(v, smooth) {
  const sl = card.querySelector('.slider'); if (!sl) return;
  sl.classList.toggle('smooth', !!smooth);
  sl.style.setProperty('--p', pos(v));
  sl.setAttribute('aria-valuenow', v); sl.setAttribute('aria-valuetext', fmtMult(v));
  card.querySelectorAll('.s-marks button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.m - v) < 0.01));
}

function paintDetail(landed = false, opening = false) {
  if (!cur) return;
  const e = cur._e && locate(cur._e.id); if (!e) return closeDetail();
  const has = e.items?.length > 0, m = e.mult || 1, tot = totalsOf([e]);
  const thinking = e.status === 'pending';
  card.classList.toggle('thinking', thinking); card.classList.toggle('empty', !has);
  card.querySelector('.d-name').textContent = thinking ? (e.deep ? t('thinkingMore') : t('estimating')) : e.text;
  const quick = !opening && !landed;
  countTo(card.querySelector('.d-k b'), tot.kcal, num, quick, 700);
  const kc = MACROS.map((k, i) => tot[k] * [4, 4, 9][i]), sum = kc.reduce((a, b) => a + b, 0) || 1;
  card.querySelectorAll('.d-bar i').forEach((el, i) => { el.style.flexGrow = Math.max(kc[i], 0.0001); });
  card.querySelectorAll('.d-mac').forEach((el, i) => {
    countTo(el.querySelector('b i'), tot[MACROS[i]], num, quick, 700);
    el.querySelector('em').textContent = has ? Math.round((kc[i] / sum) * 100) + '%' : '';
  });
  const list2 = card.querySelector('.d-items'); list2.innerHTML = '';
  if (has && e.items.length > 1) for (const it of e.items) {
    const d = document.createElement('div');
    d.append(Object.assign(document.createElement('span'), { textContent: `${it.name} · ${it.portion}` }), Object.assign(document.createElement('b'), { textContent: `${num(it.calories * m)} kcal` }));
    list2.append(d);
  }
  const grams = has ? e.items.reduce((a, it) => a + (it.grams || 0), 0) * m : 0;
  card.querySelector('.d-mult').textContent = fmtMult(m);
  card.querySelector('.d-g').textContent = grams ? `~${num(grams)} g` : '';
  if (!dragging) setThumb(m, !opening);
  const onToday = (state.days[dayKey(0)] || []).includes(e);
  card.querySelector('[data-act=move] span').textContent = t(onToday ? 'mToTomorrow' : 'mToToday');
  if (landed) { card.classList.remove('landed'); void card.offsetWidth; card.classList.add('landed'); }
}

function openDetail(row, x, y) {
  const e = row._e && locate(row._e.id); if (!e) return;
  closeSummary();
  if (cur) cur.classList.remove('picked');
  document.activeElement?.blur?.();
  cur = row; row.classList.add('picked');
  buildDetail();
  paintDetail(false, true);
  card.querySelectorAll('.d-k b, .d-mac b i').forEach(n => { n._n = 0; n.textContent = '0'; });
  paintDetail(true, false);
  card.classList.remove('open'); void card.offsetWidth; card.classList.add('open'); sfx('pop');
}

// The portion slider: follows your finger exactly, then settles on the nearest quarter with a spring.
let dragging = false, dragUndo = false;
function setMult(v, live) {
  const e = cur && cur._e && locate(cur._e.id); if (!e) return;
  if (!dragUndo) { pushUndo(); dragUndo = true; }
  e.mult = v; paint(cur, !live); renderTotals();
  const tot = totalsOf([e]), grams = e.items.reduce((a, it) => a + (it.grams || 0), 0) * v;
  countTo(card.querySelector('.d-k b'), tot.kcal, num, live, 380);
  card.querySelectorAll('.d-mac').forEach((el, i) => countTo(el.querySelector('b i'), tot[MACROS[i]], num, live, 380));
  card.querySelectorAll('.d-items b').forEach((b, i) => { b.textContent = `${num(e.items[i].calories * v)} kcal`; });
  card.querySelector('.d-mult').textContent = fmtMult(v);
  card.querySelector('.d-g').textContent = grams ? `~${num(grams)} g` : '';
}
const snap4 = v => Math.min(MAX, Math.max(MIN, Math.round(v * 4) / 4));
function commitMult(v) { setThumb(v, true); setMult(v, false); save(); dragUndo = false; sfx('pop'); }
card.addEventListener('pointerdown', ev => {
  const sl = ev.target.closest('.slider'); if (!sl) return;
  ev.preventDefault(); sl.setPointerCapture(ev.pointerId); dragging = true; sl.classList.add('drag');
  const r = sl.getBoundingClientRect();
  const at = cx => MIN + Math.min(1, Math.max(0, (cx - r.left) / r.width)) * (MAX - MIN);
  const move = mv => { const v = at(mv.clientX); setThumb(v, false); setMult(Math.round(v * 20) / 20, true); };
  sl.classList.add('smooth'); setThumb(at(ev.clientX), true); setMult(Math.round(at(ev.clientX) * 20) / 20, true);
  setTimeout(() => sl.classList.remove('smooth'), 260);
  const up = u => { sl.removeEventListener('pointermove', move); sl.removeEventListener('pointerup', up); sl.removeEventListener('pointercancel', up); dragging = false; sl.classList.remove('drag'); commitMult(snap4(at(u.clientX))); };
  sl.addEventListener('pointermove', move); sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
});
card.addEventListener('keydown', ev => {
  if (!ev.target.closest('.slider')) return;
  const e = cur && cur._e && locate(cur._e.id); if (!e) return;
  const d = ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? 0.25 : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -0.25 : 0;
  if (d) { ev.preventDefault(); commitMult(snap4((e.mult || 1) + d)); }
});
card.addEventListener('click', ev => {
  if (ev.target.closest('.d-close')) return closeDetail();
  const mk = ev.target.closest('.s-marks button'); if (mk) return commitMult(+mk.dataset.m);
  const b = ev.target.closest('.d-act'); if (!b || !cur) return;
  const row = cur, live = locate(row._e.id); if (!live) return;
  const act = b.dataset.act;
  if (act === 'again') { estimate(live, false, true); return; }
  closeDetail();
  if (act === 'edit') focusRow(row);
  else if (act === 'del') { row.querySelector('.txt').value = ''; commit(row); }
  else if (act === 'move') {
    const onToday = (state.days[dayKey(0)] || []).includes(live);
    pushUndo();
    const from = Object.keys(state.days).find(k => state.days[k].includes(live)), to = dayKey(onToday ? 1 : 0);
    state.days[from] = state.days[from].filter(z => z !== live); list(to).push(live);
    save(); renderLog(); renderTotals(); sfx('pop');
    toast(t(onToday ? 'movedTomorrow' : 'movedToday'), { label: t('undo'), kbd: '⌘Z', run: undo });
  }
});

$('log').addEventListener('contextmenu', ev => {
  const row = ev.target.closest('.row:not(.draft):not(.out)'); if (!row || !row._e) return;
  ev.preventDefault(); openDetail(row, ev.clientX, ev.clientY);
});
let pressT;
$('log').addEventListener('touchstart', ev => { // long-press on a phone
  const row = ev.target.closest('.row:not(.draft):not(.out)'); if (!row || !row._e) return;
  const p = ev.touches[0]; clearTimeout(pressT);
  pressT = setTimeout(() => openDetail(row, p.clientX, p.clientY), 520);
}, { passive: true });
for (const n of ['touchmove', 'touchend', 'touchcancel']) $('log').addEventListener(n, () => clearTimeout(pressT), { passive: true });
document.addEventListener('pointerdown', ev => { if (cur && !ev.target.closest('#detail') && !ev.target.closest('.row.picked .r')) closeDetail(); });

// ---------- a caret that sways like a reed in the wind ----------
const caret = document.createElement('div'); caret.className = 'caret'; caret.hidden = true;
caret.innerHTML = '<i></i><svg viewBox="0 0 20 14" aria-hidden="true"><path d="M1 4h9a2.2 2.2 0 1 0-2.2-2.2"/><path d="M1 8.5h13a2.4 2.4 0 1 1-2.4 2.4"/></svg>';
const mirror = document.createElement('div'); mirror.className = 'mirror';
document.body.append(caret, mirror);
let gustT;
function placeCaret(gust) {
  const ta = document.activeElement;
  if (!ta?.classList?.contains('txt') || ta.selectionStart !== ta.selectionEnd || ta.closest('.row.thinking')) { caret.hidden = true; return; }
  const cs = getComputedStyle(ta);
  mirror.style.font = cs.font; mirror.style.letterSpacing = cs.letterSpacing; mirror.style.width = ta.clientWidth + 'px';
  mirror.textContent = ta.value.slice(0, ta.selectionStart);
  const mark = document.createElement('span'); mark.textContent = '​'; mirror.append(mark);
  const r = ta.getBoundingClientRect(), lh = parseFloat(cs.lineHeight) || 24;
  caret.style.height = lh + 'px';
  caret.style.transform = `translate(${r.left + mark.offsetLeft}px, ${r.top + mark.offsetTop - ta.scrollTop}px)`;
  caret.hidden = false;
  if (gust) { caret.classList.remove('gust'); void caret.offsetWidth; caret.classList.add('gust'); clearTimeout(gustT); gustT = setTimeout(() => caret.classList.remove('gust'), 900); }
}
document.addEventListener('selectionchange', () => placeCaret(false));
document.addEventListener('input', ev => { if (ev.target.classList?.contains('txt')) placeCaret(true); });
document.addEventListener('focusout', () => setTimeout(() => placeCaret(false), 0));
$('scroll').addEventListener('scroll', () => placeCaret(false), { passive: true });

// ---------- wiring ----------
$('days').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && b.dataset.view !== view) { sfx('pop'); setView(b.dataset.view); } });
$('setbtn').addEventListener('click', openSettings);
addEventListener('resize', () => placeCaret(false));
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
  else if (ev.key === 'Escape' && cur) closeDetail();
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
initSummary();
applySettings();
resume();
document.fonts?.ready.then(() => { movePill(); fitAll(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
