// Settings: the same paper card as Stickly's.
import { state, save, applySettings, renderTotals } from './app.js';
import { t, num } from './i18n.js';
import { targets, cmToFtIn, ftInToCm, kgToLb, lbToKg } from './goal.js';
import { sfx } from './fx.js';
import { icon, MACROS } from './icons.js';
import { syncInfo, onSyncChange, startSync, stopSync, syncNow, canJoin, syncLink } from './sync.js';
import { paintWater } from './water.js';

const sheet = () => document.getElementById('setsheet');
const card = () => document.getElementById('setcard');
export const settingsOpen = () => sheet().classList.contains('open');
export function openSettings() { render(); sheet().classList.add('open'); sfx('pop'); }
export function closeSettings() { sheet().classList.remove('open'); }

const seg = (key, cur, opts) => `<div class="bseg">${opts.map(([v, l]) => `<button type="button" data-set="${key}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function goalBox() {
  const T = targets(state.settings), own = state.settings.goalOverride > 0;
  return `<div class="g-top"><div class="g-n">${num(T.kcal)}<small>kcal ${t('perDay')}</small></div>
      ${own ? `<button type="button" class="ghostbtn" data-act="reset">${t('reset')}</button>` : `<span class="g-tag">${t('calc')}</span>`}</div>
    <div class="g-macs">${MACROS.map(k => `<div class="m-${k}"><span class="ic">${icon(k, 15)}</span><b>${T[k]} g</b><span>${t(k)}</span></div>`).join('')}</div>`;
}

function render() {
  const s = state.settings, T = targets(s), b = T.body, imp = s.units === 'imperial';
  const [ft, inch] = cmToFtIn(b.height);
  const top = card().scrollTop;
  const row = (label, control, sub = '') => `<div class="st-row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>${control}</div>`;
  card().innerHTML = `
  <div class="c-head"><div><h2>${t('settings')}</h2><p>${t('settingsSub')}</p></div>
    <button type="button" data-act="close" title="${t('close')} (Esc)" aria-label="${t('close')}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>

  <div class="goalbox" id="goalbox">${goalBox()}</div>
  <p class="fine">${t('formula')}</p>

  <div class="sec"><h3>${t('you')}</h3><div class="grp">
    ${row(t('name'), `<input type="text" data-in="name" value="${esc(s.name)}" placeholder="${t('namePh')}" maxlength="24" autocomplete="off">`)}
    ${row(t('override'), `<div class="num"><input type="number" inputmode="numeric" data-in="goalOverride" value="${s.goalOverride > 0 ? s.goalOverride : ''}" placeholder="${T.calculated}" min="800" max="8000" step="10"><i>kcal</i></div>`, t('overrideSub'))}
  </div></div>

  <div class="sec"><h3>${t('body')}</h3><div class="grp">
    ${row(t('sex'), seg('sex', b.sex, [['male', t('male')], ['female', t('female')]]))}
    ${row(t('age'), `<div class="num"><input type="number" inputmode="numeric" data-in="age" value="${b.age}" min="14" max="100"><i>${t('years')}</i></div>`)}
    ${row(t('height'), `<div class="num">${imp
      ? `<input type="number" inputmode="numeric" data-in="ft" value="${ft}" min="3" max="8"><i>ft</i><input type="number" inputmode="numeric" data-in="inch" value="${inch}" min="0" max="11"><i>in</i>`
      : `<input type="number" inputmode="numeric" data-in="height" value="${b.height}" min="120" max="230"><i>cm</i>`}</div>`)}
    ${row(t('weight'), `<div class="num">${imp
      ? `<input type="number" inputmode="decimal" data-in="lb" value="${kgToLb(b.weight)}" min="70" max="600"><i>lb</i>`
      : `<input type="number" inputmode="decimal" data-in="weight" value="${b.weight}" min="30" max="300" step="0.5"><i>kg</i>`}</div>`)}
    ${row(t('activity'), `<select data-in="activity">${t('act').map((l, i) => `<option value="${i}" ${+b.activity === i ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${row(t('goal'), seg('goal', b.goal, [['lose', t('lose')], ['maintain', t('maintain')], ['gain', t('gain')]]))}
  </div></div>

  <div class="sec"><h3>${t('look')}</h3><div class="grp">
    ${row(t('appearance'), seg('theme', s.theme || 'auto', [['auto', t('auto')], ['light', t('light')], ['dark', t('dark')]]))}
    ${row(t('units'), seg('units', s.units || 'metric', [['metric', t('metric')], ['imperial', t('imperial')]]))}
    ${row(t('language'), seg('lang', s.lang || 'en', [['en', 'English'], ['pl', 'Polski']]))}
    ${row(t('sound'), `<button type="button" class="switch ${s.sound !== false ? 'on' : ''}" data-act="sound" role="switch" aria-checked="${s.sound !== false}"><i></i></button>`)}
  </div></div>

  <div class="sec"><h3>${t('extras')}</h3><div class="grp">
    ${row(t('water'), `<button type="button" class="switch ${s.water !== false ? 'on' : ''}" data-act="water" role="switch" aria-checked="${s.water !== false}"><i></i></button>`, t('waterSub'))}
    ${s.water !== false ? row(t('waterGoalLbl'), `<div class="num"><input type="number" inputmode="numeric" data-in="waterGoal" value="${s.waterGoal > 0 ? s.waterGoal : 8}" min="1" max="20"><i>${t('glasses')}</i></div>`) : ''}
    ${row(t('photos'), `<button type="button" class="switch ${s.photos !== false ? 'on' : ''}" data-act="photos" role="switch" aria-checked="${s.photos !== false}"><i></i></button>`, t('photosSub'))}
  </div></div>

  <div class="sec" id="syncsec">${syncBox()}</div>

  <div class="sec"><h3>${t('shortcuts')}</h3>
    <div class="keys"><span><kbd>N</kbd> <kbd>/</kbd> ${t('kFocus')}</span><span><kbd>Enter</kbd> ${t('kEnter')}</span><span><kbd>⌘Z</kbd> ${t('kUndo')}</span><span><kbd>⇧⌘Z</kbd> ${t('kRedo')}</span><span><kbd>Tab</kbd> ${t('kTab')}</span><span><kbd>⌘,</kbd> ${t('kSet')}</span></div></div>

  <p class="fine end">${t('stored')}</p>`;
  card().scrollTop = top;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- sync between devices ----------
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? t('justNow') : m < 60 ? t('minAgo', m) : t('hAgo', Math.round(m / 60));
}
function syncBox() {
  const x = syncInfo();
  if (!x.on) return `<h3>${t('syncTitle')}</h3><div class="grp sync">
    <p class="sync-p">${t('syncIntro')}</p>
    <div class="sync-acts"><button type="button" class="pill-btn" data-act="sync-new">${t('syncStart')}</button></div>
    <div class="sync-join"><input type="text" data-in="joincode" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24"><button type="button" class="ghostbtn" data-act="sync-join">${t('syncJoin')}</button></div>
  </div>`;
  const st = x.status === 'syncing' ? t('syncing') : x.status === 'no_store' ? t('syncNoStore') : x.status === 'offline' ? t('syncOffline')
    : x.status === 'error' ? t('syncError') : x.last ? t('syncedAgo', ago(x.last)) : t('syncing');
  return `<h3>${t('syncTitle')}</h3><div class="grp sync">
    <div class="sync-code"><span>${t('syncCode')}</span><b>${x.code}</b></div>
    <p class="sync-st ${x.status}"><i></i>${st}</p>
    <div class="sync-acts"><button type="button" class="pill-btn" data-act="sync-link">${t('syncCopyLink')}</button><button type="button" class="ghostbtn" data-act="sync-now">${t('syncNow')}</button><button type="button" class="ghostbtn danger" data-act="sync-off">${t('syncOff')}</button></div>
    <p class="fine">${t('syncHow')}</p>
  </div>`;
}
const paintSync = () => { const el = document.getElementById('syncsec'); if (el && settingsOpen()) el.innerHTML = syncBox(); };
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function initSettings() {
  onSyncChange(paintSync);
  sheet().addEventListener('mousedown', ev => { if (ev.target === sheet()) closeSettings(); });
  card().addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const s = state.settings;
    if (b.dataset.act === 'close') return closeSettings();
    if (b.dataset.act === 'sync-new') { startSync(); paintSync(); sfx('pop'); return; }
    if (b.dataset.act === 'sync-join') {
      const v = card().querySelector('[data-in=joincode]').value;
      if (!canJoin(v)) { card().querySelector('[data-in=joincode]').classList.add('bad'); return; }
      startSync(v); paintSync(); sfx('pop'); return;
    }
    if (b.dataset.act === 'sync-now') { syncNow(); return; }
    if (b.dataset.act === 'sync-off') { stopSync(); paintSync(); sfx('off'); return; }
    if (b.dataset.act === 'sync-link') { copy(syncLink()).then(ok => { b.textContent = ok ? t('copied') : syncLink(); setTimeout(paintSync, 1800); }); return; }
    if (b.dataset.act === 'sound') s.sound = s.sound === false;
    else if (b.dataset.act === 'water') s.water = s.water === false;
    else if (b.dataset.act === 'photos') s.photos = s.photos === false;
    else if (b.dataset.act === 'reset') s.goalOverride = null;
    else if (b.dataset.set === 'sex' || b.dataset.set === 'goal') s.body = { ...(s.body || {}), [b.dataset.set]: b.dataset.v };
    else if (b.dataset.set) s[b.dataset.set] = b.dataset.v;
    else return;
    save(); applySettings(); render(); sfx('pop');
  });
  // Typing a measurement updates the goal live, without rebuilding the card under the cursor.
  card().addEventListener('input', ev => {
    const el = ev.target, k = el.dataset.in; if (!k) return;
    const s = state.settings, body = { ...targets(s).body }, v = parseFloat(el.value);
    if (k === 'name') { s.name = el.value; save(); return; }
    if (k === 'joincode') { el.classList.remove('bad'); return; }
    if (k === 'waterGoal') { if (v >= 1 && v <= 20) { s.waterGoal = Math.round(v); save(); paintWater(false); } return; }
    if (k === 'goalOverride') s.goalOverride = v >= 800 && v <= 8000 ? Math.round(v) : null;
    else if (!isNaN(v)) {
      if (k === 'age') body.age = clamp(v, 14, 100);
      else if (k === 'height') body.height = clamp(v, 120, 230);
      else if (k === 'weight') body.weight = clamp(v, 30, 300);
      else if (k === 'lb') body.weight = clamp(lbToKg(v), 30, 300);
      else if (k === 'activity') body.activity = v;
      else if (k === 'ft' || k === 'inch') {
        const f = parseFloat(card().querySelector('[data-in=ft]').value) || 0, i = parseFloat(card().querySelector('[data-in=inch]').value) || 0;
        body.height = clamp(ftInToCm(f, i), 120, 230);
      }
      s.body = body;
    }
    save();
    document.getElementById('goalbox').innerHTML = goalBox();
    const ov = card().querySelector('[data-in=goalOverride]'); if (ov) ov.placeholder = targets(s).calculated;
    renderTotals();
  });
}
