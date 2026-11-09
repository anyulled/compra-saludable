import test from "node:test";
import assert from "node:assert/strict";
import { appendApprovedRecipe, applyRecipeMatches, approvedRecipe, recipeSavedMessage, recipeValidationMessage } from "../lib/recipe-workflow.mjs";

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
  assert.equal(state.drafts[0].status, "reviewing");
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
