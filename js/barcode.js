// Scan a barcode: the camera looks for it live, then the product's label values come from
// Open Food Facts, a free and open food database (only the barcode number is sent there).
// Where the browser cannot read barcodes from the camera, the number can be typed instead.
import { t, getLang, num } from './i18n.js';
import { sfx, toast } from './fx.js';

let el, video, stream, detector, raf, busy = false, onFound = null;

function build() {
  el = document.createElement('div'); el.className = 'scanner'; el.id = 'scanner';
  el.innerHTML = `<div class="sc-card" role="dialog" aria-modal="true">
    <div class="sc-head"><b>${t('scanTitle')}</b><button type="button" class="sc-x" aria-label="${t('close')}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="sc-view"><video playsinline muted></video><i class="sc-frame"></i><i class="sc-line"></i><p class="sc-msg"></p></div>
    <form class="sc-type"><input inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="${t('scanType')}" autocomplete="off"><button type="submit">${t('scanFind')}</button></form>
    <p class="sc-res" hidden></p>
  </div>`;
  document.body.append(el);
  video = el.querySelector('video');
  el.querySelector('.sc-x').onclick = closeScanner;
  el.addEventListener('pointerdown', ev => { if (ev.target === el) closeScanner(); });
  el.querySelector('form').onsubmit = ev => { ev.preventDefault(); const v = el.querySelector('input').value.replace(/\D/g, ''); if (v.length >= 8) lookup(v); };
  addEventListener('keydown', ev => { if (ev.key === 'Escape' && el.classList.contains('open')) closeScanner(); });
}

export async function openScanner(cb) {
  onFound = cb; if (!el) build();
  busy = false;
  el.querySelector('input').value = ''; el.querySelector('.sc-res').hidden = true;
  const msg = el.querySelector('.sc-msg'); msg.textContent = t('scanLook');
  el.classList.add('open'); sfx('pop');
  el.classList.remove('no-cam');
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    el.classList.add('no-cam'); msg.textContent = t('scanNoCam'); el.querySelector('input').focus(); return;
  }
  try {
    detector = detector || new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    if (!el.classList.contains('open')) return stopCam();
    video.srcObject = stream; await video.play();
    const tick = async () => {
      if (!el.classList.contains('open') || busy) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) { navigator.vibrate?.(15); lookup(codes[0].rawValue); return; }
      } catch {}
      raf = setTimeout(tick, 180);
    };
    tick();
  } catch {
    el.classList.add('no-cam'); msg.textContent = t('scanNoCam');
  }
}

function stopCam() { clearTimeout(raf); if (stream) stream.getTracks().forEach(tr => tr.stop()); stream = null; if (video) video.srcObject = null; }
export function closeScanner() { if (!el) return; el.classList.remove('open'); stopCam(); }

// Label values per 100 g, scaled to one serving when the label gives one.
async function lookup(code) {
  if (busy) return; busy = true;
  const res = el.querySelector('.sc-res'); res.hidden = false; res.className = 'sc-res wait'; res.textContent = t('scanLooking');
  el.querySelector('.sc-msg').textContent = code;
  let p = null;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_${getLang()},brands,nutriments,serving_quantity,serving_size,quantity`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (j.status === 1 && j.product) p = j.product;
  } catch {}
  if (!p || !p.nutriments || p.nutriments['energy-kcal_100g'] == null) {
    res.className = 'sc-res bad'; res.textContent = t('scanNotFound');
    busy = false; sfx('off');
    if (stream) setTimeout(() => { if (el.classList.contains('open')) openScanner(onFound); }, 1800);
    return;
  }
  const n = p.nutriments, serving = +p.serving_quantity > 0 ? +p.serving_quantity : 100;
  const k = serving / 100, name = (p[`product_name_${getLang()}`] || p.product_name || code).trim();
  const brand = (p.brands || '').split(',')[0].trim();
  const text = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name;
  const item = {
    name: name.toLowerCase(), portion: p.serving_size || `${serving} g`, grams: Math.round(serving),
    calories: Math.round(n['energy-kcal_100g'] * k), protein: +((n.proteins_100g || 0) * k).toFixed(1),
    carbs: +((n.carbohydrates_100g || 0) * k).toFixed(1), fat: +((n.fat_100g || 0) * k).toFixed(1), confidence: 'high',
  };
  res.className = 'sc-res ok'; res.textContent = `${text} · ${num(item.calories)} kcal`;
  sfx('land');
  setTimeout(() => { closeScanner(); onFound && onFound({ code, name: text, item }); toast(t('scanAdded')); }, 650);
}
