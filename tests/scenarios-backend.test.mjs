import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScenario, scenarioBasis, summarizeScenario } from '../lib/scenarios.mjs';

const state = () => ({
  profiles: [], recipes: [], products: [{ id: 'p', stock: 20, price: 2.35 }],
  planLocks: [{ day: 0, meal: 'Comida', recipeId: 'r' }],
});

test('los tres escenarios simulan sin alterar precios, existencias ni fijaciones reales', () => {
  const data = state();
  assert.deepEqual(makeScenario(data, 'base').products, [{ id: 'p', stock: 20, price: 2.35 }]);
  assert.equal(makeScenario(data, 'noStock').products[0].stock, 0);
  assert.equal(makeScenario(data, 'higherPrices').products[0].price, 2.59);
  assert.equal(data.products[0].price, 2.35);
  assert.equal(data.products[0].stock, 20);
  assert.deepEqual(makeScenario(data, 'base').locks, data.planLocks);
  assert.throws(() => makeScenario(data, 'unknown'), /Escenario desconocido/);
});

test('las fijaciones modifican la huella de una comparación anterior', () => {
  const data = state();
  assert.notEqual(scenarioBasis(data), scenarioBasis({ ...data, planLocks: [] }));
});

test('resume coste, sodio medio por persona y sobrantes; rechaza recetas sin sodio', () => {
  const result = {
    shopping: [{ packages: 2, price: 1.5 }, { packages: 1, price: 2 }],
    plan: [{ recipeId: 'r', portions: [2, 1] }], leftovers: [{ id: 'p' }],
  };
  assert.deepEqual(summarizeScenario(result, [{ id: 'r', sodiumMg: 140 }]), {
    cost: 5, sodiumDaily: [20, 10], leftovers: 1,
  });
  assert.throws(() => summarizeScenario(result, []), /Falta sodio/);
  assert.throws(() => summarizeScenario(result, [{ id: 'r' }]), /Falta sodio/);
});
