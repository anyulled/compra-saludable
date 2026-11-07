import { nutrients } from "./nutrients.mjs";
/** Capture all inputs that affect optimization; older plans without this snapshot need recalculation. */
export function planBasis(data) {
  return JSON.stringify([
    "nutrition-variety-v2",
    data.profiles,
    data.products,
    data.recipes,
    data.optimizationOptions || {},
  ]);
}
export function daySummary(plan, recipes, day, person) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const items = plan.filter((x) => x.day === day);
  if (items.length !== 4) return null;
  for (const item of items) {
    const r = recipes.find((x) => x.id === item.recipeId);
    const portion = item.portions?.[person];
    if (!r || !Number.isFinite(portion) || portion <= 0) return null;
    for (const key of Object.keys(totals)) {
      if (!Number.isFinite(r[key])) return null;
      totals[key] += r[key] * portion;
    }
  }
  let sodiumMg = 0;
  for (const item of items) {
    const recipe = recipes.find((x) => x.id === item.recipeId);
    if (!Number.isFinite(recipe.sodiumMg) || recipe.sodiumMg < 0) {
      sodiumMg = null;
      break;
    }
    sodiumMg += recipe.sodiumMg * item.portions[person];
  }
  let vitaminDTotal = 0,
    vitaminDKnown = 0;
  for (const item of items) {
    const recipe = recipes.find((x) => x.id === item.recipeId);
    if (Number.isFinite(recipe.vitaminDMcg) && recipe.vitaminDMcg >= 0) {
      vitaminDTotal += recipe.vitaminDMcg * item.portions[person];
      vitaminDKnown++;
    }
  }
  /** @type {Record<string,{amount:number,known:number,total:number}>} */
  const extras = {};
  for (const nutrient of nutrients) {
    let amount = 0,
      known = 0;
    for (const item of items) {
      const recipe = recipes.find((r) => r.id === item.recipeId);
      if (Number.isFinite(recipe[nutrient.key]) && recipe[nutrient.key] >= 0) {
        amount += recipe[nutrient.key] * item.portions[person];
        known++;
      }
    }
    extras[nutrient.key] = { amount, known, total: items.length };
  }
  return {
    ...totals,
    sodiumMg,
    extras,
    vitaminD: {
      knownMcg: vitaminDTotal,
      knownMeals: vitaminDKnown,
      totalMeals: items.length,
    },
  };
}
