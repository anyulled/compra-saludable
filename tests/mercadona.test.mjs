import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mercadonaResultMessage, requireMercadonaPrice } from "../lib/mercadona-lookup.mjs";
const { extractId, normalizeProduct, lookup, searchProducts, categoryIds, clearCatalogCache } = createRequire(import.meta.url)(
  "../lib/mercadona.cjs",
);
test("acepta solo identificadores y enlaces de la tienda", () => {
  assert.equal(extractId("10005"), "10005");
  assert.equal(
    extractId("https://tienda.mercadona.es/product/10005/chocolate"),
    "10005",
  );
  assert.equal(extractId("https://evil.example/product/10005"), null);
});
test("convierte litros y no adivina envases ambiguos", () => {
  const p = {
    id: "1",
    display_name: "Producto",
    published: true,
    price_instructions: { unit_price: "2.45", unit_size: 1, size_format: "l" },
  };
  const result = normalizeProduct(p);
  assert.equal(result.size, 1000);
  assert.equal(result.unit, "ml");
  assert.equal(result.price, 2.45);
  assert.equal(
    normalizeProduct({
      ...p,
      price_instructions: { ...p.price_instructions, unit_price: null },
    }).price,
    null,
  );
  assert.equal(normalizeProduct({ ...p, is_variable_weight: true }).size, null);
  assert.equal(
    normalizeProduct({
      ...p,
      price_instructions: { ...p.price_instructions, is_pack: true },
    }).size,
    null,
  );
});
test("usa el almacén devuelto para 08191", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    return calls.length === 1
      ? { ok: true, headers: new Headers({ "x-customer-wh": "4362" }) }
      : {
          ok: true,
          json: async () => ({
            id: "1",
            display_name: "A",
            price_instructions: {
              unit_price: "2",
              unit_size: 1,
              size_format: "kg",
            },
          }),
        };
  };
  const result = await lookup("1", fetcher);
  assert.equal(JSON.parse(calls[0][1].body).new_postal_code, "08191");
  assert.match(calls[1][0], /wh=4362/);
  assert.equal(result.size, 1000);
});
test("rechaza almacén ausente y no consulta producto", async () => {
  let n = 0;
  await assert.rejects(
    lookup("1", async () => {
      n++;
      return { ok: true, headers: new Headers() };
    }),
    /almacén/,
  );
  assert.equal(n, 1);
});

test("valida el precio consultado y comunica disponibilidad sin prometer existencias", () => {
  assert.throws(() => requireMercadonaPrice({ price: null }), /precio válido/);
  assert.equal(requireMercadonaPrice({ price: 2 }).price, 2);
  assert.match(mercadonaResultMessage({ published: true, unavailable: false, warning: "Precio orientativo" }), /Precio orientativo/);
  assert.match(mercadonaResultMessage({ published: false, unavailable: true }), /disponibilidad no está confirmada/);
});

test("busca ingredientes en categorías de Mercadona y devuelve alternativas con precio y envase", async () => {
  clearCatalogCache();
  const calls = [];
  const products = [
    { id: "100", display_name: "Garbanzos cocidos Hacendado", published: true, price_instructions: { unit_price: "0.85", unit_size: 570, size_format: "g" } },
    { id: "101", display_name: "Garbanzos secos", published: true, price_instructions: { unit_price: "1.4", unit_size: 1, size_format: "kg" } },
  ];
  const fetcher = async (url, options = {}) => {
    calls.push(url);
    if (url.includes("change-pc")) {
      assert.equal(JSON.parse(options.body).new_postal_code, "08191");
      return new Response("{}", { headers: { "x-customer-wh": "cat08191" } });
    }
    if (url.includes("/categories/?")) return Response.json({ results: [{ id: 1, categories: [{ id: 2 }, { id: 3 }] }] });
    if (url.includes("/categories/2/")) return Response.json({ products: [products[0]] });
    if (url.includes("/categories/3/")) return Response.json({ products: [products[1]] });
    throw Error(`Unexpected request: ${url}`);
  };
  const matches = await searchProducts("garbanzos", fetcher);
  assert.deepEqual(matches.map((match) => match.id), ["100", "101"]);
  assert.equal(matches[1].size, 1000);
  await searchProducts("garbanzos", fetcher);
  assert.equal(calls.filter((url) => url.includes("/categories/")).length, 3);
  clearCatalogCache();
});

test("extrae categorías de segundo nivel para acotar la búsqueda", () => {
  assert.deepEqual(categoryIds({ results: [{ id: 1, categories: [{ id: 2 }, { id: 3 }] }, { id: 4, categories: [] }] }), [2, 3, 4]);
});
