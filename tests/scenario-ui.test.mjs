import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { default: ScenarioCompare } = await import('../components/ScenarioCompare.tsx');
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test('compara escenarios secuencialmente, avisa si cambian los datos y respeta el workspace', async () => {
  const data = {
    profiles: [{ name: 'A' }, { name: 'B' }],
    products: [{ id: 'p', stock: 30, price: 2 }],
    recipes: [{ id: 'r', sodiumMg: 140 }], planLocks: [],
  };
  const bodies = [];
  globalThis.fetch = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ shopping: [{ packages: 2, price: 2 }], plan: [{ recipeId: 'r', portions: [1, 2] }], leftovers: [] }), { status: 200 });
  };
  const view = render(React.createElement(ScenarioCompare, { data }));
  fireEvent.click(screen.getByRole('button', { name: 'Comparar escenarios' }));
  await waitFor(() => assert.equal(bodies.length, 3));
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Comparar escenarios' }).disabled, false));
  assert.equal(bodies[0].products[0].stock, 30);
  assert.equal(bodies[1].products[0].stock, 0);
  assert.equal(bodies[2].products[0].price, 2.2);
  assert.equal(data.products[0].stock, 30);
  assert.equal(screen.getAllByText('4.00 €').length, 3);
  assert.equal(screen.getAllByText('A: 10 mg · B: 20 mg').length, 3);
  view.rerender(React.createElement(ScenarioCompare, { data: { ...data, products: [{ ...data.products[0], price: 3 }] } }));
  assert.match(screen.getByText(/Los datos han cambiado/).textContent, /vuelve a calcularla/);
});

test('muestra un error por escenario y continúa con las comparaciones restantes', async () => {
  const data = { profiles: [{ name: 'A' }, { name: 'B' }], products: [], recipes: [], planLocks: [] };
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    if (count === 1) return new Response(JSON.stringify({ error: 'Objetivos incompatibles' }), { status: 400 });
    if (count === 2) throw Error('Sin conexión');
    return new Response(JSON.stringify({ shopping: [], plan: [], leftovers: [] }), { status: 200 });
  };
  render(React.createElement(ScenarioCompare, { data }));
  fireEvent.click(screen.getByRole('button', { name: 'Comparar escenarios' }));
  await waitFor(() => assert.ok(screen.getByText('Sin conexión')));
  assert.ok(screen.getByText('Objetivos incompatibles'));
  await waitFor(() => assert.equal(count, 3));
  assert.ok(screen.getByText('0.00 €'));
});
