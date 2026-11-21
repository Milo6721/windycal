// Settings: the same paper card as Stickly's.
import { state, save, applySettings, renderTotals } from './app.js';
import { t, num } from './i18n.js';
import { targets, cmToFtIn, ftInToCm, kgToLb, lbToKg } from './goal.js';
import { sfx } from './fx.js';

const sheet = () => document.getElementById('setsheet');
const card = () => document.getElementById('setcard');
export const settingsOpen = () => sheet().classList.contains('open');
export function openSettings() { render(); sheet().classList.add('open'); sfx('pop'); }
export function closeSettings() { sheet().classList.remove('open'); }

const seg = (key, cur, opts) => `<div class="bseg">${opts.map(([v, l]) => `<button type="button" data-set="${key}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function goalBox() {
  const T = targets(state.settings), own = state.settings.goalOverride > 0;
  return `<div><div class="g-n">${num(T.kcal)}<small>kcal</small></div>
    <div class="g-m">${t('protein')} ${T.protein} g · ${t('carbs')} ${T.carbs} g · ${t('fat')} ${T.fat} g</div>
    <div class="g-m">${own ? `${t('own')} · ${t('calc').toLowerCase()}: ${num(T.calculated)}` : t('calc')}</div></div>
    ${own ? `<button type="button" class="ghostbtn" data-act="reset">${t('reset')}</button>` : ''}`;
}

function render() {
  const s = state.settings, T = targets(s), b = T.body, imp = s.units === 'imperial';
  const [ft, inch] = cmToFtIn(b.height);
  const top = card().scrollTop;
  card().innerHTML = `
  <div class="c-head"><div><h2>${t('settings')}</h2><p>${t('settingsSub')}</p></div>
    <button type="button" data-act="close" title="${t('close')} (Esc)" aria-label="${t('close')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>

  <div class="sec"><h3>${t('you')}</h3>
    <div class="st-row"><span>${t('name')}</span><input type="text" data-in="name" value="${esc(s.name)}" placeholder="${t('namePh')}" maxlength="24" autocomplete="off"></div></div>

  <div class="sec"><h3>${t('body')}</h3>
    <div class="st-row"><span>${t('sex')}</span>${seg('sex', b.sex, [['male', t('male')], ['female', t('female')]])}</div>
    <div class="st-row"><span>${t('age')}</span><div class="num"><input type="number" inputmode="numeric" data-in="age" value="${b.age}" min="14" max="100">${t('years')}</div></div>
    <div class="st-row"><span>${t('height')}</span><div class="num">${imp
      ? `<input type="number" inputmode="numeric" data-in="ft" value="${ft}" min="3" max="8">ft <input type="number" inputmode="numeric" data-in="inch" value="${inch}" min="0" max="11">in`
      : `<input type="number" inputmode="numeric" data-in="height" value="${b.height}" min="120" max="230">cm`}</div></div>
    <div class="st-row"><span>${t('weight')}</span><div class="num">${imp
      ? `<input type="number" inputmode="decimal" data-in="lb" value="${kgToLb(b.weight)}" min="70" max="600">lb`
      : `<input type="number" inputmode="decimal" data-in="weight" value="${b.weight}" min="30" max="300" step="0.5">kg`}</div></div>
    <div class="st-row"><span>${t('activity')}</span><select data-in="activity">${t('act').map((l, i) => `<option value="${i}" ${+b.activity === i ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="st-row"><span>${t('goal')}</span>${seg('goal', b.goal, [['lose', t('lose')], ['maintain', t('maintain')], ['gain', t('gain')]])}</div></div>

  <div class="sec"><h3>${t('daily')}</h3>
    <div class="goalbox" id="goalbox">${goalBox()}</div>
    <div class="st-row"><span>${t('override')}<small>${t('overrideSub')}</small></span><div class="num"><input type="number" inputmode="numeric" data-in="goalOverride" value="${s.goalOverride > 0 ? s.goalOverride : ''}" placeholder="${T.calculated}" min="800" max="8000" step="10">kcal</div></div>
    <p class="fine">${t('formula')}</p></div>

  <div class="sec"><h3>${t('look')}</h3>
    <div class="st-row"><span>${t('appearance')}</span>${seg('theme', s.theme || 'auto', [['auto', t('auto')], ['light', t('light')], ['dark', t('dark')]])}</div>
    <div class="st-row"><span>${t('sound')}</span><button type="button" class="switch ${s.sound !== false ? 'on' : ''}" data-act="sound" role="switch" aria-checked="${s.sound !== false}"><i></i></button></div>
    <div class="st-row"><span>${t('units')}</span>${seg('units', s.units || 'metric', [['metric', t('metric')], ['imperial', t('imperial')]])}</div>
    <div class="st-row"><span>${t('language')}</span>${seg('lang', s.lang || 'en', [['en', 'English'], ['pl', 'Polski']])}</div></div>

  <div class="sec"><h3>${t('shortcuts')}</h3>
    <div class="keys"><span><kbd>N</kbd> / <kbd>/</kbd> ${t('kFocus')}</span><span><kbd>Enter</kbd> ${t('kEnter')}</span><span><kbd>⌘Z</kbd> ${t('kUndo')} · <kbd>⇧⌘Z</kbd> ${t('kRedo')}</span><span><kbd>Tab</kbd> ${t('kTab')}</span><span><kbd>⌘,</kbd> ${t('kSet')}</span></div></div>

  <div class="sec"><h3>${t('data')}</h3><p class="fine" style="margin:0">${t('stored')}</p></div>`;
  card().scrollTop = top;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function initSettings() {
  sheet().addEventListener('mousedown', ev => { if (ev.target === sheet()) closeSettings(); });
  card().addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const s = state.settings;
    if (b.dataset.act === 'close') return closeSettings();
    if (b.dataset.act === 'sound') s.sound = s.sound === false;
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
