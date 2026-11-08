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
function mealsForDay(plan, day) {
  return plan.filter((item) => item.day === day);
}

function recipeForItem(item, recipes) {
  return recipes.find((recipe) => recipe.id === item.recipeId);
}

function macroTotals(items, recipes, person) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items) {
    const recipe = recipeForItem(item, recipes);
    const portion = item.portions?.[person];
    if (!recipe || !Number.isFinite(portion) || portion <= 0) return null;
    for (const key of Object.keys(totals)) {
      if (!Number.isFinite(recipe[key])) return null;
      totals[key] += recipe[key] * portion;
    }
  }
  return totals;
}

function sodiumTotal(items, recipes, person) {
  let total = 0;
  for (const item of items) {
    const recipe = recipeForItem(item, recipes);
    if (!Number.isFinite(recipe?.sodiumMg) || recipe.sodiumMg < 0) return null;
    total += recipe.sodiumMg * item.portions[person];
  }
  return total;
}

function vitaminDSummary(items, recipes, person) {
  let amount = 0;
  let known = 0;
  for (const item of items) {
    const recipe = recipeForItem(item, recipes);
    if (Number.isFinite(recipe?.vitaminDMcg) && recipe.vitaminDMcg >= 0) {
      amount += recipe.vitaminDMcg * item.portions[person];
      known++;
    }
  }
  return { knownMcg: amount, knownMeals: known, totalMeals: items.length };
}

function extraNutrientSummary(items, recipes, person) {
  /** @type {Record<string,{amount:number,known:number,total:number}>} */
  const extras = {};
  for (const nutrient of nutrients) {
    let amount = 0;
    let known = 0;
    for (const item of items) {
      const recipe = recipeForItem(item, recipes);
      if (Number.isFinite(recipe?.[nutrient.key]) && recipe[nutrient.key] >= 0) {
        amount += recipe[nutrient.key] * item.portions[person];
        known++;
      }
    }
    extras[nutrient.key] = { amount, known, total: items.length };
  }
  return extras;
}

export function daySummary(plan, recipes, day, person) {
  const items = mealsForDay(plan, day);
  if (items.length !== 4) return null;
  const totals = macroTotals(items, recipes, person);
  if (!totals) return null;
  return {
    ...totals,
    sodiumMg: sodiumTotal(items, recipes, person),
    extras: extraNutrientSummary(items, recipes, person),
    vitaminD: vitaminDSummary(items, recipes, person),
  };
}
