import test from "node:test";
import assert from "node:assert/strict";
import { pdfFailureMessages, profileObjectivesComplete, resetRecipesState, updateChosenIngredient, withPlanLock, withShoppingCheck } from "../lib/dashboard-state.mjs";

test("exige los cuatro objetivos para habilitar la generación del menú", () => {
  const complete = { calories: 1800, protein: 90, carbs: 180, fat: 60 };
  assert.equal(profileObjectivesComplete(complete), true);
  assert.equal(profileObjectivesComplete({ ...complete, fat: 0 }), false);
});

test("reemplaza o quita la fijación de una comida sin alterar el estado previo", () => {
  const state = { planLocks: [{ day: 1, meal: "Cena", recipeId: "old" }], confirmed: true, planDirty: false };
  const updated = withPlanLock(state, 1, "Cena", "new");
  assert.deepEqual(updated.planLocks, [{ day: 1, meal: "Cena", recipeId: "new" }]);
  assert.equal(updated.confirmed, false);
  assert.equal(state.planLocks[0].recipeId, "old");
  assert.deepEqual(withPlanLock(updated, 1, "Cena", null).planLocks, []);
});

test("actualiza el checkbox de compra preservando el resto de productos", () => {
  const state = { shopping: [{ id: "a", checked: false }, { id: "b", checked: false }] };
  const updated = withShoppingCheck(state, "a", true);
  assert.deepEqual(updated.shopping, [{ id: "a", checked: true }, { id: "b", checked: false }]);
  assert.equal(state.shopping[0].checked, false);
});

test("asocia o deja sin asociar un ingrediente y conserva productos existentes", () => {
  const recipe = { id: "r1", ingredients: [{ name: "tomate", productOptions: [{ id: "p1" }] }] };
  const recipe2 = { id: "r2", ingredients: [{ name: "Tomate", unit: "g", productOptions: [{ id: "p1" }] }] };
  const state = { recipes: [recipe, recipe2], products: [{ id: "old" }] };
  const chosen = { id: "new", name: "Tomate", unit: "g", size: 500, price: 1, stock: 0, source: "Mercadona" };
  const linked = updateChosenIngredient(recipe, 0, chosen, state);
  assert.equal(linked.recipes[0].ingredients[0].productId, "new");
  assert.equal(linked.recipes[1].ingredients[0].productId, "new");
  assert.equal(linked.products.length, 2);
  const unlinked = updateChosenIngredient(recipe, 0, { ...chosen, id: "" }, state);
  assert.equal(unlinked.recipes[0].ingredients[0].productId, undefined);
  assert.equal(unlinked.recipes[1].ingredients[0].productId, undefined);
  assert.equal(unlinked.products.length, 1);
  assert.deepEqual(state.recipes[0].ingredients[0].productOptions, [{ id: "p1" }]);
});

test("resume errores de OCR y de guardado sin duplicarlos", () => {
  const results = [
    { status: "fulfilled", value: {} },
    { status: "rejected", reason: new Error("OCR falló") },
    { status: "rejected", reason: "sin detalle" },
  ];
  const failures = pdfFailureMessages(results, [{ name: "A.pdf" }, { name: "B.pdf" }, { name: "C.pdf" }], "No se guardó el lote.");
  assert.deepEqual(failures, ["B.pdf: OCR falló", "C.pdf: error desconocido", "No se guardó el lote."]);
});

test("restablece recetas, borradores, documentos aprobados y planes conservando perfiles y productos", () => {
  const profile = { name: "P1", calories: 2000, protein: 100, carbs: 200, fat: 70 };
  const product = { id: "prod1", name: "Aceite", unit: "ml", size: 1000, price: 5, stock: 1, source: "Manual" };
  const state = {
    profiles: [profile, { ...profile, name: "P2" }],
    products: [product],
    recipes: [{ id: "r1", name: "Ensalada", meal: "Comida", calories: 200, protein: 5, carbs: 10, fat: 15, ingredients: [], rating: 3, notes: "", approved: true }],
    drafts: [{ id: "d1", filename: "recetas.pdf", page: 1, text: "receta" }],
    approvedDocuments: { "doc-1": true },
    planLocks: [{ day: 0, meal: "Comida", recipeId: "r1" }],
    plan: [{ day: 0, meal: "Comida", recipeId: "r1", portions: [1, 1] }],
    shopping: [{ id: "s1", name: "Tomate", packages: 1, size: 500, unit: "g", price: 2, checked: false }],
    confirmed: true,
    planBasis: "snap",
    planDirty: false,
    leftovers: [{ id: "prod1", name: "Aceite", unit: "ml", stock: 1, purchased: 0, used: 10, remaining: 990, expiredStock: 0 }],
  };
  const reset = resetRecipesState(state);
  assert.equal(reset.recipes.length, 0);
  assert.equal(reset.drafts.length, 0);
  assert.deepEqual(reset.approvedDocuments, {});
  assert.equal(reset.planLocks.length, 0);
  assert.equal(reset.plan.length, 0);
  assert.equal(reset.shopping.length, 0);
  assert.equal(reset.confirmed, false);
  assert.equal(reset.planBasis, undefined);
  assert.equal(reset.planDirty, false);
  assert.equal(reset.products.length, 1);
  assert.equal(reset.profiles.length, 2);
});
