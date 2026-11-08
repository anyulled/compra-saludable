import test from "node:test";
import assert from "node:assert/strict";
import { matchIngredientOptions, matchRecipeIngredients } from "../lib/recipe-product-match.mjs";

const product = (id, unit = "g", price = 1) => ({ id, name: `Producto ${id}`, unit, size: 500, price, source: "Mercadona", warning: null, productUrl: null });

test("autoasocia un resultado único compatible y crea su producto con stock cero", () => {
  const result = matchRecipeIngredients([{ name: "garbanzos", amount: 100, unit: "g" }], [{ query: "garbanzos", products: [product("1")] }]);
  assert.equal(result.ingredients[0].productId, "1");
  assert.equal(result.products[0].stock, 0);
  assert.equal(result.unresolvedCount, 0);
});

test("conserva alternativas múltiples para elección manual y no crea productos", () => {
  const options = [product("1"), product("2")];
  const result = matchRecipeIngredients([{ name: "lentejas", amount: 100, unit: "g" }], [{ query: "lentejas", products: options }]);
  assert.equal(result.ingredients[0].productId, undefined);
  assert.deepEqual(result.ingredients[0].productOptions, options);
  assert.equal(result.products.length, 0);
  assert.equal(result.unresolvedCount, 1);
});

test("no asocia una coincidencia si el formato, la unidad o el precio son inciertos", () => {
  for (const option of [product("1", "unidades"), { ...product("2"), size: null }, product("3", "g", null)]) {
    const result = matchIngredientOptions({ name: "tomate", amount: 100, unit: "g" }, [option]);
    assert.equal(result.product, null);
    assert.deepEqual(result.ingredient.productOptions, [option]);
  }
});

test("ingredientes sin resultado quedan pendientes y no se convierten en productos", () => {
  const result = matchRecipeIngredients([{ name: "ingrediente especial", amount: 30, unit: "ml" }], [{ query: "ingrediente especial", products: [] }]);
  assert.equal(result.ingredients[0].productId, undefined);
  assert.deepEqual(result.products, []);
  assert.equal(result.unresolvedCount, 1);
});
