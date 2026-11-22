// Water, counted in glasses of 250 ml. One tap on the glass in the bar pours one in,
// a long press (or right-click) takes one away. The goal is set in millilitres.
import { state, save, curKey, refreshAll } from './app.js';
import { t, num } from './i18n.js';
import { sfx, toast } from './fx.js';

export const GLASS_ML = 250;
export const waterOf = k => (state.water && state.water[k] && state.water[k].n) || 0;
export const waterGoalMl = () => {
  const s = state.settings;
  if (s.waterGoalMl > 0) return s.waterGoalMl;
  if (s.waterGoal > 0) return s.waterGoal * GLASS_ML; // older setting, counted in glasses
  return 2000;
};
export const waterGoal = () => Math.max(1, Math.round(waterGoalMl() / GLASS_ML)); // in glasses
export const waterOn = () => state.settings.water !== false;
export const ml = n => `${num(n * GLASS_ML)} ml`;
export const amount = ml;

// The last change, so the glass that was just filled (or emptied) can animate.
export let lastPour = { k: '', from: 0, to: 0, at: 0 };

// One translucent glass. `fill` goes from 0 (empty) to 1 (full).
export function glassSVG(fill, cls = '') {
  const top = 26.2 - Math.max(0, Math.min(1, fill)) * 21.4;
  return `<svg class="glass ${cls}" viewBox="0 0 24 30" aria-hidden="true" style="--top:${top.toFixed(2)}px">
    <path class="g-body" d="M4.4 3.2h15.2l-1.75 21.3a2.9 2.9 0 0 1-2.9 2.7H9.05a2.9 2.9 0 0 1-2.9-2.7z"/>
    <g clip-path="url(#glassclip)"><g class="g-level"><path class="g-water" d="M-24 0q3-1.6 6 0t6 0t6 0t6 0t6 0t6 0t6 0t6 0v34h-48z"/><path class="g-surface" d="M-24 0q3-1.6 6 0t6 0t6 0t6 0t6 0t6 0t6 0t6 0"/></g></g>
    <path class="g-shine" d="M7.4 6.4l1.05 14.8"/>
    <path class="g-rim" d="M4.4 3.2h15.2"/>
  </svg>`;
}

export function setWater(k, n, quiet) {
  const before = waterOf(k);
  n = Math.max(0, Math.min(40, n));
  if (n === before) return;
  state.water = state.water || {};
  state.water[k] = { n, mod: Date.now() };
  lastPour = { k, from: before, to: n, at: Date.now() };
  save(); paintWater(true); refreshAll();
  if (quiet) return;
  sfx(n > before ? 'drop' : 'off');
  const g = waterGoal();
  toast(t(n > before ? 'waterAdded' : 'waterRemoved', ml(n), ml(g)), { label: t('undo'), kbd: '', run: () => setWater(k, before, true) });
}

export function paintWater(animate) {
  const el = document.getElementById('water'); if (!el) return;
  el.hidden = !waterOn();
  const n = waterOf(curKey()), g = waterGoal(), f = Math.min(n / g, 1);
  el.classList.toggle('full', n >= g);
  const svg = el.querySelector('svg.glass');
  if (!svg) el.insertAdjacentHTML('afterbegin', glassSVG(f));
  else svg.style.setProperty('--top', (26.2 - f * 21.4).toFixed(2) + 'px');
  el.querySelector('b').textContent = ml(n);
  el.title = `${t('water')}: ${ml(n)} / ${ml(g)}`;
  el.setAttribute('aria-label', el.title);
  if (animate) { el.classList.remove('splash'); void el.offsetWidth; el.classList.add('splash'); }
}

export function initWater() {
  const el = document.getElementById('water');
  let pressT, longPressed = false;
  el.addEventListener('pointerdown', ev => {
    ev.stopPropagation(); longPressed = false;
    clearTimeout(pressT);
    pressT = setTimeout(() => { longPressed = true; navigator.vibrate?.(10); setWater(curKey(), waterOf(curKey()) - 1); }, 550);
  });
  for (const n of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(n, () => clearTimeout(pressT));
  el.addEventListener('click', ev => { ev.stopPropagation(); if (!longPressed) setWater(curKey(), waterOf(curKey()) + 1); longPressed = false; });
  el.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); clearTimeout(pressT); setWater(curKey(), waterOf(curKey()) - 1); });
  paintWater(false);
}
