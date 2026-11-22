// Water: one tap on the drop in the bar adds a glass, a long press (or right-click) takes one away.
// The drop fills with a little wave as the day goes on.
import { state, save, curKey, refreshAll } from './app.js';
import { t, num } from './i18n.js';
import { sfx, toast } from './fx.js';

export const GLASS_ML = 250;
export const waterOf = k => (state.water && state.water[k] && state.water[k].n) || 0;
export const waterGoal = () => state.settings.waterGoal > 0 ? state.settings.waterGoal : 8;
export const waterOn = () => state.settings.water !== false;
export const amount = n => state.settings.units === 'imperial' ? `${num(n * 8.45)} oz` : n * GLASS_ML >= 1000 ? `${(n * GLASS_ML / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} l` : `${n * GLASS_ML} ml`;

export function setWater(k, n, quiet) {
  const before = waterOf(k);
  n = Math.max(0, Math.min(30, n));
  if (n === before) return;
  state.water = state.water || {};
  state.water[k] = { n, mod: Date.now() };
  save(); paintWater(n > before); refreshAll();
  if (quiet) return;
  sfx(n > before ? 'drop' : 'off');
  toast(t(n > before ? 'waterAdded' : 'waterRemoved', n, waterGoal()), { label: t('undo'), kbd: '', run: () => setWater(k, before, true) });
}

export function paintWater(splash) {
  const el = document.getElementById('water'); if (!el) return;
  el.hidden = !waterOn();
  const n = waterOf(curKey()), g = waterGoal(), f = Math.min(n / g, 1);
  el.style.setProperty('--fill', f.toFixed(3));
  el.classList.toggle('full', n >= g);
  el.querySelector('b').textContent = `${n}/${g}`;
  el.title = `${t('water')}: ${n} / ${g} · ${amount(n)}`;
  el.setAttribute('aria-label', el.title);
  if (splash) { el.classList.remove('splash'); void el.offsetWidth; el.classList.add('splash'); }
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
