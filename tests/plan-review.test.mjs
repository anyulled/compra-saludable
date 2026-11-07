import test from "node:test";
import assert from "node:assert/strict";
import { daySummary, planBasis } from "../lib/plan-review.mjs";
test("calcula los nutrientes individuales con las raciones", () => {
  const recipe = { id: "r", calories: 400, protein: 20, carbs: 30, fat: 10 };
  const plan = Array.from({ length: 4 }, () => ({
    day: 0,
    recipeId: "r",
    portions: [1, 1.5],
  }));
  const sum = daySummary(plan, [recipe], 0, 1);
  assert.deepEqual(
    [sum.calories, sum.protein, sum.carbs, sum.fat, sum.sodiumMg],
    [2400, 120, 180, 60, null],
  );
  assert.deepEqual(sum.vitaminD, { knownMcg: 0, knownMeals: 0, totalMeals: 4 });
  assert.equal(daySummary(plan, [], 0, 1), null);
});
test("la huella cambia cuando cambia un objetivo o un producto", () => {
  const a = {
    profiles: [{ calories: 1800 }],
    products: [{ price: 1 }],
    recipes: [],
  };
  assert.notEqual(
    planBasis(a),
    planBasis({ ...a, profiles: [{ calories: 1900 }] }),
  );
  assert.notEqual(planBasis(a), planBasis({ ...a, products: [{ price: 2 }] }));
});

test("suma el sodio por persona y conserva el desconocido", () => {
  const plan = Array.from({ length: 4 }, () => ({
    day: 0,
    recipeId: "r",
    portions: [1, 1.5],
  }));
  const r = {
    id: "r",
    calories: 400,
    protein: 20,
    carbs: 30,
    fat: 10,
    sodiumMg: 100,
  };
  assert.equal(daySummary(plan, [r], 0, 1).sodiumMg, 600);
  assert.equal(
    daySummary(plan, [{ ...r, sodiumMg: undefined }], 0, 1).sodiumMg,
    null,
  );
});

test("vitamina D suma solo comidas conocidas y respeta un cero verificado", () => {
  const plan = [
    { day: 0, recipeId: "a", portions: [1, 2] },
    { day: 0, recipeId: "b", portions: [1, 1] },
    { day: 0, recipeId: "c", portions: [1, 1] },
    { day: 0, recipeId: "c", portions: [1, 1] },
  ];
  const base = { calories: 1, protein: 1, carbs: 1, fat: 1 };
  const recipes = [
    { ...base, id: "a", vitaminDMcg: 2.5 },
    { ...base, id: "b", vitaminDMcg: 0 },
    { ...base, id: "c" },
  ];
  assert.deepEqual(daySummary(plan, recipes, 0, 1).vitaminD, {
    knownMcg: 5,
    knownMeals: 2,
    totalMeals: 4,
  });
});

test("resumen nutricional conserva cobertura incompleta y por ración", () => {
  const plan = [
    { day: 0, recipeId: "a", portions: [1, 2] },
    { day: 0, recipeId: "b", portions: [1, 1] },
    { day: 0, recipeId: "c", portions: [1, 1] },
    { day: 0, recipeId: "c", portions: [1, 1] },
  ];
  const base = { calories: 1, protein: 1, carbs: 1, fat: 1 };
  const recipes = [
    { ...base, id: "a", fiberG: 4 },
    { ...base, id: "b", fiberG: 0 },
    { ...base, id: "c" },
  ];
  assert.deepEqual(daySummary(plan, recipes, 0, 1).extras.fiberG, {
    amount: 8,
    known: 2,
    total: 4,
  });
});
