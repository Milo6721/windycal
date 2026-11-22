// Sync between your phone and computer.
// One device makes a sync code; the other joins with it (or with a link that carries it).
// Everything is locked with the code on the device itself (AES-GCM) before it leaves, so the
// server only keeps a box it cannot open. When both devices changed the same day, the newer one wins.
import { state, save } from './app.js';

const LS = 'windy.sync.v1';
const listeners = new Set();
let conf = null;               // { code, rev, last }
let keyCache = null, idCache = null;
let status = 'off';            // off | syncing | ok | offline | no_store | error
let timer = 0, running = null, again = false, pollT = 0, hot = 0;

try { conf = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
const persist = () => { try { conf ? localStorage.setItem(LS, JSON.stringify(conf)) : localStorage.removeItem(LS); } catch {} };
const setStatus = s => { status = s; listeners.forEach(f => f()); };
export const syncInfo = () => ({ on: !!conf, code: conf?.code || '', last: conf?.last || 0, status });
export const onSyncChange = f => { listeners.add(f); return () => listeners.delete(f); };

// ---------- the code ----------
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U: easy to read and type
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const s = [...b].map(x => ALPHA[x & 31]).join(''); // 16 characters, 80 bits
  return s.match(/.{4}/g).join('-');
}
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
const validCode = c => cleanCode(c).length === 16;

async function keys() {
  if (keyCache && idCache) return { key: keyCache, id: idCache };
  const raw = new TextEncoder().encode(cleanCode(conf.code));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...new TextEncoder().encode('windy-id:'), ...raw])));
  idCache = [...hash].map(x => x.toString(16).padStart(2, '0')).join('');
  const base = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  keyCache = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('windy-sync-v1'), iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { key: keyCache, id: idCache };
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function lock(obj) {
  const { key } = await keys(), iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return b64(iv) + '.' + b64(data);
}
async function unlock(s) {
  const { key } = await keys(), [iv, data] = s.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---------- talking to the server ----------
async function call(body) {
  const r = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

// What travels: the days with their change times, water, and the settings.
const snapshot = () => ({ v: 1, days: state.days, dayMod: state.dayMod || {}, water: state.water || {}, settings: state.settings, settingsMod: state.settingsMod || 0 });

// Newer wins, day by day. Returns whether anything here changed, and whether the server is behind.
function merge(remote) {
  let changedHere = false, serverBehind = false, settingsChanged = false;
  const join = !!conf.join; // a device that just joined takes what is already there when times are equal
  const keysAll = new Set([...Object.keys(state.days), ...Object.keys(remote.days || {}), ...Object.keys(remote.dayMod || {})]);
  for (const k of keysAll) {
    const lm = state.dayMod[k] || 0, rm = (remote.dayMod || {})[k] || 0;
    const rd = (remote.days || {})[k];
    if (rd && (rm > lm || (rm === lm && (join || !state.days[k]?.length)) && JSON.stringify(rd) !== JSON.stringify(state.days[k] || []))) { state.days[k] = rd; state.dayMod[k] = rm; changedHere = true; }
    else if (lm > rm || (!rd && state.days[k]?.length)) serverBehind = true;
  }
  for (const k of new Set([...Object.keys(state.water || {}), ...Object.keys(remote.water || {})])) {
    const l = (state.water || {})[k], r = (remote.water || {})[k];
    if (r && (!l || r.mod > l.mod)) { state.water = state.water || {}; state.water[k] = r; changedHere = true; }
    else if (l && (!r || l.mod > r.mod)) serverBehind = true;
  }
  if (remote.settings && ((remote.settingsMod || 0) > (state.settingsMod || 0) || (join && (remote.settingsMod || 0) === (state.settingsMod || 0)))) { if (JSON.stringify(remote.settings) !== JSON.stringify(state.settings)) settingsChanged = true; state.settings = remote.settings; state.settingsMod = remote.settingsMod; changedHere = true; }
  else if ((state.settingsMod || 0) > (remote.settingsMod || 0)) serverBehind = true;
  return { changedHere, serverBehind, settingsChanged };
}

// Pull, merge, and push back if this device had something newer. Safe to call any time.
export async function syncNow() {
  if (!conf) return;
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { id } = await keys();
        const got = await call({ op: 'get', id });
        if (got.status === 503) return setStatus('no_store');
        if (got.status !== 200) return setStatus('error');
        conf.rev = got.rev || '0';
        let result = { changedHere: false, serverBehind: true };
        if (got.data) {
          let remote;
          try { remote = await unlock(got.data); } catch { return setStatus('error'); }
          result = merge(remote);
          if (result.changedHere) { save({ fromSync: true }); dispatchEvent(new CustomEvent('windy:synced', { detail: { settings: result.settingsChanged } })); }
        }
        if (!result.serverBehind) break;
        const put = await call({ op: 'put', id, data: await lock(snapshot()), rev: got.rev || '0' });
        if (put.status === 200) { conf.rev = put.rev; break; }
        if (put.status !== 409) return setStatus(put.status === 503 ? 'no_store' : 'error');
        // another device saved in between: read again and merge with that
      }
      conf.last = Date.now(); delete conf.join; persist(); setStatus('ok');
    } catch { setStatus(navigator.onLine === false ? 'offline' : 'error'); }
  })();
  try { await running; } finally {
    running = null;
    if (again) { again = false; syncNow(); }
  }
}

export function startSync(code) {
  conf = { code: code ? cleanCode(code).match(/.{4}/g).join('-') : newCode(), last: 0, join: !!code };
  keyCache = idCache = null; persist(); setStatus('syncing');
  return syncNow().then(() => schedule());
}
export function stopSync() { clearTimeout(pollT); conf = null; keyCache = idCache = null; persist(); setStatus('off'); }
export const canJoin = validCode;
export const syncLink = () => conf ? `${location.origin}${location.pathname}#sync=${conf.code}` : '';

// joining from a link: …/#sync=XXXX-XXXX-XXXX-XXXX (also when Windy is already open in that tab)
function joinFromLink() {
  const m = location.hash.match(/sync=([0-9A-Za-z-]{16,24})/);
  if (!m || !validCode(m[1])) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (!conf || cleanCode(conf.code) !== cleanCode(m[1])) { startSync(m[1]); dispatchEvent(new Event('windy:joined')); }
}
export function initSync() {
  joinFromLink();
  addEventListener('hashchange', joinFromLink);
  if (conf) setStatus('ok');
  addEventListener('windy:saved', () => { if (!conf) return; hot = Date.now(); clearTimeout(timer); timer = setTimeout(syncNow, 700); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { syncNow(); schedule(0); } });
  addEventListener('online', () => syncNow());
  syncNow().then(() => schedule());
}

// While Windy is open, it asks the server every few seconds only "which version is the newest?"
// (one tiny read). When another device saved something, it fetches and shows it right away.
// Busy moments are checked every 2.5 seconds, quiet ones every 5; nothing is checked while hidden.
function schedule(ms) {
  clearTimeout(pollT);
  if (!conf) return;
  pollT = setTimeout(poll, ms != null ? ms : Date.now() - hot < 120000 ? 2500 : 5000);
}
async function poll() {
  if (!conf) return;
  if (document.visibilityState !== 'visible') return; // resumes on visibilitychange
  if (!running && navigator.onLine !== false && status !== 'no_store') {
    try {
      const { id } = await keys();
      const r = await call({ op: 'rev', id });
      if (r.status === 200 && conf && String(r.rev) !== String(conf.rev || '0')) { hot = Date.now(); await syncNow(); }
      else if (r.status === 503) setStatus('no_store');
    } catch {}
  }
  schedule();
}
