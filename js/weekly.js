// Weekly: seven calm bars against the goal line, the averages, and one day's list.
import { state, keyOf, totalsOf } from './app.js';
import { t, num, locale, longDate } from './i18n.js';
import { targets } from './goal.js';

let sel = null;

export function renderWeekly(root) {
  const T = targets(state.settings);
  const days = [];
  for (let off = -6; off <= 0; off++) {
    const d = new Date(); d.setDate(d.getDate() + off);
    const key = keyOf(d), entries = state.days[key] || [];
    days.push({ key, d, entries, tot: totalsOf(entries) });
  }
  if (!sel || !days.some(x => x.key === sel)) sel = days[6].key;
  const max = Math.max(T.kcal * 1.2, ...days.map(x => x.tot.kcal));
  const logged = days.filter(x => x.tot.kcal > 0), n = logged.length || 1;
  const avg = k => logged.reduce((s, x) => s + x.tot[k], 0) / n;

  root.innerHTML = `
    <div class="chart">
      <div class="goal-line" style="bottom:${(T.kcal / max) * 100}%"><span>${t('goalWord')} ${num(T.kcal)}</span></div>
      ${days.map((x, i) => `<button type="button" class="col ${x.tot.kcal > 0 ? 'has' : ''} ${x.tot.kcal > T.kcal ? 'over' : ''}" data-k="${x.key}" aria-label="${longDate(x.d)}: ${num(x.tot.kcal)} kcal">
        <i style="height:${x.tot.kcal > 0 ? Math.max((x.tot.kcal / max) * 100, 3) : 0}%;animation-delay:${i * 45}ms"></i></button>`).join('')}
    </div>
    <div class="xlabels">${days.map(x => `<span data-k="${x.key}">${x.d.toLocaleDateString(locale(), { weekday: 'short' })}</span>`).join('')}</div>
    ${logged.length ? `<div class="avg">
      <div><b>${num(avg('kcal'))}</b><span>${t('avgKcal')}</span></div>
      <div><b>${num(avg('protein'))} g</b><span>${t('protein')}</span></div>
      <div><b>${num(avg('carbs'))} g</b><span>${t('carbs')}</span></div>
      <div><b>${num(avg('fat'))} g</b><span>${t('fat')}</span></div>
    </div><p class="wk-empty">${t('daysLogged', logged.length)}</p>` : `<div class="avg"><p class="wk-empty">${t('noWeek')}</p></div>`}
    <div class="wk-day" id="wkday"></div>`;

  const pick = key => {
    sel = key;
    root.querySelectorAll('[data-k]').forEach(el => el.classList.toggle('sel', el.dataset.k === key));
    const x = days.find(y => y.key === key), box = root.querySelector('#wkday');
    box.innerHTML = `<h3>${longDate(x.d)}<span>${x.tot.kcal > 0 ? num(x.tot.kcal) + ' kcal' : ''}</span></h3>`;
    const withFood = x.entries.filter(e => e.text);
    if (!withFood.length) box.insertAdjacentHTML('beforeend', `<p class="wk-empty">${t('noEntries')}</p>`);
    for (const e of withFood) {
      const row = document.createElement('div'); row.className = 'wk-item';
      const a = document.createElement('span'), b = document.createElement('span');
      a.textContent = e.text; b.textContent = e.items?.length ? `${num(totalsOf([e]).kcal)} kcal` : '';
      row.append(a, b); box.append(row);
    }
    box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  };
  root.querySelectorAll('.col').forEach(c => c.addEventListener('click', () => pick(c.dataset.k)));
  pick(sel);
}
