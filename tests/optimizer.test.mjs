import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { optimize } = createRequire(import.meta.url)("../lib/optimizer.cjs");
const profile = {
  calories: 2000,
  protein: 100,
  carbs: 200,
  fat: 60,
  restrictions: "",
};
const data = () => ({
  profiles: [{ ...profile }, { ...profile }],
  products: [
    { id: "p", name: "Producto", size: 1000, unit: "g", price: 2, stock: 0 },
  ],
  recipes: ["Desayuno", "Comida", "Cena", "Tentempié"].map((meal, i) => ({
    id: "r" + i,
    meal,
    approved: true,
    calories: 500,
    protein: 25,
    carbs: 50,
    fat: 15,
    ingredients: [{ productId: "p", amount: 100 }],
    rating: 3,
    sodiumMg: 100,
  })),
});
test("planifica 14 días y compra envases enteros para ambas personas", async () => {
  const result = await optimize(data());
  assert.equal(result.plan.length, 56);
  assert.equal(result.shopping[0].packages, 12);
  for (let day = 0; day < 14; day++)
    for (let person = 0; person < 2; person++)
      assert.equal(
        result.plan
          .filter((x) => x.day === day)
          .reduce((a, x) => a + x.portions[person], 0),
        4,
      );
});
test("bloquea restricciones sin verificación automática", async () => {
  const d = data();
  d.profiles[0].restrictions = "cacahuete";
  await assert.rejects(optimize(d), /restricciones/);
});
test("rechaza recetas con ingredientes sin producto", async () => {
  const d = data();
  d.recipes[0].ingredients[0].productId = "missing";
  await assert.rejects(optimize(d), /Desayuno/);
});
test("informa cuando no se cumplen los objetivos", async () => {
  const d = data();
  d.profiles[0].calories = 10000;
  await assert.rejects(optimize(d), /No se ha encontrado/);
});

test("respeta una receta fijada y recalcula envases", async () => {
  const d = data();
  d.recipes.push({
    ...d.recipes[1],
    id: "r_alt",
    ingredients: [{ productId: "p", amount: 200 }],
  });
  d.locks = [{ day: 0, meal: "Comida", recipeId: "r_alt" }];
  const result = await optimize(d);
  assert.equal(
    result.plan.find((x) => x.day === 0 && x.meal === "Comida").recipeId,
    "r_alt",
  );
  const used = result.plan.reduce(
    (sum, x) =>
      sum +
      (x.recipeId === "r_alt" ? 200 : 100) * (x.portions[0] + x.portions[1]),
    0,
  );
  assert.equal(result.shopping[0].packages, Math.ceil(used / 1000));
});
test("rechaza fijaciones incompatibles o duplicadas", async () => {
  const d = data();
  d.locks = [{ day: 0, meal: "Cena", recipeId: "r1" }];
  await assert.rejects(optimize(d), /fijada/);
  d.locks = [
    { day: 0, meal: "Comida", recipeId: "r1" },
    { day: 0, meal: "Comida", recipeId: "r1" },
  ];
  await assert.rejects(optimize(d), /más de una/);
});
test("si una receta fijada hace imposible el menú informa sin relajar objetivos", async () => {
  const d = data();
  d.recipes.push({ ...d.recipes[1], id: "bad", calories: 5000 });
  d.locks = [{ day: 0, meal: "Comida", recipeId: "bad" }];
  await assert.rejects(optimize(d), /No se ha encontrado/);
});

test("bloquea una propuesta automática desactualizada", async () => {
  const d = data();
  d.profiles[0].objectiveSource = "suggested";
  d.profiles[0].recommendationBasis = "obsoleta";
  await assert.rejects(optimize(d), /propuesta nutricional/);
});

test("prefiere recetas de menor sodio cuando precio y nutrientes son iguales", async () => {
  const d = data();
  d.recipes[1].sodiumMg = 900;
  d.recipes.push({ ...d.recipes[1], id: "low", sodiumMg: 50 });
  const result = await optimize(d);
  assert.ok(
    result.plan.filter((x) => x.meal === "Comida" && x.recipeId === "low")
      .length > 7,
  );
});
test("no trata un valor de sodio desconocido como cero", async () => {
  const d = data();
  delete d.recipes[1].sodiumMg;
  await assert.rejects(optimize(d), /sodio por ración/);
  d.recipes[1].sodiumMg = 0;
  assert.equal((await optimize(d)).plan.length, 56);
});
test("rechaza una fijación con sodio desconocido", async () => {
  const d = data();
  d.recipes.push({ ...d.recipes[1], id: "missing", sodiumMg: undefined });
  d.locks = [{ day: 0, meal: "Comida", recipeId: "missing" }];
  await assert.rejects(optimize(d), /fijada/);
});
