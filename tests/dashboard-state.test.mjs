import test from "node:test";
import assert from "node:assert/strict";
import { profileObjectivesComplete, withPlanLock, withShoppingCheck } from "../lib/dashboard-state.mjs";

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
