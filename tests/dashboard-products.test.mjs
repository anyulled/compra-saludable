import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
mock.module('next/image', {
  defaultExport: ({ src, alt }) => React.createElement('img', { src, alt }),
  exports: { default: ({ src, alt }) => React.createElement('img', { src, alt }) },
});
const { render, screen, within, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { default: Dashboard } = await import('../app/dashboard.tsx');
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); localStorage.clear(); globalThis.fetch = originalFetch; });

function initialWorkspace() {
  const profile = { name: 'A', age: 40, height: 170, weight: 80, sex: 'female', activity: 1.2, calories: 1800, protein: 90, carbs: 180, fat: 60, restrictions: '', medicationRisk: 'no', otherSafety: 'no' };
  return { profiles: [profile, { ...profile, name: 'B' }], recipes: [], products: [], plan: [], shopping: [], confirmed: false, drafts: [], approvedDocuments: {} };
}

function mockWorkspace(lookup) {
  let stored = initialWorkspace(); let revision = 1;
  globalThis.fetch = async (url, init = {}) => {
    if (url === '/api/workspace' && init.method === 'PUT') {
      const input = JSON.parse(init.body);
      assert.equal(input.expectedRevision, revision);
      stored = input.state;
      return new Response(JSON.stringify({ ok: true, revision: ++revision }), { status: 200 });
    }
    if (url === '/api/workspace') return new Response(JSON.stringify({ state: stored, revision }), { status: 200 });
    if (url === '/api/mercadona') return lookup(JSON.parse(init.body));
    throw Error(`Petición inesperada: ${url}`);
  };
  return () => stored;
}

test('consulta un producto, usa su formato y conserva cambios de despensa', async () => {
  const getStored = mockWorkspace(async body => {
    assert.equal(body.product, '12345');
    return new Response(JSON.stringify({ name: 'Garbanzos cocidos', price: 1.2, size: 400, unit: 'g', source: 'Mercadona', warning: null, published: true, unavailable: false }), { status: 200 });
  });
  render(React.createElement(Dashboard, { email: 'test@example.test', householdId: '00000000-0000-4000-8000-000000000001' }));
  await screen.findByText(/Una forma más/);
  fireEvent.click(screen.getAllByRole('button', { name: 'Productos' })[0]);
  fireEvent.change(screen.getByLabelText('Identificador o enlace de Mercadona'), { target: { value: '12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar producto' }));
  await waitFor(() => assert.equal(screen.getByLabelText('Nombre').value, 'Garbanzos cocidos'));
  assert.equal(screen.getByLabelText('Tamaño del envase').value, '400');
  assert.equal(screen.getByLabelText('Precio por envase (€)').value, '1.2');
  assert.ok(screen.getByText(/Producto consultado para 08191/));
  fireEvent.click(screen.getByRole('button', { name: 'Añadir producto' }));
  await waitFor(() => assert.equal(getStored().products.length, 1), { timeout: 3000 });
  const row = screen.getByText('Garbanzos cocidos').closest('.list-row');
  fireEvent.change(within(row).getByLabelText('Existencias actuales (g)'), { target: { value: '200' } });
  fireEvent.change(within(row).getByLabelText('Precio por envase (€)'), { target: { value: '1.3' } });
  fireEvent.change(within(row).getByLabelText('Caducidad de existencias'), { target: { value: '2026-11-20' } });
  await waitFor(() => assert.equal(getStored().products[0].stock, 200), { timeout: 3000 });
  assert.equal(getStored().products[0].price, 1.3);
  assert.equal(getStored().products[0].expiresOn, '2026-11-20');
});

test('un precio ausente o un fallo de Mercadona aparecen en pantalla', async () => {
  let calls = 0;
  mockWorkspace(async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ name: 'Desconocido', price: null }), { status: 200 });
    return new Response(JSON.stringify({ error: 'Proveedor no disponible' }), { status: 503 });
  });
  render(React.createElement(Dashboard, { email: 'test@example.test', householdId: '00000000-0000-4000-8000-000000000001' }));
  await screen.findByText(/Una forma más/);
  fireEvent.click(screen.getAllByRole('button', { name: 'Productos' })[0]);
  fireEvent.change(screen.getByLabelText('Identificador o enlace de Mercadona'), { target: { value: '12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar producto' }));
  assert.ok(await screen.findByText(/Mercadona no devolvió un precio válido/));
  fireEvent.click(screen.getByRole('button', { name: 'Consultar producto' }));
  assert.ok(await screen.findByText('Proveedor no disponible'));
});

test('no sustituye el menú si cambian los productos durante la optimización', async () => {
  let stored = { ...initialWorkspace(), products: [{ id: 'p', name: 'Avena', size: 500, unit: 'g', price: 1, stock: 0, source: 'Manual' }] };
  let revision = 1; let finishOptimize;
  globalThis.fetch = async (url, init = {}) => {
    if (url === '/api/workspace' && init.method === 'PUT') {
      stored = JSON.parse(init.body).state;
      return new Response(JSON.stringify({ ok: true, revision: ++revision }), { status: 200 });
    }
    if (url === '/api/workspace') return new Response(JSON.stringify({ state: stored, revision }), { status: 200 });
    if (url === '/api/optimize') return new Promise(resolve => { finishOptimize = resolve; });
    throw Error(`Petición inesperada: ${url}`);
  };
  render(React.createElement(Dashboard, { email: 'test@example.test', householdId: '00000000-0000-4000-8000-000000000001' }));
  await screen.findByText(/Una forma más/);
  fireEvent.click(screen.getAllByRole('button', { name: 'Menú' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Generar menú' }));
  await waitFor(() => assert.equal(typeof finishOptimize, 'function'));
  fireEvent.click(screen.getAllByRole('button', { name: 'Productos' })[0]);
  fireEvent.change(screen.getByLabelText('Existencias actuales (g)'), { target: { value: '150' } });
  finishOptimize(new Response(JSON.stringify({ plan: [], shopping: [], leftovers: [] }), { status: 200 }));
  assert.ok(await screen.findByText('Los datos cambiaron durante el cálculo. Vuelve a generar el menú.'));
  await waitFor(() => assert.equal(stored.products[0].stock, 150), { timeout: 3000 });
  assert.deepEqual(stored.plan, []);
});
