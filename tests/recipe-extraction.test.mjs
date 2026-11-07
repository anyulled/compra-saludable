import test from "node:test";
import assert from "node:assert/strict";
import { extractRecipe } from "../lib/recipe-extraction.mjs";
const page = `PUDIN DE CHIA CON FRUTOS ROJOS
RECETAS
SIGLO XXI
2 cucharadas (20g) de semillas de chía
200ml de leche de almendra
1.En un recipiente, mezcla todo.
2.Refrigera.
INFORMACIÓN NUTRICIONAL:
Calorías: 150kcal
Carbohidratos: 12 g
Proteínas: 5 g
Grasas: 9 g
CONSEJOS ÚTILES`;
test("extrae sugerencias sin asociar productos ni asumir raciones", () => {
  const r = extractRecipe(page);
  assert.equal(r.title, "PUDIN DE CHIA CON FRUTOS ROJOS");
  assert.equal(r.ingredients.length, 2);
  assert.match(r.preparation, /Refrigera/);
  assert.deepEqual(r.nutrition, {
    calories: 150,
    protein: 5,
    carbs: 12,
    fat: 9,
  });
  assert.equal(r.per100, false);
});
test("identifica referencias por cien gramos", () => {
  assert.equal(extractRecipe(page + "\nValores por 100 g").per100, true);
});
test("no propone un nutriente repetido o sin unidad", () => {
  const r = extractRecipe(page + "\nCalorías: 300 kcal\nProteínas: 11");
  assert.equal(r.nutrition.calories, undefined);
  assert.ok(r.ambiguous.includes("calories"));
  assert.equal(r.nutrition.protein, 5);
});
test("preserva cero y decimales sin inventar valores", () => {
  const r = extractRecipe(
    "TORTILLA DE PATATA\n1. Cocinar.\nGrasas: 0 g\nProteínas: 2,5 g",
  );
  assert.equal(r.nutrition.fat, 0);
  assert.equal(r.nutrition.protein, 2.5);
  assert.equal(r.nutrition.carbs, undefined);
});
test("no extrae ingredientes de una página sin pasos", () => {
  const r = extractRecipe("ÍNDICE\nRECETAS 1-50\nBowl de lentejas\nPlato 2");
  assert.deepEqual(r.ingredients, []);
  assert.deepEqual(r.nutrition, {});
});
