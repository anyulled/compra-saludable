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

test("clasifica el tipo de comida del documento por nombre de archivo y cabeceras", () => {
  const fromFile = extractRecipe("PUDIN\n1. Mezclar", {
    filename: "200_CENAS_ANTIINFLAMATORIAS.pdf",
  });
  assert.equal(fromFile.meal, "Cena");
  assert.equal(fromFile.mealSource, "filename");

  const fromHeader = extractRecipe("IDEAS DE RECETAS PARA CENAS\n1. Receta", {
    filename: "documento.pdf",
    documentMealContext: { meal: "Cena", mealSource: "document_header", mealConfidence: "resolved" },
  });
  assert.equal(fromHeader.meal, "Cena");
  assert.equal(fromHeader.mealSource, "document_header");

  const defaultComida = extractRecipe("PUDIN\n¡Disfruta de estos deliciosos postres!\n1. Mezclar", {
    filename: "recetas.pdf",
  });
  assert.equal(defaultComida.meal, "Comida");
  assert.equal(defaultComida.mealSource, "default");
});

test("detecta portadas e índices automáticamente", () => {
  const cover = extractRecipe("200 RECETAS SALUDABLES\nEDICIÓN 2026", { pageNumber: 1 });
  assert.equal(cover.pageType, "cover");

  const indexPage = extractRecipe("IDEAS DE RECETAS PARA CENAS\n1. Salmón\n2. Lubina\n3. Ensalada", {
    pageNumber: 2,
  });
  assert.equal(indexPage.pageType, "index");

  const unreadable = extractRecipe("", { method: "unreadable" });
  assert.equal(unreadable.pageType, "recipe");
  assert.ok(unreadable.reviewReasons.includes("Página ilegible"));
});

test("reconstruye títulos multilinea y limpia marcas de agua", () => {
  const r = extractRecipe(`ESPIRAL DE CALABACÍN CON PESTO Y TOMATE
CHERRY
RECETAS
SIGLO XXI
INGREDIENTES
1 calabacín
1. Cocinar.`);
  assert.equal(r.title, "ESPIRAL DE CALABACÍN CON PESTO Y TOMATE CHERRY");
});

test("usa título de respaldo cuando no hay mayúsculas sostenidas", () => {
  const r = extractRecipe(`Espiral de calabacín casera
INGREDIENTES
1 calabacín
1. Cocinar.`);
  assert.equal(r.title, "Espiral de calabacín casera");
});

test("extrae grasas saludables, palabras numéricas en inglés y fórmula Atwater", () => {
  const r = extractRecipe(`RECETA ESPECIAL
1. Cocinar.
INFORMACIÓN NUTRICIONAL:
Grasas saludables: 10 g
Proteínas: thirty g
Carbohidratos: Fifty g
Azúcares: 12
Sal: 1 g`);

  assert.equal(r.nutrition.fat, 10);
  assert.equal(r.nutrition.protein, 30);
  assert.equal(r.nutrition.carbs, 50);
  assert.equal(r.nutrition.freeSugarG, 12);
  assert.equal(r.nutrition.sodiumMg, 400);
  // Atwater: 30*4 + 50*4 + 10*9 = 120 + 200 + 90 = 410 kcal
  assert.equal(r.nutrition.calories, 410);
});

test("deduplica bloques nutricionales repetidos idénticos sin marcar ambiguo", () => {
  const r = extractRecipe(`RECETA
1. Cocinar.
INFORMACIÓN NUTRICIONAL:
Calorías: 250 kcal
Proteínas: 20 g
INFORMACIÓN NUTRICIONAL:
Calorías: 250 kcal
Proteínas: 20 g`);
  assert.equal(r.nutrition.calories, 250);
  assert.equal(r.nutrition.protein, 20);
  assert.equal(r.ambiguous.length, 0);
});

test("detecta raciones múltiples y escala cantidades por ración", () => {
  const r = extractRecipe(`SALMÓN AL HORNO
INGREDIENTES (2 raciones)
400 g de salmón
2 cdas de AOVE
½ aguacate (≈75 g)
Sal y pimienta al gusto
1. Hornear.`);

  assert.equal(r.servings, 2);
  assert.equal(r.seasoningNotes.length, 1);
  assert.match(r.seasoningNotes[0], /Sal y pimienta/);

  const salmon = r.structuredIngredients.find((i) => i.name.includes("salmon") || i.name.includes("salmón"));
  assert.ok(salmon);
  assert.equal(salmon.amount, 200); // 400g / 2
  assert.equal(salmon.unit, "g");

  const aove = r.structuredIngredients.find((i) => i.name.includes("aceite"));
  assert.ok(aove);
  assert.equal(aove.amount, 15); // 2 cdas (30ml) / 2
  assert.equal(aove.unit, "ml");

  const aguacate = r.structuredIngredients.find((i) => i.name.includes("aguacate"));
  assert.ok(aguacate);
  assert.equal(aguacate.amount, 38); // Math.round(75 / 2) = 38
  assert.equal(aguacate.unit, "g");
});
