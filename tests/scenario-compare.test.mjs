import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, waitFor } = await import("@testing-library/react");
const { default: ScenarioCompare } = await import("../components/ScenarioCompare.tsx");
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test("compara secuencialmente, informa errores y marca resultados desactualizados", async () => {
  const data = { profiles: [{ name: "A" }, { name: "B" }], products: [{ id: "p", stock: 50, price: 2 }], recipes: [{ id: "r", sodiumMg: 140 }], planLocks: [] };
  const inputs = [];
  globalThis.fetch = async (_url, options) => {
    inputs.push(JSON.parse(options.body));
    if (inputs.length === 2) return new Response(JSON.stringify({ error: "Sin solución" }), { status: 400 });
    if (inputs.length === 3) throw Error("Sin conexión");
    return new Response(JSON.stringify({ shopping: [{ packages: 2, price: 3 }], plan: [{ recipeId: "r", portions: [1, 2] }], leftovers: [] }));
  };
  const view = render(React.createElement(ScenarioCompare, { data }));
  fireEvent.click(screen.getByRole("button", { name: "Comparar escenarios" }));
  await waitFor(() => assert.equal(inputs.length, 3));
  await waitFor(() => assert.ok(screen.getByText("Sin conexión")));
  assert.ok(screen.getByText("Sin solución"));
  assert.ok(screen.getByText("6.00 €"));
  assert.equal(inputs[1].products[0].stock, 0);
  assert.equal(inputs[2].products[0].price, 2.2);
  assert.equal(data.products[0].stock, 50);
  view.rerender(React.createElement(ScenarioCompare, { data: { ...data, planLocks: [{ day: 0, meal: "Cena", recipeId: "r" }] } }));
  assert.ok(screen.getByText(/Los datos han cambiado/));
});
