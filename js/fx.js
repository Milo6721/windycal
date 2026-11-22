// Motion and sound: a real spring, counting numbers, and one soft chime.

// A damped spring that keeps its velocity when retargeted mid-flight.
export class Spring {
  constructor(onUpdate, { stiffness = 120, damping = 14 } = {}) {
    this.v = 0; this.x = 0; this.to = 0; this.k = stiffness; this.c = damping; this.onUpdate = onUpdate; this.raf = 0;
  }
  jump(x) { cancelAnimationFrame(this.raf); this.raf = 0; this.x = this.to = x; this.v = 0; this.onUpdate(x); }
  set(to) {
    this.to = to;
    if (this.raf) return;
    let last = performance.now();
    const step = now => {
      let dt = Math.min((now - last) / 1000, 0.032); last = now;
      for (let i = 0; i < 2; i++) { // two sub-steps keep it stable
        const a = -this.k * (this.x - this.to) - this.c * this.v;
        this.v += a * (dt / 2); this.x += this.v * (dt / 2);
      }
      if (Math.abs(this.v) < 0.0005 && Math.abs(this.x - this.to) < 0.0005) { this.x = this.to; this.v = 0; this.raf = 0; this.onUpdate(this.x); return; }
      this.onUpdate(this.x);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

// Count a number up (or down) to its value. `instant` skips the animation.
export function countTo(el, to, fmt = n => Math.round(n), instant = false, ms = 620) {
  const from = el._n ?? 0;
  cancelAnimationFrame(el._raf);
  el._n = to;
  if (instant || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / ms, 1), e = 1 - Math.pow(1 - p, 4);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

let ctx;
let soundOn = true;
export const setSound = on => { soundOn = !!on; };
function tone(freq, at, dur, gain) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + dur + 0.02);
}
export function sfx(name) {
  if (!soundOn) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + 0.01;
    if (name === 'land') { tone(784, t, 0.22, 0.045); tone(1175, t + 0.07, 0.32, 0.035); }
    else if (name === 'pop') tone(620, t, 0.12, 0.04);
    else if (name === 'off') tone(330, t, 0.16, 0.035);
  } catch {}
}

let toastTimer;
export function toast(text, action) {
  const el = document.getElementById('toast');
  el.innerHTML = '';
  el.append(Object.assign(document.createElement('span'), { textContent: text }));
  el.classList.toggle('plain', !action);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    if (action.kbd) b.append(Object.assign(document.createElement('kbd'), { textContent: action.kbd }));
    b.onclick = () => { el.classList.remove('show'); action.run(); };
    el.append(b);
  }
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4200 : 2400);
}
