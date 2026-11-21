// Daily goal from body measurements: Mifflin–St Jeor, then activity, then goal.
export const DEFAULT_BODY = { sex: 'male', age: 30, height: 178, weight: 75, activity: 1, goal: 'maintain' };
const FACTORS = [1.2, 1.375, 1.55, 1.725];

export function calcGoal(b) {
  const bmr = 10 * b.weight + 6.25 * b.height - 5 * b.age + (b.sex === 'female' ? -161 : 5);
  let kcal = bmr * (FACTORS[b.activity] ?? 1.375);
  if (b.goal === 'lose') kcal = Math.max(kcal - 500, 1200);
  if (b.goal === 'gain') kcal += 300;
  return Math.round(kcal / 10) * 10;
}

// Protein by body weight, fat as a share of calories, carbs take the rest.
export function macroTargets(kcal, b) {
  const protein = Math.round(b.weight * (b.goal === 'lose' ? 2 : 1.8));
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

export function targets(settings) {
  const body = { ...DEFAULT_BODY, ...(settings.body || {}) };
  const calculated = calcGoal(body);
  const kcal = settings.goalOverride > 0 ? settings.goalOverride : calculated;
  return { kcal, calculated, body, ...macroTargets(kcal, body) };
}

export const cmToFtIn = cm => { const t = Math.round(cm / 2.54); return [Math.floor(t / 12), t % 12]; };
export const ftInToCm = (ft, inch) => Math.round((ft * 12 + inch) * 2.54);
export const kgToLb = kg => Math.round(kg * 2.20462);
export const lbToKg = lb => Math.round((lb / 2.20462) * 10) / 10;
