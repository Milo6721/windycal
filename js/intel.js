// Windy Intelligence: learns the foods you write and finishes them for you.
// Every line you've logged (and each part of it between commas or "and") becomes a phrase.
// Phrases you write often, and lately, rank first. While you type, the best phrase that
// starts with the word you're on is shown in grey after the cursor.

// where one food ends and the next begins: "coffee, yo" → completes "yo"
const SEP = /(,\s*|\s*\+\s*|\s+(?:and|with|i|z|oraz)\s+)/gi;
const HAS_SEP = new RegExp(SEP.source, 'i');

let index = null, dirty = true;
export const relearn = () => { dirty = true; };

function build(days) {
  const map = new Map(), now = Date.now();
  const add = (phrase, ts) => {
    const p = phrase.replace(/\s+/g, ' ').trim();
    if (p.length < 3 || p.length > 80) return;
    const k = p.toLowerCase(), age = Math.max(0, (now - (ts || now)) / 864e5);
    const o = map.get(k) || { text: p, score: 0, last: 0 };
    o.score += 1 + 1 / (1 + age / 7); // each time counts, recent times count a bit more
    if ((ts || 0) >= o.last) { o.last = ts || 0; o.text = p; }  // keep the spelling you used last
    map.set(k, o);
  };
  for (const k in days) for (const e of days[k] || []) {
    if (!e?.text || e.fromPhoto && !e.items?.length) continue;
    add(e.text, e.ts);
    const parts = e.text.split(SEP).filter((x, i) => i % 2 === 0);
    if (parts.length > 1) for (const part of parts) add(part, e.ts);
  }
  index = [...map.values()].sort((a, b) => b.score - a.score || b.last - a.last);
  dirty = false;
}

// The rest of the phrase to show after what was typed, or '' when nothing fits.
export function complete(days, typed) {
  if (dirty || !index) build(days);
  let start = 0;
  for (const m of typed.matchAll(SEP)) start = m.index + m[0].length;
  const frag = typed.slice(start).replace(/^\s+/, '');
  if (frag.length < 2 || /\s$/.test(typed) && frag.trim().length < 3) return '';
  const low = frag.toLowerCase();
  const whole = start === 0; // on the first food, a whole earlier line may be the best guess
  for (const o of index) {
    const k = o.text.toLowerCase();
    if (k.length > low.length && k.startsWith(low) && (whole || !HAS_SEP.test(o.text))) return o.text.slice(frag.length);
  }
  return '';
}
