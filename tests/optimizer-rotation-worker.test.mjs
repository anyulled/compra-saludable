import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
const { optimize, isFeasibleSolution } = createRequire(import.meta.url)("../lib/optimizer.cjs");

function fixture() {
  const profile = { calories: 2000, protein: 100, carbs: 200, fat: 60, restrictions: "" };
  return {
    profiles: [{ ...profile }, { ...profile }],
    products: [{ id: "p", name: "Producto", unit: "g", size: 1000, price: 2, stock: 0 }],
    recipes: ["Desayuno", "Comida", "Cena", "Tentempié"].map((meal, i) => ({ id: `r${i}`, meal, approved: true, calories: 500, protein: 25, carbs: 50, fat: 15, sodiumMg: 100, ingredients: [{ productId: "p", amount: 100 }], rating: 3 })),
  };
}

test("la rotación reparte recetas y respeta fijaciones explícitas", async () => {
  const data = fixture();
  for (let i = 0; i < 3; i++) data.recipes.push({ ...data.recipes[1], id: `alt${i}` });
  data.locks = [{ day: 0, meal: "Comida", recipeId: "alt0" }];
  const { plan } = await optimize(data);
  assert.equal(plan.find((item) => item.day === 0 && item.meal === "Comida").recipeId, "alt0");
  assert.equal(new Set(plan.filter((item) => item.meal === "Comida").map((item) => item.recipeId)).size, 4);
});

test("si la rotación no es viable, vuelve al modelo completo sin relajar objetivos", async () => {
  const data = fixture();
  for (let i = 0; i < 6; i++) data.recipes.push({ ...data.recipes[0], id: `bad${i}`, calories: 10000 });
  const { plan } = await optimize(data);
  assert.ok(plan.filter((item) => item.meal === "Desayuno").every((item) => item.recipeId === "r0"));
});

test("el worker devuelve resultado o error sin bloquear el hilo principal", async () => {
  const run = (data) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../lib/optimizer-worker.mjs", import.meta.url), { workerData: data });
    worker.once("message", (result) => { void worker.terminate(); resolve(result); });
    worker.once("error", reject);
  });
  const pending = run(fixture());
  let ticked = false;
  await new Promise((resolve) => setTimeout(() => { ticked = true; resolve(); }, 1));
  assert.equal(ticked, true);
  const success = await pending;
  assert.equal(success.ok, true);
  assert.equal(success.result.plan.length, 56);
  const failure = await run({});
  assert.equal(failure.ok, false);
  assert.match(failure.error, /dos perfiles/);
});

test("verifica restricciones e integralidad antes de aceptar un resultado parcial", () => {
  const model = { constraints: { nutrient: { min: 10 }, cap: { max: 1 }, fixed: { equal: 1 } }, variables: { x: { nutrient: 5 }, y: { cap: 1, fixed: 1 } }, ints: { x: 1 }, binaries: { y: 1 } };
  const names = ["x", "y"], aliases = { x: "v0", y: "v1" };
  const columns = (x, y) => ({ v0: { Primal: x }, v1: { Primal: y } });
  assert.equal(isFeasibleSolution(model, names, aliases, columns(2, 1)), true);
  assert.equal(isFeasibleSolution(model, names, aliases, columns(1, 1)), false);
  assert.equal(isFeasibleSolution(model, names, aliases, columns(2.5, 1)), false);
  assert.equal(isFeasibleSolution(model, names, aliases, columns(2, 0)), false);
  assert.equal(isFeasibleSolution(model, names, aliases, columns(2, 2)), false);
  assert.equal(isFeasibleSolution(model, names, aliases, columns(NaN, 1)), false);
  assert.equal(isFeasibleSolution(model, names, aliases, null), false);
});
