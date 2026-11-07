import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { optimize } = createRequire(import.meta.url)("../lib/optimizer.cjs");
const make = () => ({
  profiles: [0, 1].map((i) => ({
    name: `P${i}`,
    calories: 2000,
    protein: 100,
    carbs: 200,
    fat: 60,
    restrictions: "",
  })),
  products: [{ id: "p", name: "P", unit: "g", size: 1000, price: 2, stock: 0 }],
  recipes: ["Desayuno", "Comida", "Cena", "Tentempié"].map((meal, i) => ({
    id: "r" + i,
    meal,
    approved: true,
    calories: 500,
    protein: 25,
    carbs: 50,
    fat: 15,
    sodiumMg: 100,
    ingredients: [{ productId: "p", amount: 100 }],
    fiberG: 12,
    saturatedFatG: 2,
    freeSugarG: 0,
    calciumMg: 200,
    vitaminDMcg: 2,
    rating: 3,
  })),
});
test("respeta límites nutricionales individuales sin imponerlos por defecto", async () => {
  const d = make();
  d.profiles[0].nutritionGoals = {
    fiberMinG: 40,
    freeSugarMaxG: 0,
    calciumMinMg: 700,
    vitaminDMinMcg: 7,
  };
  d.profiles[1].nutritionGoals = { saturatedFatMaxG: 9 };
  const r = await optimize(d);
  for (let day = 0; day < 14; day++) {
    for (let person = 0; person < 2; person++) {
      const items = r.plan.filter((x) => x.day === day);
      const total = (key) =>
        items.reduce(
          (a, x) =>
            a +
            d.recipes.find((y) => y.id === x.recipeId)[key] *
              x.portions[person],
          0,
        );
      if (person === 0) {
        assert.ok(total("fiberG") >= 40 - 1e-6);
        assert.ok(total("calciumMg") >= 700 - 1e-6);
        assert.equal(total("freeSugarG"), 0);
        assert.ok(total("vitaminDMcg") >= 7 - 1e-6);
      } else assert.ok(total("saturatedFatG") <= 9 + 1e-6);
    }
  }
});
test("excluye datos desconocidos si el objetivo está activo y comunica inviabilidad", async () => {
  const d = make();
  d.profiles[0].nutritionGoals = { fiberMinG: 20 };
  delete d.recipes[0].fiberG;
  await assert.rejects(optimize(d), /nutrientes con objetivos activos/);
  d.recipes[0].fiberG = 12;
  d.profiles[0].nutritionGoals.fiberMinG = 1000;
  await assert.rejects(optimize(d), /No se ha encontrado/);
});
test("favorece cierta variedad con igualdad de costes y nutrientes", async () => {
  const d = make();
  d.recipes.push({ ...d.recipes[1], id: "alt" });
  const r = await optimize(d);
  const used = new Set(
    r.plan.filter((x) => x.meal === "Comida").map((x) => x.recipeId),
  );
  assert.equal(used.size, 2);
});
test("cumple mínimos semanales de grupos clasificados por el usuario", async () => {
  const d = make();
  d.recipes.push({ ...d.recipes[1], id: "leg", foodGroups: ["legumbres"] });
  d.optimizationOptions = { categoryMinimums: { legumbres: 3 } };
  const r = await optimize(d);
  for (let w = 0; w < 2; w++)
    assert.ok(
      r.plan.filter((x) => Math.floor(x.day / 7) === w && x.recipeId === "leg")
        .length >= 3,
    );
});
test("rechaza condiciones de variedad inviables sin relajarlas", async () => {
  const d = make();
  d.optimizationOptions = { maxRecipeRepetitions: 7 };
  await assert.rejects(optimize(d), /No se ha encontrado/);
});
test("caducidad limita el uso de existencias y cuantifica sobrante", async () => {
  const d = make();
  d.products[0].stock = 10000;
  d.products[0].expiresOn = "2026-01-01";
  d.optimizationOptions = { startDate: "2026-01-01" };
  const r = await optimize(d);
  assert.ok(r.shopping[0].packages >= 11);
  assert.equal(r.leftovers[0].expiredStock, 9200);
  assert.ok(r.leftovers[0].remaining >= 9200);
});
test("caducidad anterior al inicio no se utiliza y requiere fecha de inicio válida", async () => {
  const d = make();
  d.products[0].stock = 10000;
  d.products[0].expiresOn = "2025-12-31";
  await assert.rejects(optimize(d), /fecha de inicio/);
  d.optimizationOptions = { startDate: "2026-01-01" };
  const r = await optimize(d);
  assert.equal(r.leftovers[0].expiredStock, 10000);
  assert.equal(r.shopping[0].packages, 12);
});
