import test from "node:test";
import assert from "node:assert/strict";
import { pdfFailureMessages, profileObjectivesComplete, updateChosenIngredient, withPlanLock, withShoppingCheck } from "../lib/dashboard-state.mjs";

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
  const state = { recipes: [recipe], products: [{ id: "old" }] };
  const chosen = { id: "new", name: "Tomate", unit: "g", size: 500, price: 1, stock: 0, source: "Mercadona" };
  const linked = updateChosenIngredient(recipe, 0, chosen, state);
  assert.equal(linked.recipes[0].ingredients[0].productId, "new");
  assert.equal(linked.products.length, 2);
  const unlinked = updateChosenIngredient(recipe, 0, { ...chosen, id: "" }, state);
  assert.equal(unlinked.recipes[0].ingredients[0].productId, undefined);
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
