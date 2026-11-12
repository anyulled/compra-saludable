import test from "node:test";
import assert from "node:assert/strict";
import {
  appendApprovedRecipe,
  applyBatchRecipeMatches,
  applyRecipeMatches,
  approvedRecipe,
  buildRecipeFromDraft,
  collectUncachedIngredientQueries,
  processImportedDraftBatch,
  recipeSavedMessage,
  recipeValidationMessage,
} from "../lib/recipe-workflow.mjs";

const recipe = { name: "Ensalada", calories: 300, protein: 20, carbs: 30, fat: 10, ingredients: [{ name: " tomate ", amount: 100 }] };

test("valida confirmación de revisión y los campos de una receta", () => {
  assert.match(recipeValidationMessage(recipe, "draft-1", false), /Confirma/);
  assert.match(recipeValidationMessage({ ...recipe, calories: 0 }, null, false), /Completa/);
  assert.equal(recipeValidationMessage(recipe, null, false), null);
});

test("prepara una receta aprobada y agrega revisión del borrador fuente", () => {
  const saved = approvedRecipe(recipe, "recipe-1", "draft-1");
  assert.equal(saved.ingredients[0].name, "tomate");
  assert.equal(saved.approved, true);
  const state = appendApprovedRecipe(saved, "draft-1", { recipes: [], products: [], drafts: [{ id: "draft-1", filename: "A.pdf", page: 1 }], approvedDocuments: { "A.pdf": true } });
  assert.equal(state.recipes[0].id, "recipe-1");
  assert.equal(state.drafts[0].status, "reviewed");
  assert.deepEqual(state.approvedDocuments, { "A.pdf": true, "legacy:A.pdf": false });
});

test("aplica productos únicos y redacta el aviso correcto", () => {
  const product = { id: "p1", name: "Tomate", size: 500, unit: "g" };
  const state = { recipes: [{ id: "recipe-1", ingredients: [] }, { id: "other", ingredients: [] }], products: [product] };
  const updated = applyRecipeMatches("recipe-1", { ingredients: [{ name: "tomate", productId: "p1" }], products: [product, { id: "p2" }], unresolvedCount: 1 }, state);
  assert.deepEqual(updated.recipes[0].ingredients, [{ name: "tomate", productId: "p1" }]);
  assert.equal(updated.products.length, 2);
  assert.equal(state.products.length, 1);
  assert.match(recipeSavedMessage(1, true), /PDF original/);
  assert.match(recipeSavedMessage(0, false), /productos únicos/);
});

test("processImportedDraftBatch clasifica borradores y autoaprueba recetas completas", () => {
  const drafts = [
    {
      id: "d-1",
      filename: "200_CENAS.pdf",
      page: 1,
      text: "200 CENAS SALUDABLES\nPORTADA",
      method: "text",
    },
    {
      id: "d-2",
      filename: "200_CENAS.pdf",
      page: 2,
      text: `SALMON AL HORNO
INGREDIENTES
200 g de salmon
1 cda de aove
1. Hornear.
INFORMACIÓN NUTRICIONAL:
Calorías: 350 kcal
Proteínas: 30 g
Carbohidratos: 5 g
Grasas: 20 g`,
      method: "text",
    },
    {
      id: "d-3",
      filename: "200_CENAS.pdf",
      page: 3,
      text: `RECETA INCOMPLETA SIN MACROS
INGREDIENTES
100 g de pollo
1. Cocinar.`,
      method: "text",
    },
  ];

  const result = processImportedDraftBatch({ drafts });
  assert.equal(result.summary.discardedCount, 1);
  assert.equal(result.summary.approvedCount, 1);
  assert.equal(result.summary.pendingCount, 1);

  assert.equal(result.classifiedDrafts[0].status, "discarded");
  assert.equal(result.classifiedDrafts[1].status, "reviewed");
  assert.equal(result.classifiedDrafts[2].status, "pending");

  assert.equal(result.autoApprovedRecipes.length, 1);
  const autoRecipe = result.autoApprovedRecipes[0];
  assert.equal(autoRecipe.name, "SALMON AL HORNO");
  assert.equal(autoRecipe.meal, "Cena");
  assert.equal(autoRecipe.approved, true);
  assert.equal(autoRecipe.sourceDraftId, "d-2");
});

test("collectUncachedIngredientQueries divide en chunks de máximo 30", () => {
  const ingredients = Array.from({ length: 35 }, (_, i) => ({
    name: `ingrediente-${i}`,
    amount: 100,
    unit: "g",
  }));
  const recipes = [{ id: "r1", ingredients }];
  const chunks = collectUncachedIngredientQueries(recipes);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 30);
  assert.equal(chunks[1].length, 5);
});

test("buildRecipeFromDraft pre-llena campos a partir de un borrador pendiente", () => {
  const draft = {
    id: "draft-p",
    filename: "comidas.pdf",
    page: 5,
    text: `POLLO CON VERDURAS
INGREDIENTES
150 g de pechuga de pollo
1. Saltear.
INFORMACIÓN NUTRICIONAL:
Calorías: 250 kcal
Proteínas: 35 g
Carbohidratos: 0 g
Grasas: 10 g`,
  };
  const prefilled = buildRecipeFromDraft(draft, "rec-123");
  assert.equal(prefilled.id, "rec-123");
  assert.equal(prefilled.name, "POLLO CON VERDURAS");
  assert.equal(prefilled.calories, 250);
  assert.equal(prefilled.protein, 35);
  assert.equal(prefilled.sourceDraftId, "draft-p");
  assert.equal(prefilled.approved, false);
});

test("applyBatchRecipeMatches aplica coincidencias a múltiples recetas y añade productos únicos", () => {
  const initial = {
    recipes: [
      { id: "r1", ingredients: [{ name: "salmon", unit: "g" }] },
      { id: "r2", ingredients: [{ name: "salmon", unit: "g" }] },
      { id: "other", ingredients: [] },
    ],
    products: [],
  };
  const searchResults = [
    {
      query: "salmon",
      products: [
        { id: "p-salmon", name: "Salmón", unit: "g", size: 400, price: 6, stock: 0, source: "Mercadona" },
      ],
    },
  ];

  const updated = applyBatchRecipeMatches(["r1", "r2"], searchResults, initial);
  assert.equal(updated.recipes[0].ingredients[0].productId, "p-salmon");
  assert.equal(updated.recipes[1].ingredients[0].productId, "p-salmon");
  assert.equal(updated.products.length, 1);
  assert.equal(updated.products[0].id, "p-salmon");
});
