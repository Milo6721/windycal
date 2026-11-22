// The small offline table. Used only when the AI can't be reached; results are marked rough.
// [aliases (EN + PL stems), portion EN, portion PL, grams per portion, kcal/100g, protein, carbs, fat]
const T = [
  [['banana', 'banan'], '1 medium', '1 średni', 118, 89, 1.1, 23, 0.3],
  [['apple', 'jabłk', 'jablk'], '1 medium', '1 średnie', 180, 52, 0.3, 14, 0.2],
  [['orange', 'pomarańcz', 'pomarancz'], '1 medium', '1 średnia', 140, 47, 0.9, 12, 0.1],
  [['egg', 'jajk', 'jajek', 'jajec', 'jajo'], '1 large', '1 duże', 50, 143, 12.6, 0.7, 9.5],
  [['toast', 'bread', 'chleb', 'tost', 'kromk'], '1 slice', '1 kromka', 35, 265, 9, 49, 3.2],
  [['roll', 'bułk', 'bulk', 'kajzerk'], '1 roll', '1 bułka', 60, 275, 9, 53, 2.5],
  [['butter', 'masł', 'masl'], '1 tsp', '1 łyżeczka', 7, 717, 0.9, 0.1, 81],
  [['greek yogurt', 'jogurt grecki'], '1 bowl', '1 miseczka', 200, 97, 9, 3.6, 5],
  [['yogurt', 'yoghurt', 'jogurt'], '1 cup', '1 kubek', 150, 61, 3.5, 4.7, 3.3],
  [['honey', 'miód', 'miod'], '1 tbsp', '1 łyżka', 21, 304, 0.3, 82, 0],
  [['oatmeal', 'porridge', 'oats', 'owsiank', 'płatki owsiane'], '1 bowl', '1 miska', 250, 71, 2.5, 12, 1.5],
  [['milk', 'mlek'], '1 glass', '1 szklanka', 250, 50, 3.4, 4.8, 2],
  [['latte'], '1 medium', '1 średnia', 350, 54, 3, 4.5, 2.6],
  [['cappuccino'], '1 cup', '1 filiżanka', 200, 45, 2.6, 3.8, 2.2],
  [['coffee', 'kaw'], '1 cup', '1 filiżanka', 240, 1, 0.1, 0, 0],
  [['tea', 'herbat'], '1 cup', '1 filiżanka', 240, 1, 0, 0.2, 0],
  [['orange juice', 'juice', 'sok'], '1 glass', '1 szklanka', 250, 45, 0.7, 10, 0.2],
  [['chicken breast', 'chicken', 'kurczak', 'pierś z kurczaka'], '1 breast', '1 pierś', 150, 165, 31, 0, 3.6],
  [['rice', 'ryż', 'ryz'], '1 cup cooked', '1 porcja', 160, 130, 2.7, 28, 0.3],
  [['pasta', 'spaghetti', 'makaron'], '1 plate', '1 talerz', 220, 157, 5.8, 31, 0.9],
  [['potato', 'ziemniak'], '1 serving', '1 porcja', 200, 87, 1.9, 20, 0.1],
  [['fries', 'frytk'], '1 serving', '1 porcja', 120, 312, 3.4, 41, 15],
  [['salmon', 'łoso', 'loso'], '1 fillet', '1 filet', 150, 208, 20, 0, 13],
  [['tuna', 'tuńczyk', 'tunczyk'], '1 can', '1 puszka', 120, 116, 26, 0, 1],
  [['beef', 'steak', 'wołowin', 'stek'], '1 serving', '1 porcja', 150, 250, 26, 0, 15],
  [['pork chop', 'schabow', 'kotlet'], '1 cutlet', '1 kotlet', 150, 290, 20, 12, 18],
  [['pierogi'], '6 pieces', '6 sztuk', 240, 195, 6, 30, 5.5],
  [['bigos'], '1 bowl', '1 porcja', 300, 110, 6, 6, 7],
  [['żurek', 'zurek'], '1 bowl', '1 talerz', 350, 75, 3.5, 5, 4.5],
  [['rosół', 'rosol', 'soup', 'zup'], '1 bowl', '1 talerz', 350, 40, 2.5, 4, 1.5],
  [['pizza'], '2 slices', '2 kawałki', 220, 266, 11, 33, 10],
  [['burger', 'hamburger'], '1 burger', '1 burger', 220, 250, 13, 22, 12],
  [['sandwich', 'kanapk'], '1 sandwich', '1 kanapka', 150, 240, 11, 28, 9],
  [['salad', 'sałatk', 'salatk'], '1 bowl', '1 miska', 250, 60, 2, 6, 3.5],
  [['cheese', 'ser żółty', 'ser '], '2 slices', '2 plastry', 40, 356, 25, 2, 28],
  [['cottage cheese', 'twaróg', 'twarog'], '1 serving', '1 porcja', 150, 98, 11, 3.4, 4.3],
  [['ham', 'szynk'], '2 slices', '2 plastry', 40, 145, 21, 1.5, 6],
  [['sausage', 'kiełbas', 'kielbas'], '1 piece', '1 kawałek', 100, 300, 13, 2, 27],
  [['avocado', 'awokado'], '1/2 fruit', '1/2 owocu', 100, 160, 2, 9, 15],
  [['tomato', 'pomidor'], '1 medium', '1 średni', 120, 18, 0.9, 3.9, 0.2],
  [['almond', 'migdał', 'migdal'], 'a handful', 'garść', 30, 579, 21, 22, 50],
  [['nuts', 'peanut', 'orzech'], 'a handful', 'garść', 30, 607, 20, 21, 54],
  [['peanut butter', 'masło orzechowe'], '1 tbsp', '1 łyżka', 16, 588, 25, 20, 50],
  [['chocolate', 'czekolad'], '4 squares', '4 kostki', 25, 546, 5, 61, 31],
  [['cookie', 'biscuit', 'ciastk'], '2 cookies', '2 ciastka', 30, 480, 5.5, 65, 22],
  [['cupcake', 'muffin', 'babeczk', 'mufink'], '1 cupcake', '1 babeczka', 70, 380, 4.5, 52, 17],
  [['donut', 'doughnut', 'pączek', 'paczek', 'pączk'], '1 donut', '1 pączek', 70, 420, 6, 49, 23],
  [['croissant', 'rogalik'], '1 croissant', '1 rogalik', 60, 406, 8, 46, 21],
  [['jam', 'jelly', 'dżem', 'dzem', 'konfitur'], '1 tbsp', '1 łyżka', 20, 250, 0.4, 62, 0.1],
  [['cake', 'ciasto', 'sernik'], '1 slice', '1 kawałek', 100, 320, 5, 40, 16],
  [['ice cream', 'lody'], '2 scoops', '2 gałki', 100, 207, 3.5, 24, 11],
  [['beer', 'piwo', 'piwa'], '1 bottle', '1 butelka', 500, 43, 0.5, 3.6, 0],
  [['wine', 'wino', 'wina'], '1 glass', '1 kieliszek', 150, 83, 0.1, 2.6, 0],
  [['cola', 'coke', 'soda'], '1 can', '1 puszka', 330, 42, 0, 10.6, 0],
  [['protein shake', 'shake', 'odżywk'], '1 shake', '1 porcja', 300, 40, 8, 1.5, 0.5],
  [['granola', 'muesli', 'musli', 'cereal', 'płatki', 'platki'], '1 bowl', '1 miska', 60, 420, 10, 64, 14],
  [['pancake', 'naleśnik', 'nalesnik'], '2 pancakes', '2 naleśniki', 150, 200, 6, 28, 7],
  [['hummus'], '2 tbsp', '2 łyżki', 40, 166, 8, 14, 10],
  [['olive oil', 'oliw', 'olej'], '1 tbsp', '1 łyżka', 14, 884, 0, 0, 100],
];

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, half: .5, jeden: 1, jedna: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, pięć: 5, pół: .5, pol: .5 };

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// one wrong letter is fine: "salamon" still finds salmon, "bananna" still finds banana
function near(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
const WORDS1 = T.flatMap((row, i) => row[0].filter(a => /^[\p{L}]{5,}$/u.test(a)).map(a => ({ a, i })));
function fuzzy(part) {
  for (const w of part.split(/[^\p{L}]+/u)) {
    if (w.length < 5) continue;
    const hit = WORDS1.find(x => near(w, x.a) || (w.length > x.a.length && near(w.slice(0, x.a.length + 1), x.a) && w.startsWith(x.a.slice(0, 3))));
    if (hit) return hit;
  }
  return null;
}
const ALIASES = T.flatMap((row, i) => row[0].map(a => ({ a, i }))).sort((x, y) => y.a.length - x.a.length)
  .map(x => ({ ...x, re: new RegExp('(^|[^\\p{L}])' + esc(x.a), 'u') }));

export function lookup(text, lang) {
  const parts = text.toLowerCase().split(/,|\+|&|\s+(?:and|with|plus|i|z|ze|oraz)\s+/u).map(s => s.trim()).filter(Boolean);
  const items = [];
  for (const part of parts) {
    const hit = ALIASES.find(x => x.re.test(part)) || fuzzy(part);
    if (!hit) continue;
    const [, pEn, pPl, per, kcal, p, c, f] = T[hit.i];
    let grams = per, portion = lang === 'pl' ? pPl : pEn;
    const g = part.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/);
    const n = part.match(/^(\d+(?:[.,]\d+)?)(?!\s*(?:kg|g|ml|l)\b)/);
    const w = part.match(/^([\p{L}]+)\s/u);
    if (g) {
      grams = parseFloat(g[1].replace(',', '.')) * (g[2] === 'kg' || g[2] === 'l' ? 1000 : 1);
      portion = `${g[1]} ${g[2]}`;
    } else {
      const q = n ? parseFloat(n[1].replace(',', '.')) : (w && WORDS[w[1]]) || 1;
      if (q !== 1) { grams = per * q; portion = `${q} × ${portion}`; }
    }
    const k = grams / 100;
    items.push({ name: part, portion, grams: Math.round(grams), calories: Math.round(kcal * k), protein: +(p * k).toFixed(1), carbs: +(c * k).toFixed(1), fat: +(f * k).toFixed(1), confidence: 'low' });
  }
  return items;
}
