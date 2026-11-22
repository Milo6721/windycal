// Swipe a line to the left to delete it: the line follows your finger (or mouse), a soft red
// layer with a bin opens up behind it, and past a point the bin pops to say "let go and it's gone".
// Let go there (or flick quickly) and the line slides away; anywhere else it springs back.
const BIN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l1 12a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6M14 11v6"/></svg>';

export function enableSwipe(container, selector, onDelete, label) {
  let s = null, justSwiped = 0;
  const bgOf = row => {
    let bg = row.querySelector(':scope > .swipe-bg');
    if (!bg) { bg = document.createElement('div'); bg.className = 'swipe-bg'; bg.innerHTML = `<span>${BIN}<b></b></span>`; row.prepend(bg); }
    bg.querySelector('b').textContent = label();
    return bg;
  };
  container.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const row = ev.target.closest(selector);
    if (!row || !container.contains(row) || ev.target.closest('.mic, .x, input[type=range]')) return;
    s = { row, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, dx: 0, on: false, t: [] };
  });
  container.addEventListener('pointermove', ev => {
    if (!s || ev.pointerId !== s.id) return;
    const dx = ev.clientX - s.x0, dy = ev.clientY - s.y0;
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; } // scrolling, not swiping
      if (dx > -12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      s.on = true; s.w = s.row.offsetWidth; s.bg = bgOf(s.row);
      try { s.row.setPointerCapture(s.id); } catch {}
      document.activeElement?.blur?.(); getSelection()?.removeAllRanges();
      s.row.classList.add('swiping'); document.body.classList.add('swipe-lock');
    }
    // follows the finger 1:1 to the left, a little resistance to the right
    s.dx = dx < 0 ? dx : dx * 0.15;
    s.t.push([performance.now(), s.dx]); if (s.t.length > 5) s.t.shift();
    s.row.style.setProperty('--sx', s.dx + 'px');
    const p = Math.min(1, -s.dx / (s.w * 0.4));
    s.bg.style.opacity = Math.min(1, p * 1.6);
    const armed = -s.dx > s.w * 0.4;
    if (armed !== s.row.classList.contains('armed')) { s.row.classList.toggle('armed', armed); if (armed) navigator.vibrate?.(8); }
  });
  const end = ev => {
    if (!s || ev.pointerId !== s.id) return;
    const d = s; s = null;
    if (!d.on) return;
    justSwiped = Date.now();
    document.body.classList.remove('swipe-lock');
    const [a, b] = [d.t[0], d.t[d.t.length - 1]];
    const v = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0; // px per ms
    d.row.classList.remove('swiping');
    if (-d.dx > d.w * 0.4 || (v < -0.9 && -d.dx > 40)) {
      d.row.classList.add('swiped');
      d.row.style.setProperty('--sx', -(d.w + 40) + 'px');
      d.bg.style.opacity = 1;
      setTimeout(() => onDelete(d.row), 230);
    } else {
      d.row.classList.remove('armed');
      d.row.style.setProperty('--sx', '0px');
      d.bg.style.opacity = 0;
    }
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
  // a swipe must not also count as a click on the line
  container.addEventListener('click', ev => { if (Date.now() - justSwiped < 350) { ev.stopPropagation(); ev.preventDefault(); } }, true);
}
